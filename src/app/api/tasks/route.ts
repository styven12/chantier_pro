import { NextRequest, NextResponse } from 'next/server';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { InputError, jsonError, requirePositive, requireText } from '@/lib/http';

const ROLES = ['ENGINEER', 'RESOURCE_MANAGER', 'SITE_MANAGER'] as const;
function parseRatios(value: unknown) {
  if (!Array.isArray(value)) throw new InputError('Ajoutez au moins un ratio de matériau.');
  const seen = new Set<number>();
  return value.map((item) => {
    const materialId = Number(item?.materialId);
    if (!Number.isInteger(materialId) || materialId < 1 || seen.has(materialId)) throw new InputError('Matériau de ratio invalide ou répété.');
    seen.add(materialId);
    return { materialId, quantityPerUnit: requirePositive(item?.quantityPerUnit, 'Ratio') };
  });
}
async function ensureActiveMaterials(connection: PoolConnection, ratios: { materialId:number }[]) {
  if (!ratios.length) throw new InputError('Ajoutez au moins un ratio de matériau.');
  const ids=ratios.map((ratio)=>ratio.materialId);
  const [rows]=await connection.execute<RowDataPacket[]>(`SELECT id FROM materials WHERE is_active=TRUE AND id IN (${ids.map(()=>'?').join(',')})`,ids);
  if(rows.length!==ids.length)throw new InputError('Un des matériaux sélectionnés est inactif ou introuvable.');
}

export async function GET() {
  try {
    await requireUser([...ROLES]);
    const [tasks] = await db.execute<RowDataPacket[]>(
      `SELECT t.id,t.project_id,t.code,t.name,t.unit,t.planned_quantity,t.completed_quantity,
        t.progress_percent,t.target_daily_quantity,COALESCE(t.start_date,p.start_date) AS start_date,t.due_date,t.status,p.name AS project_name
       FROM tasks t JOIN projects p ON p.id=t.project_id
       WHERE t.is_active=TRUE AND p.is_active=TRUE ORDER BY p.id,t.id`,
    );
    const [ratios] = await db.execute<RowDataPacket[]>(
      `SELECT tm.task_id,tm.material_id,tm.quantity_per_unit,m.name AS material_name,m.unit AS material_unit
       FROM task_materials tm JOIN materials m ON m.id=tm.material_id WHERE m.is_active=TRUE ORDER BY tm.task_id,m.name`,
    );
    const byTask = new Map<number, RowDataPacket[]>();
    ratios.forEach((ratio) => byTask.set(Number(ratio.task_id), [...(byTask.get(Number(ratio.task_id)) ?? []), ratio]));
    return NextResponse.json({ tasks: tasks.map((task) => ({ ...task, ratios: byTask.get(Number(task.id)) ?? [] })) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: NextRequest) {
  let connection: PoolConnection | undefined;
  try {
    const user = await requireUser(['ENGINEER']);
    const body = await request.json();
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId) || projectId < 1) throw new InputError('Choisissez un chantier.');
    const name = requireText(body.name, 'Nom de la tâche');
    const unit = requireText(body.unit, 'Unité', 40);
    const quantity = requirePositive(body.plannedQuantity, 'Quantité prévue');
    const ratios = parseRatios(body.ratios);
    connection = await db.getConnection();
    await connection.beginTransaction();
    await ensureActiveMaterials(connection,ratios);
    const [projectRows]=await connection.execute<RowDataPacket[]>('SELECT id FROM projects WHERE id=? AND is_active=TRUE',[projectId]);
    if(!projectRows[0])throw new InputError('Chantier introuvable ou archivé.');
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO tasks (project_id,code,name,unit,planned_quantity,target_daily_quantity,start_date,due_date,status,created_by)
       VALUES (?,?,?,?,?,?,?,?, 'READY',?)`,
      [projectId, body.code ? String(body.code).slice(0, 40) : null, name, unit, quantity,
        body.targetDailyQuantity ? requirePositive(body.targetDailyQuantity, 'Production journalière') : null,
        body.startDate || null, body.dueDate || null, user.id],
    );
    const id = result.insertId;
    for (const ratio of ratios) await connection.execute(
      'INSERT INTO task_materials (task_id,material_id,quantity_per_unit) VALUES (?,?,?)',
      [id, ratio.materialId, ratio.quantityPerUnit],
    );
    await connection.commit();
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(error);
  } finally { connection?.release(); }
}

export async function PATCH(request: NextRequest) {
  let connection: PoolConnection | undefined;
  try {
    await requireUser(['ENGINEER']);
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) throw new InputError('Tâche invalide.');
    const projectId=Number(body.projectId);
    if(!Number.isInteger(projectId)||projectId<1)throw new InputError('Choisissez un chantier.');
    const ratios = parseRatios(body.ratios);
    connection = await db.getConnection();
    await connection.beginTransaction();
    await ensureActiveMaterials(connection,ratios);
    const [existingRows]=await connection.execute<RowDataPacket[]>('SELECT completed_quantity FROM tasks WHERE id=? AND is_active=TRUE FOR UPDATE',[id]);
    if(!existingRows[0])throw new InputError('Tâche introuvable.');
    const plannedQuantity=requirePositive(body.plannedQuantity,'Quantité prévue');
    if(Number(existingRows[0].completed_quantity)>plannedQuantity)throw new InputError('La quantité prévue ne peut pas être inférieure au déjà réalisé.');
    const [projectRows]=await connection.execute<RowDataPacket[]>('SELECT id FROM projects WHERE id=? AND is_active=TRUE',[projectId]);
    if(!projectRows[0])throw new InputError('Chantier introuvable ou archivé.');
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE tasks SET project_id=?,code=?,name=?,unit=?,planned_quantity=?,target_daily_quantity=?,start_date=?,due_date=?,status=?
       WHERE id=? AND is_active=TRUE`,
      [projectId, body.code ? String(body.code).slice(0, 40) : null, requireText(body.name, 'Nom de la tâche'),
        requireText(body.unit, 'Unité', 40), plannedQuantity,
        body.targetDailyQuantity ? requirePositive(body.targetDailyQuantity, 'Production journalière') : null,
        body.startDate || null, body.dueDate || null, ['DRAFT','READY','ACTIVE','COMPLETED'].includes(body.status) ? body.status : 'READY',
        id],
    );
    if (!result.affectedRows) {
      const [checkRows]=await connection.execute<RowDataPacket[]>('SELECT id FROM tasks WHERE id=? AND is_active=TRUE',[id]);
      if(!checkRows[0])throw new InputError('Tâche introuvable.');
    }
    await connection.execute('DELETE FROM task_materials WHERE task_id=?', [id]);
    for (const ratio of ratios) await connection.execute('INSERT INTO task_materials (task_id,material_id,quantity_per_unit) VALUES (?,?,?)', [id, ratio.materialId, ratio.quantityPerUnit]);
    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(error);
  } finally { connection?.release(); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(['ENGINEER']);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) throw new InputError('Tâche invalide.');
    await db.execute('UPDATE tasks SET is_active=FALSE WHERE id=?', [id]);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

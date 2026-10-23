import { NextRequest, NextResponse } from 'next/server';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { InputError, jsonError, requirePositive } from '@/lib/http';
import { predictTask, type ProgressSample } from '@/lib/prediction';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(['ENGINEER', 'RESOURCE_MANAGER', 'SITE_MANAGER']);
    const taskId = request.nextUrl.searchParams.get('taskId');
    const [reports] = await db.execute<RowDataPacket[]>(
      `SELECT r.id,r.task_id,r.report_date,r.progress_quantity,r.progress_percent_delta,r.note,r.created_at,
        t.name AS task_name,t.unit AS task_unit,p.name AS project_name,u.full_name AS created_by_name
       FROM daily_reports r JOIN tasks t ON t.id=r.task_id JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=r.created_by
       WHERE p.is_active=TRUE AND (? IS NULL OR r.task_id=?)
        AND (?='ENGINEER' OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=?))
       ORDER BY r.report_date DESC,r.id DESC LIMIT 100`,
      [taskId, taskId, user.role, user.id],
    );
    const ids = reports.map((r) => Number(r.id));
    let materials: RowDataPacket[] = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT rm.report_id,rm.quantity,m.name,m.unit FROM report_materials rm JOIN materials m ON m.id=rm.material_id WHERE rm.report_id IN (${placeholders})`, ids,
      );
      materials = rows;
    }
    return NextResponse.json({ reports: reports.map((r) => ({
      ...r,
      note: typeof r.note === 'string' ? r.note.replace(/^\[DEMO-AVANCEMENT-\d+\]\s*/, '') : r.note,
      materials: materials.filter((m) => Number(m.report_id) === Number(r.id)),
    })) });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: NextRequest) {
  let connection: PoolConnection | undefined;
  try {
    const user = await requireUser(['SITE_MANAGER']);
    const body = await request.json();
    const taskId = Number(body.taskId);
    if (!Number.isInteger(taskId) || taskId < 1) throw new InputError('Choisissez une tâche.');
    const progressQuantity = requirePositive(body.progressQuantity, 'Quantité réalisée');
    const percentDelta = body.progressPercent === undefined || body.progressPercent === ''
      ? null : requirePositive(body.progressPercent, 'Avancement du jour', true);
    if (percentDelta !== null && percentDelta > 100) throw new InputError('L’avancement du jour ne peut pas dépasser 100 %.');
    const reportDate = body.reportDate || new Date().toISOString().slice(0, 10);
    if (typeof reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new InputError('Date du relevé invalide.');
    if (!Array.isArray(body.materials)) throw new InputError('La liste des matériaux consommés est invalide.');
    const usages = body.materials.map((item: any) => ({
      materialId: Number(item?.materialId), quantity: requirePositive(item?.quantity, 'Quantité consommée'),
    }));
    usages.sort((a: {materialId:number},b: {materialId:number})=>a.materialId-b.materialId);
    if (usages.some((x: { materialId: number }) => !Number.isInteger(x.materialId) || x.materialId < 1)) throw new InputError('Matériau consommé invalide.');
    if (new Set(usages.map((x: { materialId: number }) => x.materialId)).size !== usages.length) throw new InputError('Un matériau ne peut apparaître qu’une fois dans le relevé.');

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [taskRows] = await connection.execute<RowDataPacket[]>(
      `SELECT t.id,t.project_id,t.planned_quantity,t.completed_quantity,t.progress_percent,t.target_daily_quantity,COALESCE(t.start_date,p.start_date) AS start_date,t.due_date,t.status
       FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND t.is_active=TRUE AND t.status IN ('READY','ACTIVE') AND p.is_active=TRUE
        AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=?) FOR UPDATE`, [taskId, user.id],
    );
    const task = taskRows[0];
    if (!task) throw new InputError('Cette tâche n’est pas disponible dans le carnet de chantier.');
    if (Number(task.completed_quantity) + progressQuantity > Number(task.planned_quantity) + 0.00001) throw new InputError('La quantité saisie dépasse le restant à réaliser.');
    const computedDelta = progressQuantity / Number(task.planned_quantity) * 100;
    const delta = percentDelta ?? computedDelta;
    if (Number(task.progress_percent) + delta > 100.001) throw new InputError('L’avancement cumulé dépasserait 100 %.');

    const allowed = new Set<number>();
    const [ratios] = await connection.execute<RowDataPacket[]>('SELECT material_id FROM task_materials WHERE task_id=?', [taskId]);
    ratios.forEach((ratio) => allowed.add(Number(ratio.material_id)));
    if (ratios.length > 0 && usages.length === 0) throw new InputError('Ajoutez au moins une consommation de matériau pour cette tâche.');
    if (ratios.length > 0 && usages.some((usage: { materialId: number }) => !allowed.has(usage.materialId))) throw new InputError('Un matériau saisi ne fait pas partie du besoin défini pour cette tâche.');
    for (const usage of usages) {
      const [stockRows] = await connection.execute<RowDataPacket[]>('SELECT current_stock,name,unit FROM materials WHERE id=? AND is_active=TRUE FOR UPDATE', [usage.materialId]);
      if (!stockRows[0]) throw new InputError('Un matériau a été désactivé. Actualisez puis recommencez.');
      if (Number(stockRows[0].current_stock) < usage.quantity) throw new InputError(`Stock insuffisant pour ${stockRows[0].name} : ${Number(stockRows[0].current_stock)} ${stockRows[0].unit} disponible(s).`);
    }

    const [reportResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO daily_reports (task_id,report_date,progress_quantity,progress_percent_delta,note,created_by)
       VALUES (?,?,?,?,?,?)`,
      [taskId, reportDate, progressQuantity, delta, typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null, user.id],
    );
    const reportId = reportResult.insertId;
    const nextQuantity = Number(task.completed_quantity) + progressQuantity;
    const nextPercent = Math.min(100, Number(task.progress_percent) + delta);
    const nextStatus = nextQuantity >= Number(task.planned_quantity) - 0.00001 || nextPercent >= 99.999 ? 'COMPLETED' : 'ACTIVE';
    await connection.execute('UPDATE tasks SET completed_quantity=?,progress_percent=?,status=? WHERE id=?', [nextQuantity, nextPercent, nextStatus, taskId]);
    for (const usage of usages) {
      const [stockRows] = await connection.execute<RowDataPacket[]>('SELECT current_stock FROM materials WHERE id=? FOR UPDATE', [usage.materialId]);
      const balance = Number(stockRows[0].current_stock) - usage.quantity;
      await connection.execute('INSERT INTO report_materials (report_id,material_id,quantity) VALUES (?,?,?)', [reportId, usage.materialId, usage.quantity]);
      await connection.execute('UPDATE materials SET current_stock=? WHERE id=?', [balance, usage.materialId]);
      await connection.execute(
        `INSERT INTO stock_movements (material_id,movement_type,quantity,balance_after,report_id,note,created_by)
         VALUES (?,'OUT',?,?,?,?,?)`, [usage.materialId, usage.quantity, balance, reportId, `Consommation du relevé #${reportId}`, user.id],
      );
    }

    const [samples] = await connection.execute<RowDataPacket[]>(
      'SELECT report_date,progress_quantity FROM daily_reports WHERE task_id=? AND report_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY)', [taskId],
    );
    const predictionSamples: ProgressSample[] = samples.map((sample) => ({
      report_date: sample.report_date,
      progress_quantity: Number(sample.progress_quantity),
    }));
    const [materialUseRows] = await connection.execute<RowDataPacket[]>(
      `SELECT tm.material_id,tm.quantity_per_unit * ? AS expected,COALESCE(mu.consumed,0) AS consumed
       FROM task_materials tm LEFT JOIN (
         SELECT rm.material_id,SUM(rm.quantity) AS consumed FROM report_materials rm
         JOIN daily_reports dr ON dr.id=rm.report_id WHERE dr.task_id=? GROUP BY rm.material_id
       ) mu ON mu.material_id=tm.material_id WHERE tm.task_id=?`,
      [nextQuantity, taskId, taskId],
    );
    const varianceValues = materialUseRows.map((row) => Number(row.expected) > 0 ? Number(row.consumed) / Number(row.expected) - 1 : 0);
    const overrun = varianceValues.length ? varianceValues.reduce((sum, value) => sum + value, 0) / varianceValues.length : 0;
    const prediction = predictTask({
      plannedQuantity: Number(task.planned_quantity), completedQuantity: nextQuantity, progressPercent: nextPercent,
      startDate: task.start_date, dueDate: task.due_date, targetDailyQuantity: task.target_daily_quantity, overrunRatio: overrun, samples: predictionSamples,
    });
    await connection.execute(
      `INSERT INTO prediction_snapshots
       (project_id,task_id,baseline_percent,predicted_percent_7d,logistic_success_probability,normal_success_probability,uniform_success_probability,sample_days)
       VALUES (?,?,?,?,?,?,?,?)`,
      [task.project_id, taskId, nextPercent, prediction.predictedPercent7d, prediction.logisticProbability,
       prediction.normalProbability, prediction.uniformProbability, prediction.sampleDays],
    );
    await connection.commit();
    return NextResponse.json({ ok: true, reportId, progressPercent: nextPercent, stockDeducted: true }, { status: 201 });
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(error);
  } finally { connection?.release(); }
}

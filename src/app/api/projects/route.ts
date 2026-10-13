import { NextRequest, NextResponse } from 'next/server';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { InputError, jsonError, requireText } from '@/lib/http';

export async function GET() {
  try {
    await requireUser(['ENGINEER', 'RESOURCE_MANAGER', 'SITE_MANAGER']);
    const [projects] = await db.execute<RowDataPacket[]>(
      `SELECT p.id,p.name,p.project_type,p.description,p.reference_code,p.location,p.built_area_m2,p.floor_count,p.estimated_budget,p.currency,p.status,p.start_date,p.target_end_date,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.is_active=TRUE) AS task_count,
        (SELECT COALESCE(AVG(t.progress_percent),0) FROM tasks t WHERE t.project_id=p.id AND t.is_active=TRUE) AS progress_percent
       FROM projects p WHERE p.is_active=TRUE ORDER BY p.id`,
    );
    return NextResponse.json({ projects });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(['ENGINEER']);
    const body = await request.json();
    const name = requireText(body.name, 'Nom du chantier');
    const location = typeof body.location === 'string' ? body.location.trim().slice(0, 180) : '';
    const code = typeof body.referenceCode === 'string' ? body.referenceCode.trim().slice(0, 60) || null : null;
    const projectType = typeof body.projectType === 'string' ? body.projectType.trim().slice(0, 100) || null : null;
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) || null : null;
    const builtArea = body.builtAreaM2 === '' || body.builtAreaM2 == null ? null : Number(body.builtAreaM2);
    const floorCount = body.floorCount === '' || body.floorCount == null ? null : Number(body.floorCount);
    const budget = body.estimatedBudget === '' || body.estimatedBudget == null ? null : Number(body.estimatedBudget);
    if (builtArea !== null && (!Number.isFinite(builtArea) || builtArea <= 0)) throw new InputError('La surface doit être supérieure à zéro.');
    if (floorCount !== null && (!Number.isInteger(floorCount) || floorCount < 1)) throw new InputError('Le nombre de niveaux est invalide.');
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new InputError('Le budget estimé est invalide.');
    const startDate = typeof body.startDate === 'string' && body.startDate ? body.startDate : null;
    const targetEndDate = typeof body.targetEndDate === 'string' && body.targetEndDate ? body.targetEndDate : null;
    const [result] = await db.execute<ResultSetHeader>(
      'INSERT INTO projects (name,project_type,description,reference_code,location,built_area_m2,floor_count,estimated_budget,currency,start_date,target_end_date,status,created_by) VALUES (?,?,?,?,?,?,?,?,\'XOF\',?,?,\'PLANNING\',?)',
      [name, projectType, description, code, location || null, builtArea, floorCount, budget, startDate, targetEndDate, user.id],
    );
    return NextResponse.json({ id: result.insertId }, { status: 201 });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireUser(['ENGINEER']);
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) throw new InputError('Chantier invalide.');
    const name = requireText(body.name, 'Nom du chantier');
    const projectType = typeof body.projectType === 'string' ? body.projectType.trim().slice(0, 100) || null : null;
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) || null : null;
    const builtArea = body.builtAreaM2 === '' || body.builtAreaM2 == null ? null : Number(body.builtAreaM2);
    const floorCount = body.floorCount === '' || body.floorCount == null ? null : Number(body.floorCount);
    const budget = body.estimatedBudget === '' || body.estimatedBudget == null ? null : Number(body.estimatedBudget);
    if (builtArea !== null && (!Number.isFinite(builtArea) || builtArea <= 0)) throw new InputError('La surface doit être supérieure à zéro.');
    if (floorCount !== null && (!Number.isInteger(floorCount) || floorCount < 1)) throw new InputError('Le nombre de niveaux est invalide.');
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new InputError('Le budget estimé est invalide.');
    const [result] = await db.execute<ResultSetHeader>(
      'UPDATE projects SET name=?,project_type=?,description=?,reference_code=?,location=?,built_area_m2=?,floor_count=?,estimated_budget=?,start_date=?,target_end_date=?,status=? WHERE id=? AND is_active=TRUE',
      [name, projectType, description, body.referenceCode || null, body.location || null, builtArea, floorCount, budget, body.startDate || null, body.targetEndDate || null,
        ['PLANNING','ACTIVE','PAUSED','COMPLETED'].includes(body.status) ? body.status : 'ACTIVE', id],
    );
    if (!result.affectedRows) throw new InputError('Chantier introuvable.');
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(['ENGINEER']);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) throw new InputError('Chantier invalide.');
    await db.execute('UPDATE projects SET is_active=FALSE WHERE id=?', [id]);
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

import { NextRequest, NextResponse } from 'next/server';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { InputError, jsonError, requirePositive, requireText } from '@/lib/http';

export async function GET() {
  try {
    await requireUser(['ENGINEER', 'RESOURCE_MANAGER', 'SITE_MANAGER']);
    const [materials] = await db.execute<RowDataPacket[]>(
      `SELECT m.id,m.name,m.unit,m.current_stock,m.minimum_stock,
        (SELECT COALESCE(SUM(rm.quantity),0) FROM report_materials rm JOIN daily_reports dr ON dr.id=rm.report_id WHERE rm.material_id=m.id) AS consumed_total
       FROM materials m WHERE m.is_active=TRUE ORDER BY m.name`,
    );
    return NextResponse.json({ materials });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: NextRequest) {
  let connection: PoolConnection | undefined;
  try {
    const user = await requireUser(['RESOURCE_MANAGER']);
    const body = await request.json();
    const name = requireText(body.name, 'Nom du matériau', 140);
    const unit = requireText(body.unit, 'Unité', 50);
    const stock = requirePositive(body.stock ?? 0, 'Stock initial', true);
    const minimum = requirePositive(body.minimumStock ?? 0, 'Seuil de stock', true);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO materials (name,unit,current_stock,minimum_stock) VALUES (?,?,?,?)', [name, unit, stock, minimum],
    );
    if (stock > 0) await connection.execute(
      `INSERT INTO stock_movements (material_id,movement_type,quantity,balance_after,note,created_by)
       VALUES (?,'OPENING',?,?, 'Stock initial enregistré',?)`, [result.insertId, stock, stock, user.id],
    );
    await connection.commit();
    return NextResponse.json({ id: result.insertId }, { status: 201 });
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(error);
  } finally { connection?.release(); }
}

export async function PATCH(request: NextRequest) {
  let connection: PoolConnection | undefined;
  try {
    const user = await requireUser(['RESOURCE_MANAGER']);
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) throw new InputError('Matériau invalide.');
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT current_stock,name,unit FROM materials WHERE id=? AND is_active=TRUE FOR UPDATE', [id]);
    if (!rows[0]) throw new InputError('Matériau introuvable.');
    const currentStock = Number(rows[0].current_stock);
    const nextStock = body.stock === undefined ? currentStock : requirePositive(body.stock, 'Stock', true);
    const minimum = body.minimumStock === undefined ? null : requirePositive(body.minimumStock, 'Seuil de stock', true);
    await connection.execute(
      `UPDATE materials SET name=?,unit=?,current_stock=?,minimum_stock=COALESCE(?,minimum_stock)
       WHERE id=? AND is_active=TRUE`,
      [body.name === undefined ? rows[0].name : requireText(body.name, 'Nom du matériau', 140),
       body.unit === undefined ? rows[0].unit : requireText(body.unit, 'Unité', 50), nextStock, minimum, id],
    );
    const delta = nextStock - currentStock;
    if (delta !== 0) await connection.execute(
      `INSERT INTO stock_movements (material_id,movement_type,quantity,balance_after,note,created_by)
       VALUES (?,'ADJUSTMENT',?,?,?,?)`,
      [id, delta, nextStock, body.stockNote ? String(body.stockNote).slice(0, 500) : 'Ajustement de stock par le responsable ressources', user.id],
    );
    await connection.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (connection) await connection.rollback();
    return jsonError(error);
  } finally { connection?.release(); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(['RESOURCE_MANAGER']);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) throw new InputError('Matériau invalide.');
    const [result] = await db.execute<ResultSetHeader>('UPDATE materials SET is_active=FALSE WHERE id=?', [id]);
    if (!result.affectedRows) throw new InputError('Matériau introuvable.');
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

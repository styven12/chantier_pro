import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { RowDataPacket } from 'mysql2/promise';
import { db } from '@/lib/db';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { InputError, jsonError, requireText } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = requireText(body.name, 'Nom', 80).toLocaleLowerCase('fr');
    const accessCode = requireText(body.accessCode, 'Code d’accès', 80);
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, full_name, username, role, access_code_hash
       FROM users WHERE (LOWER(full_name)=? OR LOWER(username)=?) AND is_active=TRUE LIMIT 1`,
      [username, username],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(accessCode, user.access_code_hash))) throw new InputError('Nom ou code d’accès incorrect.');
    const sessionUser = { id: Number(user.id), fullName: user.full_name as string, username: user.username as string, role: user.role };
    await setSessionCookie(await createSessionToken(sessionUser));
    return NextResponse.json({ user: sessionUser });
  } catch (error) { return jsonError(error); }
}

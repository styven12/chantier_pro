import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { RowDataPacket } from 'mysql2/promise';
import { db } from '@/lib/db';

export const SESSION_COOKIE = 'chantier_session';
const SESSION_AGE_SECONDS = 60 * 60 * 8;
const secretText = process.env.APP_SESSION_SECRET;

function sessionKey() {
  if (!secretText || secretText.length < 32) throw new Error('APP_SESSION_SECRET doit contenir au moins 32 caractères.');
  return new TextEncoder().encode(secretText);
}

export type Role = 'ENGINEER' | 'RESOURCE_MANAGER' | 'SITE_MANAGER' | 'ANALYST';
export type AppUser = { id: number; fullName: string; username: string; role: Role };
export class AuthError extends Error { constructor(public status: 401 | 403, message: string) { super(message); } }

export async function createSessionToken(user: AppUser) {
  return new SignJWT({ role: user.role, name: user.fullName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_AGE_SECONDS}s`)
    .sign(sessionKey());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    if (!payload.sub) return null;
    const [rows] = await db.execute<RowDataPacket[]>(
      'SELECT id, full_name, username, role FROM users WHERE id=? AND is_active=TRUE LIMIT 1',
      [payload.sub],
    );
    if (!rows[0]) return null;
    return { id: Number(rows[0].id), fullName: rows[0].full_name, username: rows[0].username, role: rows[0].role };
  } catch {
    return null;
  }
}

export async function requireUser(allowed?: Role[]): Promise<AppUser> {
  const user = await getSession();
  if (!user) throw new AuthError(401, 'Veuillez vous connecter.');
  if (allowed && !allowed.includes(user.role)) throw new AuthError(403, 'Vous n’avez pas les droits pour cette action.');
  return user;
}

export async function verifyAccessCode(code: string, hash: string) {
  return bcrypt.compare(code, hash);
}

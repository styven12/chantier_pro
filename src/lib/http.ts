import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth';

export class InputError extends Error { constructor(message: string) { super(message); } }

export function jsonError(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Données JSON invalides.' }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: 'Une erreur est survenue côté serveur.' }, { status: 500 });
}

export function requireText(value: unknown, label: string, max = 180) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new InputError(`${label} est obligatoire (maximum ${max} caractères).`);
  return value.trim();
}

export function requirePositive(value: unknown, label: string, allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) throw new InputError(`${label} doit être ${allowZero ? 'positif ou nul' : 'supérieur à zéro'}.`);
  return number;
}

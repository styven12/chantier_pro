import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';

declare global {
  // eslint-disable-next-line no-var
  var chantierPool: Pool | undefined;
}

export const db = globalThis.chantierPool ?? mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'chantier_pro',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: 'Z',
});

if (process.env.NODE_ENV !== 'production') globalThis.chantierPool = db;

const DB_KEEPALIVE_INTERVAL_MS = 2 * 60 * 60 * 1000;

export async function register() {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.DB_KEEPALIVE_ENABLED !== 'true'
  ) {
    return;
  }

  const { db } = await import('./lib/db');
  const timer = setInterval(() => {
    void db.query('SELECT 1').catch((error: unknown) => {
      console.error('[db-keepalive] Échec de la requête de maintien MySQL.', error);
    });
  }, DB_KEEPALIVE_INTERVAL_MS);

  timer.unref();
}

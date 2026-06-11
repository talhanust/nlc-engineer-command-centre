import { Pool, QueryResultRow } from 'pg';

/**
 * Single shared connection pool. Connection params come from the environment
 * (see .env.example). The schema lives in the `fnpc` search_path.
 */
export const pool = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'fnpc',
  user: process.env.PGUSER ?? 'fnpc_app',
  password: process.env.PGPASSWORD ?? '',
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

/** Thin typed query helper. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params as any[]);
  return res.rows;
}

/** Run a function inside a transaction, rolling back on error. */
export async function withTransaction<T>(
  fn: (q: (text: string, params?: unknown[]) => Promise<QueryResultRow[]>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = async (text: string, params: unknown[] = []) =>
      (await client.query(text, params as any[])).rows;
    const out = await fn(q);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

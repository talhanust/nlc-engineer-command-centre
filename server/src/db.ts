import { Pool, QueryResultRow } from 'pg';

/**
 * Single shared connection pool.
 *
 * Render (and most managed Postgres hosts) inject a single DATABASE_URL and
 * require TLS. When DATABASE_URL is present we use it and enable SSL; locally
 * we fall back to discrete PG* vars (see .env.example). Set PGSSL=disable to
 * force-disable TLS (e.g. a local server without certificates).
 */
const useUrl = !!process.env.DATABASE_URL;
const sslEnabled = useUrl ? process.env.PGSSL !== 'disable' : process.env.PGSSL === 'require';

export const pool = new Pool(
  useUrl
    ? {
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PG_POOL_MAX ?? 10),
        ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? 'fnpc',
        user: process.env.PGUSER ?? 'fnpc_app',
        password: process.env.PGPASSWORD ?? '',
        max: Number(process.env.PG_POOL_MAX ?? 10),
        ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
      },
);

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

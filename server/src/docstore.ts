import { query } from './db';

/**
 * Thin JSONB document store over fnpc.app_doc. Operating-model entities are
 * persisted as documents keyed exactly like the SPA's local store
 * (e.g. `alloc:proj-f14f15`, `boqwf:proj-f14f15`). This keeps the api-mode
 * behaviour identical to the offline demo without a table per entity.
 *
 * The query function is injectable so the logic is unit-testable without a DB.
 */
export type QueryFn = <T extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

export function makeDocStore(q: QueryFn = query as unknown as QueryFn) {
  return {
    async get<T>(key: string, fallback: T): Promise<T> {
      const rows = await q<{ value: T }>(`SELECT value FROM fnpc.app_doc WHERE scope_key = $1`, [key]);
      return rows.length ? rows[0].value : fallback;
    },
    async set<T>(key: string, value: T): Promise<T> {
      await q(
        `INSERT INTO fnpc.app_doc (scope_key, value, updated_at)
           VALUES ($1, $2::jsonb, now())
         ON CONFLICT (scope_key)
           DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
      return value;
    },
    /** All documents as a { key: value } map (for hydrate). */
    async list(): Promise<Record<string, unknown>> {
      const rows = await q<{ scope_key: string; value: unknown }>(`SELECT scope_key, value FROM fnpc.app_doc`);
      const out: Record<string, unknown> = {};
      for (const r of rows) out[r.scope_key] = r.value;
      return out;
    },
    async del(key: string): Promise<void> {
      await q(`DELETE FROM fnpc.app_doc WHERE scope_key = $1`, [key]);
    },
  };
}

export type DocStore = ReturnType<typeof makeDocStore>;
export const docs = makeDocStore();

import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { makeDocStore, type QueryFn } from '../src/docstore';

// Spin up an in-memory Postgres, create the fnpc.app_doc table exactly as the
// migration does, and exercise the real docstore SQL (the same SQL the
// /api/state routes run): JSONB cast, ON CONFLICT upsert, select-all, delete.
function makeStore() {
  const db = newDb();
  db.public.none(`
    CREATE SCHEMA IF NOT EXISTS fnpc;
    CREATE TABLE fnpc.app_doc (
      scope_key  TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const q: QueryFn = async (text, params = []) => (await pool.query(text, params)).rows;
  return makeDocStore(q);
}

describe('/api/state SQL against pg-mem', () => {
  let store: ReturnType<typeof makeStore>;
  beforeEach(() => { store = makeStore(); });

  it('upserts and reads back a JSONB document', async () => {
    const doc = [{ id: 'alloc-1', executionType: 'sublet', qty: 200, rate: 900000 }];
    await store.set('nlc-ecc.alloc.proj-f14f15', doc);
    const back = await store.get('nlc-ecc.alloc.proj-f14f15', []);
    expect(back).toEqual(doc); // JSONB round-trips structurally
  });

  it('ON CONFLICT updates in place (last-write-wins, no duplicate row)', async () => {
    await store.set('nlc-ecc.boqwf.proj-f14f15', { stageIndex: 0, locked: false, voCount: 0 });
    await store.set('nlc-ecc.boqwf.proj-f14f15', { stageIndex: 3, locked: true, voCount: 1 });
    expect(await store.get('nlc-ecc.boqwf.proj-f14f15', null)).toEqual({ stageIndex: 3, locked: true, voCount: 1 });
    const all = await store.list();
    expect(Object.keys(all)).toHaveLength(1); // upsert, not insert
  });

  it('lists all documents as a key→value map (hydrate shape)', async () => {
    await store.set('nlc-ecc.overheads.proj-f14f15', [{ category: 'Salaries', plannedCost: 8500000 }]);
    await store.set('nlc-ecc.hr.proj-f14f15', [{ category: 'Engineers', posted: 10 }]);
    const all = await store.list();
    expect(Object.keys(all).sort()).toEqual(['nlc-ecc.hr.proj-f14f15', 'nlc-ecc.overheads.proj-f14f15']);
    expect((all['nlc-ecc.overheads.proj-f14f15'] as any[])[0].plannedCost).toBe(8500000);
  });

  it('returns the fallback for an absent key and deletes a document', async () => {
    expect(await store.get('missing', [])).toEqual([]);
    await store.set('nlc-ecc.progress.proj-f14f15', [{ executedQty: 25 }]);
    await store.del('nlc-ecc.progress.proj-f14f15');
    expect(await store.get('nlc-ecc.progress.proj-f14f15', null)).toBeNull();
  });
});

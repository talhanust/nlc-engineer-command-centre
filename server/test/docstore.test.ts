import { describe, it, expect } from 'vitest';
import { makeDocStore, type QueryFn } from '../src/docstore';

/** In-memory fake of the pg query() that understands the docstore's SQL. */
function fakeDb() {
  const table = new Map<string, unknown>();
  const calls: string[] = [];
  const q: QueryFn = async (text, params = []) => {
    calls.push(text.trim().split('\n')[0]);
    if (text.includes('SELECT value FROM fnpc.app_doc')) {
      const key = params[0] as string;
      return table.has(key) ? [{ value: table.get(key) } as any] : [];
    }
    if (text.includes('INSERT INTO fnpc.app_doc')) {
      const [key, json] = params as [string, string];
      table.set(key, JSON.parse(json));
      return [];
    }
    if (text.includes('SELECT scope_key, value')) {
      return [...table.entries()].map(([scope_key, value]) => ({ scope_key, value } as any));
    }
    return [];
  };
  return { q, table, calls };
}

describe('docstore', () => {
  it('returns the fallback when a key is absent', async () => {
    const { q } = fakeDb();
    const store = makeDocStore(q);
    expect(await store.get('alloc:p1', [])).toEqual([]);
    expect(await store.get('boqwf:p1', { stageIndex: 0 })).toEqual({ stageIndex: 0 });
  });

  it('round-trips a set then get (JSONB upsert)', async () => {
    const { q } = fakeDb();
    const store = makeDocStore(q);
    const doc = [{ id: 'a1', qty: 5, executionType: 'sublet' }];
    await store.set('alloc:p1', doc);
    expect(await store.get('alloc:p1', [])).toEqual(doc);
  });

  it('overwrites on a second set (last-write-wins)', async () => {
    const { q } = fakeDb();
    const store = makeDocStore(q);
    await store.set('boqwf:p1', { stageIndex: 0, locked: false });
    await store.set('boqwf:p1', { stageIndex: 4, locked: true });
    expect(await store.get('boqwf:p1', null)).toEqual({ stageIndex: 4, locked: true });
  });

  it('keeps documents independent across keys (hydrate shape)', async () => {
    const { q, table } = fakeDb();
    const store = makeDocStore(q);
    await store.set('alloc:p1', [1, 2]);
    await store.set('overheads:p1', [{ category: 'Salaries' }]);
    expect(table.size).toBe(2);
    const all = [...table.keys()].sort();
    expect(all).toEqual(['alloc:p1', 'overheads:p1']);
  });

  it('round-trips commercial entities (variations / guarantees / escalation) as JSONB docs', async () => {
    const { q } = fakeDb();
    const store = makeDocStore(q);
    const vos = [{ id: 'vo-1', voNo: 'VO-01', type: 'addition', amount: 185_000_000, status: 'approved' }];
    await store.set('nlc-ecc.variations.proj-f14f15', vos);
    await store.set('nlc-ecc.bankguarantees.proj-f14f15', [{ bgNo: 'BG-1', amount: 500, status: 'active' }]);
    await store.set('nlc-ecc.escindices.proj-f14f15', [{ label: 'Steel', weight: 0.3, baseIndex: 100, currentIndex: 120 }]);
    expect(await store.get('nlc-ecc.variations.proj-f14f15', [])).toEqual(vos);
    const all = await store.list();
    expect(Object.keys(all)).toContain('nlc-ecc.bankguarantees.proj-f14f15');
    expect(Object.keys(all)).toContain('nlc-ecc.escindices.proj-f14f15');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';
import { lineType, countsToEarnedValue } from '../domain/boqLineType';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const P = 'proj-lt';

describe('BOQ line type through the provider', () => {
  let p: LocalDataProvider;
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('infers provisional for a PS-unit row on import — the Toll Plaza', async () => {
    const boq = await p.replaceBoq(P, [
      { billNo: '1', code: '101', description: 'Clearing & grubbing', unit: 'Sqm', qty: 1000, rate: 37 },
      { billNo: '6a', code: '109', description: 'Remodeling of Toll Plaza', unit: 'PS', qty: 1, rate: 200_000_000 },
    ]);
    expect(lineType(boq.find((b) => b.code === '101')!)).toBe('measured');
    expect(lineType(boq.find((b) => b.code === '109')!)).toBe('provisional');
    // …and the provisional sum is therefore held out of earned value.
    expect(countsToEarnedValue(boq.find((b) => b.code === '109')!)).toBe(false);
  });

  it('preserves an explicit line type across a re-import', async () => {
    await p.replaceBoq(P, [{ billNo: '1', code: '201', description: 'Street lighting', unit: 'Item', qty: 1, rate: 500 }]);
    const boq = await p.listBoq(P);
    // 'Item' inferred as lump_sum; make it prime_cost by hand.
    await p.setBoqLineType(P, boq[0].id, 'prime_cost');
    const reimported = await p.replaceBoq(P, [{ billNo: '1', code: '201', description: 'Street lighting', unit: 'Item', qty: 1, rate: 500, lineType: 'prime_cost' }]);
    expect(lineType(reimported[0])).toBe('prime_cost');
  });

  it('setBoqLineType changes one item and audits it', async () => {
    const boq = await p.replaceBoq(P, [{ billNo: '1', code: '301', description: 'Utility diversions', unit: 'LS', qty: 1, rate: 1000 }]);
    await p.setBoqLineType(P, boq[0].id, 'provisional');
    expect(lineType((await p.listBoq(P))[0])).toBe('provisional');
    expect((await p.listAudit()).some((a) => a.entity === 'BoqItem' && /line type/.test(a.detail ?? ''))).toBe(true);
  });
});

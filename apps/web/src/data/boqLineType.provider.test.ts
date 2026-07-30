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

describe('lump sum billed by percentage complete — end to end', () => {
  let p2: LocalDataProvider;
  const PP = 'proj-lump';
  beforeEach(async () => {
    setKvStore(memKv());
    p2 = new LocalDataProvider();
    await p2.replaceBoq(PP, [
      { billNo: '7', code: 'SP-701a', description: 'Provide surveying & allied instruments', unit: 'LS', qty: 1, rate: 2_000_000, lineType: 'lump_sum' },
    ]);
  });

  it('a lump sum at 40% complete earns 40% of its value', async () => {
    const boq = await p2.listBoq(PP);
    const id = boq[0].id;
    // Progress stores the executed "quantity"; 40% of a qty-1 lump = 0.4.
    await p2.upsertProgress(PP, { boqItemId: id, period: 'M1', executedQty: 0.4, role: 'sc' });
    for (const pr of await p2.listProgress(PP)) await p2.validateProgress(PP, pr.id, 'pm');

    const { executedValueToDate } = await import('../domain/progress');
    const items = await p2.listBoq(PP);
    const updates = await p2.listProgress(PP);
    expect(executedValueToDate(items, updates)).toBeCloseTo(0.4 * 2_000_000, 2); // Rs 800,000
  });

  it('the incurred value reaches the full lump at 100%, not beyond', async () => {
    const boq = await p2.listBoq(PP);
    const id = boq[0].id;
    await p2.upsertProgress(PP, { boqItemId: id, period: 'M1', executedQty: 1, role: 'sc' });
    for (const pr of await p2.listProgress(PP)) await p2.validateProgress(PP, pr.id, 'pm');
    const { executedValueToDate } = await import('../domain/progress');
    expect(executedValueToDate(await p2.listBoq(PP), await p2.listProgress(PP))).toBeCloseTo(2_000_000, 2);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { rarSettlement, allowedRecoveryKinds, isLabourContractor, rarRecoveryTotal } from './rarRecovery';
import { LocalDataProvider, setKvStore, type KvStore } from '../data/LocalDataProvider';
import type { RarRecovery } from '../data/types';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const cfg = { rarIncomeTaxPct: 7, rarGstPct: 0 };

describe('RAR recovery model', () => {
  it('settles gross less retention, taxes and recoveries (no IPC)', () => {
    const recoveries: RarRecovery[] = [
      { id: '1', kind: 'material', description: 'cement', amount: 100 },
      { id: '2', kind: 'machinery', description: 'roller', amount: 30 },
      { id: '3', kind: 'other', description: 'penalty', amount: 20 },
    ];
    const s = rarSettlement({ gross: 1000, retentionPct: 5, cfg, recoveries });
    expect(s.retention).toBe(50);
    expect(s.incomeTax).toBe(70);
    expect(s.recoveryTotal).toBe(150);
    expect(s.net).toBe(1000 - 50 - 70 - 150); // 730
  });

  it('labour contracts allow only "other" recoveries', () => {
    expect(isLabourContractor({ kind: 'labor' })).toBe(true);
    expect(allowedRecoveryKinds({ kind: 'labor' })).toEqual(['other']);
    expect(allowedRecoveryKinds({ kind: 'sublet' })).toEqual(['material', 'machinery', 'other']);
    expect(rarRecoveryTotal([{ id: '1', kind: 'other', description: 'x', amount: 42 }])).toBe(42);
  });
});

describe('RAR recovery persistence', () => {
  let p: LocalDataProvider;
  const F = 'proj-f14f15';
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('persists recoveries and recomputes net payable', async () => {
    const boq = await p.listBoq(F);
    const c = await p.createSubletContract(F, {
      title: 'T', kind: 'sublet', subcontractor: { name: 'Recovery Co', trade: 'Earthworks' },
      lines: [{ boqItemId: boq[0].id, qty: 100, rate: 90 }],
    });
    await p.createRar(F, {
      period: 'M1', subcontractorId: c.subcontractorId, contractId: c.id, gross: 5_000_000,
      lines: [{ boqItemId: boq[0].id, qty: 100, rate: 90, amount: 9000 }],
    });
    const rars = await p.listRars(F);
    const r = rars[0];
    const before = r.netPayable;
    const updated = await p.setRarRecoveries(F, r.rarNo, [
      ...(r.recoveries ?? []),
      { id: 'extra', kind: 'other', description: 'damaged formwork', amount: 1_000_000 },
    ]);
    // net dropped by exactly the new recovery vs the prior recovery set
    const priorRec = (r.recoveries ?? []).reduce((s, x) => s + x.amount, 0);
    const newRec = updated.recoveries!.reduce((s, x) => s + x.amount, 0);
    expect(newRec).toBe(priorRec + 1_000_000);
    expect(Math.round(before - updated.netPayable)).toBe(Math.round(newRec - priorRec));
  });
});

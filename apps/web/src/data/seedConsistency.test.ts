import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const sumLines = (lines?: { amount: number }[]) => (lines ?? []).reduce((s, l) => s + l.amount, 0);

describe('certificate gross reconciles to itemwise lines', () => {
  let p: LocalDataProvider;
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('every flagship IPC gross equals the sum of its lines', async () => {
    const ipcs = await p.listIpcs('proj-f14f15');
    expect(ipcs.length).toBeGreaterThan(0);
    for (const i of ipcs) {
      expect(i.lines && i.lines.length).toBeGreaterThan(3); // full certified set, not a token sample
      expect(Math.round(i.gross)).toBe(Math.round(sumLines(i.lines)));
    }
  });

  it('a created RAR gross equals the sum of its lines', async () => {
    // RARs are no longer seeded, so create one through the real flow and assert
    // the invariant still holds on it.
    const boq = await p.listBoq('proj-f14f15');
    const c = await p.createSubletContract('proj-f14f15', {
      title: 'T', kind: 'sublet', subcontractor: { name: 'Test Co', trade: 'Earthworks' },
      lines: [{ boqItemId: boq[0].id, qty: 100, rate: 90 }],
    });
    const gross = 3 * 90 + 2 * 100;
    await p.createRar('proj-f14f15', {
      period: 'M1', subcontractorId: c.subcontractorId, contractId: c.id, gross,
      lines: [{ boqItemId: boq[0].id, qty: 3, rate: 90, amount: 270 }, { boqItemId: boq[1].id, qty: 2, rate: 100, amount: 200 }],
    });
    const rars = await p.listRars('proj-f14f15');
    expect(rars.length).toBeGreaterThan(0);
    for (const r of rars) expect(Math.round(r.gross)).toBe(Math.round(sumLines(r.lines)));
  });

  it('holds across a sample of generated projects', async () => {
    for (const pid of ['proj-f14f15', 'proj-bahria', 'proj-e12', 'proj-m2-rehab']) {
      const ipcs = await p.listIpcs(pid);
      for (const i of ipcs) expect(Math.round(i.gross)).toBe(Math.round(sumLines(i.lines)));
    }
  });
});

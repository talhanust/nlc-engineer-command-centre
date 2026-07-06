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

  it('every flagship RAR gross equals the sum of its lines', async () => {
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

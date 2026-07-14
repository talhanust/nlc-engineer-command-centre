import { describe, it, expect } from 'vitest';
import { seedFor } from './commercialSeed';

const profile = { id: 'proj-test', cv: 10_000_000_000, billed: 4_000_000_000, plannedPct: 50, actualPct: 45, start: '2025-01-01' };

describe('commercial seed generator', () => {
  const g = seedFor(profile);

  it('builds a BOQ across all 12 bills whose total ≈ contract value', () => {
    const total = g.boq.reduce((s, b) => s + b.amount, 0);
    expect(total).toBeGreaterThan(9_000_000_000);
    expect(total).toBeLessThan(11_000_000_000);
    expect(new Set(g.boq.map((b) => b.billNo)).size).toBe(12);
    expect(g.boq.length).toBeGreaterThan(20);
  });

  it('produces IPCs that carry itemwise lines with monotonic cumulative', () => {
    expect(g.ipcs.length).toBeGreaterThan(0);
    expect(g.ipcs.every((i) => (i.lines?.length ?? 0) > 0)).toBe(true);
    const cums = g.ipcs.map((i) => i.cumGross);
    expect(cums).toEqual([...cums].sort((a, b) => a - b));
    // every IPC line references a real BoQ item
    const ids = new Set(g.boq.map((b) => b.id));
    expect(g.ipcs.every((i) => i.lines!.every((l) => ids.has(l.boqItemId)))).toBe(true);
  });

  it('starts with an empty commercial spine — no seeded contractors/contracts/VOs/RARs', () => {
    // These are created by the user through the sublet-contract and RAR flows.
    expect(g.subs).toHaveLength(0);
    expect(g.contracts).toHaveLength(0);
    expect(g.variations).toHaveLength(0);
    expect(g.rars).toHaveLength(0);
    // Every BOQ item therefore starts as NLC self-execution.
    expect(g.distributions.every((d) => d.mode === 'self' && !d.subcontractorId)).toBe(true);
    // Only the client-side mobilisation guarantee remains; the sub BG is gone.
    expect(g.bgs).toHaveLength(1);
    expect(g.bgs[0].party).toBe('client');
  });

  it('is deterministic for the same profile', () => {
    const again = seedFor(profile);
    expect(again.boq.length).toBe(g.boq.length);
    expect(again.ipcs[0].gross).toBe(g.ipcs[0].gross);
  });
});

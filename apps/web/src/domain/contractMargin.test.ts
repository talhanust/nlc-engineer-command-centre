import { describe, it, expect } from 'vitest';
import type { BoqItem } from '../data/types';
import { contractMargin } from './contractMargin';

const item = (id: string, code: string, qty: number, rate: number): BoqItem => ({
  id, projectId: 'p', billNo: '1', billName: 'Bill 1', section: '',
  code, description: `desc ${code}`, unit: 'CM', qty, rate, amount: qty * rate,
} as BoqItem);

// Real Margalla numbers: BOQ rate 37.18278, sublet rate 32.7208464 = 12% P/L.
const items = [
  item('i1', '101', 209958, 37.18278),
  item('i2', '201', 17594, 5598.943872662292),
  item('i3', 'FREE', 100, 0),
];

describe('contractMargin — against the original BOQ', () => {
  it('earns the difference between the BOQ rate and the sublet rate', () => {
    const m = contractMargin([{ boqItemId: 'i1', qty: 209958, rate: 32.7208464001795 }], items);
    expect(m.revenue).toBeCloseTo(209958 * 37.18278, 2);
    expect(m.cost).toBeCloseTo(209958 * 32.7208464001795, 2);
    expect(m.margin).toBeCloseTo(m.revenue - m.cost, 2);
    // A flat 12% below the BOQ rate is a 12% margin.
    expect(m.marginPct).toBeCloseTo(12, 1);
    expect(m.negativeLines).toHaveLength(0);
  });

  it('totals revenue, cost and margin across lines', () => {
    const m = contractMargin([
      { boqItemId: 'i1', qty: 100, rate: 30 },
      { boqItemId: 'i2', qty: 10, rate: 5000 },
    ], items);
    expect(m.revenue).toBeCloseTo(100 * 37.18278 + 10 * 5598.943872662292, 2);
    expect(m.cost).toBe(100 * 30 + 10 * 5000);
    expect(m.margin).toBeCloseTo(m.revenue - m.cost, 2);
    expect(m.lines).toHaveLength(2);
  });

  it('flags a line priced ABOVE the BOQ rate as a loss', () => {
    const m = contractMargin([{ boqItemId: 'i1', qty: 100, rate: 40 }], items);
    expect(m.margin).toBeLessThan(0);
    expect(m.marginPct).toBeLessThan(0);
    expect(m.negativeLines.map((l) => l.code)).toEqual(['101']);
  });

  it('flags a line priced AT the BOQ rate — it earns nothing', () => {
    const m = contractMargin([{ boqItemId: 'i1', qty: 100, rate: 37.18278 }], items);
    expect(m.margin).toBeCloseTo(0, 6);
    expect(m.negativeLines).toHaveLength(1);
  });

  it('does not let a profitable line hide a loss-making one', () => {
    const m = contractMargin([
      { boqItemId: 'i1', qty: 10_000, rate: 10 }, // healthy: earns ~271.8k
      { boqItemId: 'i2', qty: 10, rate: 9999 },   // above BOQ rate: loses ~44k
    ], items);
    expect(m.margin).toBeGreaterThan(0);          // total looks fine…
    expect(m.negativeLines.map((l) => l.code)).toEqual(['201']); // …but the loss is still named
  });

  it('ignores a line whose item is not in the BOQ rather than guessing a rate', () => {
    const m = contractMargin([
      { boqItemId: 'i1', qty: 100, rate: 30 },
      { boqItemId: 'ghost', qty: 100, rate: 30 },
    ], items);
    expect(m.lines).toHaveLength(1);
    expect(m.lines[0].boqItemId).toBe('i1');
  });

  it('handles a zero BOQ rate without dividing by zero', () => {
    const m = contractMargin([{ boqItemId: 'i3', qty: 10, rate: 5 }], items);
    expect(m.marginPct).toBe(0);
    expect(m.margin).toBe(-50);
    expect(m.negativeLines).toHaveLength(0); // no BOQ rate to compare against
  });

  it('is empty for no lines', () => {
    const m = contractMargin([], items);
    expect(m).toMatchObject({ revenue: 0, cost: 0, margin: 0, marginPct: 0 });
    expect(m.lines).toHaveLength(0);
  });
});

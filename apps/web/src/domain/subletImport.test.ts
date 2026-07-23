import { describe, it, expect } from 'vitest';
import type { BoqItem } from '../data/types';
import { matchSubletRows } from './subletImport';

const item = (id: string, billNo: string, code: string, qty = 1000, rate = 100): BoqItem => ({
  id, projectId: 'p1', billNo, billName: `Bill ${billNo}`, section: 's',
  code, description: code, unit: 'CM', qty, rate, amount: qty * rate,
} as BoqItem);

// The real Margalla shape: 401f "Lean concrete" priced under five bills, 101 unique.
const items = [
  item('i-101', '1', '101'),
  item('i-4a-401f', '4a', '401f'),
  item('i-4b-401f', '4b', '401f'),
  item('i-4c-401f', '4c', '401f'),
  item('i-4d-401f', '4d', '401f'),
  item('i-4e-401f', '4e', '401f'),
];

describe('matchSubletRows', () => {
  it('matches a unique code without needing a bill', () => {
    const r = matchSubletRows([{ bill: '', code: '101', qty: 500, rate: 32.72 }], items);
    expect(r.matched).toEqual([{ boqItemId: 'i-101', qty: 500, rate: 32.72 }]);
    expect(r.ambiguous).toHaveLength(0);
    expect(r.unmatched).toHaveLength(0);
  });

  it('uses bill+code to place a repeated code on the right item', () => {
    const rows = [
      { bill: '4a', code: '401f', qty: 335, rate: 12154.93 },
      { bill: '4b', code: '401f', qty: 82, rate: 12154.93 },
      { bill: '4e', code: '401f', qty: 137, rate: 12154.93 },
    ];
    const r = matchSubletRows(rows, items);
    expect(r.matched.map((m) => m.boqItemId)).toEqual(['i-4a-401f', 'i-4b-401f', 'i-4e-401f']);
    // Each lands on its OWN item — not collapsed onto one.
    expect(new Set(r.matched.map((m) => m.boqItemId)).size).toBe(3);
  });

  it('reports a repeated code as ambiguous instead of guessing when no bill is given', () => {
    const r = matchSubletRows([{ bill: '', code: '401f', qty: 335, rate: 12154.93 }], items);
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous).toEqual([{ bill: '', code: '401f', candidates: 5 }]);
  });

  it('reports a code the project BOQ does not have', () => {
    const r = matchSubletRows([{ bill: '9', code: 'ZZZ-1', qty: 10, rate: 5 }], items);
    expect(r.unmatched).toEqual([{ bill: '9', code: 'ZZZ-1' }]);
    expect(r.matched).toHaveLength(0);
  });

  it('falls back to a unique code when the bill does not match', () => {
    // Bill typo, but 101 is unambiguous → still placed, rather than lost.
    const r = matchSubletRows([{ bill: 'Bill-1', code: '101', qty: 500, rate: 32.72 }], items);
    expect(r.matched.map((m) => m.boqItemId)).toEqual(['i-101']);
  });

  it('is case- and space-insensitive on bill and code', () => {
    const r = matchSubletRows([{ bill: ' 4A ', code: ' 401F ', qty: 335, rate: 1 }], items);
    expect(r.matched.map((m) => m.boqItemId)).toEqual(['i-4a-401f']);
  });

  it('drops rows without a quantity — a contract line needs one', () => {
    const r = matchSubletRows([
      { bill: '1', code: '101', qty: 0, rate: 176_000_000 }, // provisional sum, no qty
      { bill: '1', code: '101', qty: -5, rate: 10 },
    ], items);
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous).toHaveLength(0);
    expect(r.unmatched).toHaveLength(0);
  });

  it('reports an unpriced row instead of importing it at zero', () => {
    // Rates are never defaulted from the client rate, so a blank rate is an
    // incomplete line — and it must be visible, not quietly dropped.
    const r = matchSubletRows([{ bill: '1', code: '101', qty: 500, rate: 0 }], items);
    expect(r.matched).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toBe('no-rate');
  });
});

// Real sheets contain mis-keyed codes: the Margalla BOQ prices two DIFFERENT
// concrete items under 401a3ii within bill 4e, and a gantry sign under the
// pavement-marking code 608j2. The description is then the only thing that tells
// them apart — and two rows must never both claim the same item.
describe('matchSubletRows — a code repeated WITHIN one bill', () => {
  const dup = [
    { ...item('i-4e-a', '4e', '401a3ii'), description: 'Concrete Class A3 (on ground) Base Slabs' },
    { ...item('i-4e-b', '4e', '401a3ii'), description: 'Concrete Class A3 (Elevated) Abutment Walls' },
  ] as BoqItem[];

  it('uses the description to place each row on its own item', () => {
    const r = matchSubletRows([
      { bill: '4e', code: '401a3ii', qty: 712, rate: 25864.97, description: 'Concrete Class A3 (on ground) Base Slabs' },
      { bill: '4e', code: '401a3ii', qty: 1925, rate: 26661.46, description: 'Concrete Class A3 (Elevated) Abutment Walls' },
    ], dup);
    expect(r.matched.map((m) => m.boqItemId)).toEqual(['i-4e-a', 'i-4e-b']);
    expect(r.ambiguous).toHaveLength(0);
  });

  it('never lets two rows claim the same item', () => {
    // Both rows carry the SAME description → the first takes it, the second cannot.
    const r = matchSubletRows([
      { bill: '4e', code: '401a3ii', qty: 712, rate: 1, description: 'Concrete Class A3 (on ground) Base Slabs' },
      { bill: '4e', code: '401a3ii', qty: 1925, rate: 1, description: 'Concrete Class A3 (on ground) Base Slabs' },
    ], dup);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].boqItemId).toBe('i-4e-a');
    // The second is reported, not silently folded onto the same item.
    expect(r.ambiguous).toHaveLength(1);
  });

  it('reports ambiguity when the pair repeats and no description is given', () => {
    const r = matchSubletRows([{ bill: '4e', code: '401a3ii', qty: 712, rate: 1 }], dup);
    expect(r.matched).toHaveLength(0);
    expect(r.ambiguous).toEqual([{ bill: '4e', code: '401a3ii', candidates: 2 }]);
  });

  it('ignores whitespace and case differences in the description', () => {
    const r = matchSubletRows([
      { bill: '4e', code: '401a3ii', qty: 1925, rate: 1, description: '  concrete class A3 (ELEVATED)   Abutment   Walls ' },
    ], dup);
    expect(r.matched.map((m) => m.boqItemId)).toEqual(['i-4e-b']);
  });
});

// The Rs 176 Mn Toll Plaza line in the real Wali Khan contract carries a
// quantity, a rate and a description — but NO item code. Requiring a code
// discarded it silently and left the contract 176 million short.
describe('matchSubletRows — rows that carry no item code', () => {
  const withPs = [
    ...items,
    { ...item('i-ps', '6A', ''), description: 'Toll Plaza', unit: 'PS', qty: 1, rate: 176_000_000 } as BoqItem,
  ];

  it('matches a code-less provisional sum on its description', () => {
    const r = matchSubletRows([{ bill: '6A', code: '', qty: 1, rate: 176_000_000, description: 'Toll Plaza' }], withPs);
    expect(r.matched).toEqual([{ boqItemId: 'i-ps', qty: 1, rate: 176_000_000 }]);
    expect(r.variance).toBe(0);
  });

  it('REPORTS a code-less row it cannot place, with its full value', () => {
    const r = matchSubletRows([{ bill: '6A', code: '', qty: 1, rate: 176_000_000, description: 'Toll Plaza' }], items);
    expect(r.matched).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].amount).toBe(176_000_000);
    expect(r.skipped[0].reason).toBe('not-in-boq');
    expect(r.skipped[0].detail).toMatch(/no item code/);
    // The control total makes the loss impossible to miss.
    expect(r.fileValue).toBe(176_000_000);
    expect(r.matchedValue).toBe(0);
    expect(r.variance).toBe(176_000_000);
  });
});

describe('matchSubletRows — the control total', () => {
  it('reconciles to zero when everything imports', () => {
    const r = matchSubletRows([
      { bill: '1', code: '101', qty: 100, rate: 10 },
      { bill: '4a', code: '401f', qty: 50, rate: 20 },
    ], items);
    expect(r.fileValue).toBe(2000);
    expect(r.matchedValue).toBe(2000);
    expect(r.variance).toBe(0);
  });

  it('variance equals exactly the money in the skipped rows', () => {
    const r = matchSubletRows([
      { bill: '1', code: '101', qty: 100, rate: 10 },      // imports
      { bill: '9', code: 'ZZZ', qty: 5, rate: 1000 },      // not in BOQ
      { bill: '', code: '401f', qty: 2, rate: 500 },       // ambiguous
    ], items);
    expect(r.matchedValue).toBe(1000);
    expect(r.variance).toBe(5000 + 1000);
    expect(r.skipped.reduce((s, x) => s + x.amount, 0)).toBe(r.variance);
  });
});

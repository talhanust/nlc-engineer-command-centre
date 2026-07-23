import { describe, it, expect } from 'vitest';
import type { BoqItem, Contract, Rar } from '../data/types';
import { contractBoqView } from './contractBoqView';

const item = (id: string, code: string, billNo: string, qty: number, rate: number): BoqItem => ({
  id, projectId: 'p', billNo, billName: `Bill ${billNo}`, section: '',
  code, description: `desc ${code}`, unit: 'CM', qty, rate, amount: qty * rate,
} as BoqItem);

// Real Margalla numbers: client rate 37.18278, sublet rate 32.7208464 (12% below).
const boq = [
  item('i1', '101', '1', 209958, 37.18278),
  item('i2', '201', '2', 17594, 5598.943872662292),
  item('i3', '999', '1', 500, 1000), // in bill 1 but NOT sublet
];

const contract = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', projectId: 'p', contractNo: 'NLC/P/SC-01', title: 'Earthworks',
  subcontractorId: 's1', scopeBills: ['1'], value: 0, status: 'draft',
  lines: [{ boqItemId: 'i1', qty: 100_000, rate: 32.7208464 }],
  ...over,
});

describe('contractBoqView — a sublet contract prices at SUBLET rates', () => {
  it('uses the sublet rate and quantity, not the client BOQ rate', () => {
    const v = contractBoqView(contract({ value: 100_000 * 32.7208464 }), boq, []);
    expect(v.lineBased).toBe(true);
    expect(v.rows).toHaveLength(1);
    const r = v.rows[0];
    expect(r.subletQty).toBe(100_000);
    expect(r.subletRate).toBeCloseTo(32.7208464, 6);
    expect(r.subletAmount).toBeCloseTo(100_000 * 32.7208464, 2);
    // The client rate is carried for reference, never used as the amount.
    expect(r.clientRate).toBeCloseTo(37.18278, 5);
    expect(r.subletAmount).not.toBeCloseTo(r.clientAmount, 2);
  });

  it('values revenue on the SUBLET quantity, not the full BOQ quantity', () => {
    const v = contractBoqView(contract(), boq, []);
    // 100,000 sublet out of a 209,958 BOQ quantity.
    expect(v.rows[0].clientAmount).toBeCloseTo(100_000 * 37.18278, 2);
    expect(v.clientValue).toBeCloseTo(100_000 * 37.18278, 2);
  });

  it('lists ONLY the lines awarded, not every item in the scope bills', () => {
    const v = contractBoqView(contract(), boq, []);
    // i3 shares bill 1 but was never sublet.
    expect(v.rows.map((r) => r.code)).toEqual(['101']);
  });

  it('derives the contract value from the lines', () => {
    const v = contractBoqView(contract({
      lines: [{ boqItemId: 'i1', qty: 100, rate: 30 }, { boqItemId: 'i2', qty: 10, rate: 5000 }],
      value: 100 * 30 + 10 * 5000,
    }), boq, []);
    expect(v.subletValue).toBe(100 * 30 + 10 * 5000);
    expect(v.storedValueMismatch).toBeUndefined();
  });

  it('computes margin as client revenue less sublet cost', () => {
    const v = contractBoqView(contract(), boq, []);
    expect(v.margin).toBeCloseTo(v.clientValue - v.subletValue, 2);
    expect(v.marginPct).toBeCloseTo(12, 1); // a flat 12% below the client rate
  });

  it('FLAGS a stored value that disagrees with the lines', () => {
    // Exactly the symptom of a contract written at client rates by an older build.
    const v = contractBoqView(contract({ value: 100_000 * 37.18278 }), boq, []);
    expect(v.storedValueMismatch).toBeDefined();
    expect(v.storedValueMismatch!.stored).toBeCloseTo(100_000 * 37.18278, 2);
    expect(v.storedValueMismatch!.derived).toBeCloseTo(100_000 * 32.7208464, 2);
  });

  it('flags a line priced at or above the client rate', () => {
    const v = contractBoqView(contract({ lines: [{ boqItemId: 'i1', qty: 100, rate: 37.18278 }] }), boq, []);
    expect(v.rows[0].negative).toBe(true);
    expect(v.margin).toBeCloseTo(0, 6);
  });

  it('bills and balances against the SUBLET amount', () => {
    const rar: Rar = {
      id: 'r1', projectId: 'p', rarNo: 'RAR-01', seq: 1, period: 'M1', status: 'submitted',
      subcontractorId: 's1', contractId: 'c1', gross: 0, netPayable: 0,
      lines: [{ boqItemId: 'i1', qty: 1000, rate: 32.7208464, amount: 32_720.8464 }],
    } as Rar;
    const v = contractBoqView(contract(), boq, [rar]);
    expect(v.billedTotal).toBeCloseTo(32_720.8464, 3);
    expect(v.rows[0].balance).toBeCloseTo(v.rows[0].subletAmount - 32_720.8464, 3);
    expect(v.balanceTotal).toBeCloseTo(v.subletValue - 32_720.8464, 3);
  });

  it('ignores RARs billed against another contract', () => {
    const other: Rar = {
      id: 'r2', projectId: 'p', rarNo: 'RAR-09', seq: 9, period: 'M1', status: 'submitted',
      subcontractorId: 's1', contractId: 'OTHER', gross: 0, netPayable: 0,
      lines: [{ boqItemId: 'i1', qty: 999, rate: 1, amount: 999 }],
    } as Rar;
    expect(contractBoqView(contract(), boq, [other]).billedTotal).toBe(0);
  });

  it('skips a line whose BOQ item no longer exists rather than pricing it at zero', () => {
    const v = contractBoqView(contract({ lines: [{ boqItemId: 'ghost', qty: 10, rate: 5 }] }), boq, []);
    expect(v.rows).toHaveLength(0);
    expect(v.subletValue).toBe(0);
  });
});

describe('contractBoqView — a legacy contract with no lines', () => {
  const legacy = (): Contract => ({
    id: 'c9', projectId: 'p', contractNo: 'NLC/P/SC-09', title: 'Old style',
    subcontractorId: 's1', scopeBills: ['1'], value: 5_000_000, status: 'awarded',
  });

  it('falls back to the scope bills at client rates, and says it is not line-based', () => {
    const v = contractBoqView(legacy(), boq, []);
    expect(v.lineBased).toBe(false);
    expect(v.rows.map((r) => r.code).sort()).toEqual(['101', '999']); // whole of bill 1
    expect(v.margin).toBe(0); // no sublet rates exist to compare against
  });

  it('does not raise a value mismatch for a legacy contract', () => {
    expect(contractBoqView(legacy(), boq, []).storedValueMismatch).toBeUndefined();
  });
});

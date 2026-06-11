import { describe, it, expect } from 'vitest';
import { computeDeductions, DEFAULT_DEDUCTION_SETTINGS } from './deductions';
import { escalationAmount } from './escalation';
import { workingCapital, marginByBill } from './workingcap';
import type { BoqItem, Distribution } from '../data/types';

describe('IPC deduction waterfall', () => {
  it('applies retention + income-tax (filer) + sales-tax WHT', () => {
    const d = computeDeductions(1000, 0, DEFAULT_DEDUCTION_SETTINGS);
    // 10% + 3% + 1% = 14%
    expect(d.totalDeductions).toBe(140);
    expect(d.net).toBe(860);
  });
  it('uses the non-filer income-tax band', () => {
    const d = computeDeductions(1000, 0, { ...DEFAULT_DEDUCTION_SETTINGS, filer: false });
    // 10% + 7% + 1% = 18%
    expect(d.net).toBe(820);
  });
  it('includes advance recovery as a fixed line', () => {
    const d = computeDeductions(1000, 50);
    expect(d.lines.some((l) => l.label === 'Advance recovery' && l.amount === 50)).toBe(true);
    expect(d.net).toBe(810);
  });
});

describe('escalation formula', () => {
  it('escalates the weighted variable portion by index change', () => {
    const r = escalationAmount(1000, 0.5, [
      { label: 'Steel', weight: 0.5, baseIndex: 100, currentIndex: 120 },
    ]);
    expect(r.factor).toBeCloseTo(0.1, 6);
    expect(r.amount).toBeCloseTo(100, 6);
  });
});

describe('working capital', () => {
  it('nets assets against liabilities', () => {
    const wc = workingCapital({ receivables: 100, retentionHeld: 20, advancesOutstanding: 10, payables: 30 });
    expect(wc.net).toBe(80);
  });
});

describe('margin by bill', () => {
  const boq: BoqItem[] = [
    { id: 'a', projectId: 'p', billNo: '1', code: 'A', description: 'a', unit: 'm', qty: 1, rate: 100, amount: 100 },
    { id: 'b', projectId: 'p', billNo: '1', code: 'B', description: 'b', unit: 'm', qty: 1, rate: 100, amount: 100 },
  ];
  const dists: Record<string, Distribution> = {
    b: { boqItemId: 'b', projectId: 'p', mode: 'sublet', allocatedQty: 1 },
  };
  it('costs sublet at BOQ value and self-execute at the cost ratio', () => {
    const [bill] = marginByBill(boq, dists);
    // revenue 200; cost = 100 (sublet) + 85 (self @0.85) = 185; margin 15
    expect(bill.revenue).toBe(200);
    expect(bill.cost).toBe(185);
    expect(bill.margin).toBe(15);
  });
});

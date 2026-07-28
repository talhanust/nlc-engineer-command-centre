import { describe, it, expect } from 'vitest';
import type { BoqItem, Allocation, ProgressUpdate } from '../data/types';
import { marginAnalytics } from './marginanalytics';

const item = (id: string, rate: number): BoqItem => ({
  id, projectId: 'p', billNo: '1', billName: 'B', section: '', code: id,
  description: id, unit: 'CM', qty: 1000, rate, amount: 1000 * rate,
} as BoqItem);

const alloc = (boqItemId: string, qty: number, rate: number, type: Allocation['executionType'] = 'sublet'): Allocation =>
  ({ id: `a-${boqItemId}`, projectId: 'p', boqItemId, executionType: type, contractorId: 's1', qty, rate });

const prog = (boqItemId: string, executedQty: number): ProgressUpdate =>
  ({ id: `pr-${boqItemId}`, projectId: 'p', boqItemId, period: 'M1', executedQty, status: 'validated' });

const boq = [item('i1', 100), item('i2', 200)];

describe('committed vs incurred cost', () => {
  it('commits the full awarded value the moment work is allocated, before any is measured', () => {
    const m = marginAnalytics(boq, [alloc('i1', 1000, 88)], [], [], [], []);
    expect(m.committedCost.total).toBe(1000 * 88);   // committed at award
    expect(m.incurredCost.total).toBe(0);            // nothing measured yet
    expect(m.remainingCommitment).toBe(1000 * 88);
  });

  it('incurs cost only as quantity is executed, at the sublet rate', () => {
    const m = marginAnalytics(boq, [alloc('i1', 1000, 88)], [prog('i1', 250)], [], [], []);
    expect(m.committedCost.total).toBe(88_000);
    expect(m.incurredCost.total).toBe(250 * 88);     // measured portion only
    expect(m.remainingCommitment).toBe(88_000 - 250 * 88);
  });

  it('caps incurred at the committed quantity — over-measurement is a variation, not extra cost here', () => {
    const m = marginAnalytics(boq, [alloc('i1', 1000, 88)], [prog('i1', 1500)], [], [], []);
    expect(m.incurredCost.total).toBe(1000 * 88);    // capped at 1000, not 1500
  });

  it('splits committed and incurred across sublet and labour', () => {
    const m = marginAnalytics(boq,
      [alloc('i1', 1000, 88, 'sublet'), alloc('i2', 500, 150, 'labor')],
      [prog('i1', 100), prog('i2', 200)], [], [], []);
    expect(m.committedCost.sublet).toBe(1000 * 88);
    expect(m.committedCost.labour).toBe(500 * 150);
    expect(m.incurredCost.sublet).toBe(100 * 88);
    expect(m.incurredCost.labour).toBe(200 * 150);
  });

  it('realised gross margin uses INCURRED cost, not committed', () => {
    // Executed 250 of i1 → revenue 250×100, incurred 250×88.
    const m = marginAnalytics(boq, [alloc('i1', 1000, 88)], [prog('i1', 250)], [], [], []);
    expect(m.grossRevenue).toBe(250 * 100);
    expect(m.grossMargin).toBe(250 * 100 - 250 * 88);
  });

  it('scCost keeps its historical meaning (committed) so existing callers are unaffected', () => {
    const m = marginAnalytics(boq, [alloc('i1', 1000, 88)], [], [], [], []);
    expect(m.scCost).toBe(m.committedCost.sublet);
  });
});

describe('over-subscription — the whole point of a committed figure', () => {
  it('is healthy when committed cost is below client revenue on the same scope', () => {
    // Sublet at 88 of a 100 client rate → 12% margin at award.
    const m = marginAnalytics(boq, [alloc('i1', 1000, 88)], [], [], [], []);
    expect(m.committedRevenue).toBe(1000 * 100);
    expect(m.committedMargin).toBe(1000 * 100 - 1000 * 88);
    expect(m.committedMargin).toBeGreaterThan(0);
  });

  it('flags an over-subscription when a sublet rate exceeds the client rate', () => {
    // Sublet at 120 of a 100 client rate → paying out more than coming in.
    const m = marginAnalytics(boq, [alloc('i1', 1000, 120)], [], [], [], []);
    expect(m.committedMargin).toBe(1000 * 100 - 1000 * 120);
    expect(m.committedMargin).toBeLessThan(0);
  });

  it('sees the over-subscription at award, with zero executed', () => {
    const m = marginAnalytics(boq, [alloc('i1', 1000, 120)], [], [], [], []);
    expect(m.incurredCost.total).toBe(0);        // nothing built…
    expect(m.committedMargin).toBeLessThan(0);   // …but the exposure is already visible
  });
});

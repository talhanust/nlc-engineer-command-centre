import { describe, it, expect } from 'vitest';
import { applyAction, nextTransition, computeNet, IPC_PIPELINE, ipcDeductionBreakdown, ipcVettedPaidByItem, ipcClaimedQtyByItem } from './ipc';
import { applyRarAction, nextRarTransition, RAR_PIPELINE } from './rar';
import { parseBoqPaste, itemAmount, groupByBill } from './boq';
import type { BoqItem } from '../data/types';

describe('IPC pipeline', () => {
  it('advances legally through every stage', () => {
    let status = IPC_PIPELINE[0];
    const visited = [status];
    let t = nextTransition(status);
    while (t) {
      status = t.to;
      visited.push(status);
      t = nextTransition(status);
    }
    expect(visited).toEqual(IPC_PIPELINE);
  });

  it('rejects an illegal edge', () => {
    expect(applyAction('draft', 'submit')).toBe('submitted');
    expect(applyAction('draft', 'pay')).toBeNull();
    expect(applyAction('paid', 'submit')).toBeNull();
  });

  it('computes net after default deductions (17%)', () => {
    expect(computeNet(1_000_000)).toBeCloseTo(830_000, 0);
  });
});

describe('RAR pipeline', () => {
  it('advances legally through every stage', () => {
    let status = RAR_PIPELINE[0];
    const visited = [status];
    let t = nextRarTransition(status);
    while (t) {
      status = t.to;
      visited.push(status);
      t = nextRarTransition(status);
    }
    expect(visited).toEqual(RAR_PIPELINE);
  });

  it('rejects an illegal edge', () => {
    expect(applyRarAction('submitted', 'verify')).toBe('verified');
    expect(applyRarAction('draft', 'pay')).toBeNull();
    expect(applyRarAction('paid', 'submit')).toBeNull();
  });
});

describe('BOQ parsing', () => {
  it('computes a line amount', () => {
    expect(itemAmount(100, 50)).toBe(5000);
  });

  it('parses CSV with fuzzy headers and skips bad rows', () => {
    const csv = 'Bill,Code,Description,Unit,Quantity,Rate\n1,A1,Excavation,Cum,100,420\nx,bad,row,,,';
    const { rows, error } = parseBoqPaste(csv);
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ billNo: '1', code: 'A1', qty: 100, rate: 420 });
  });

  it('errors when required columns are missing', () => {
    const { error } = parseBoqPaste('foo,bar\n1,2');
    expect(error).toBeTruthy();
  });

  it('groups items by bill with totals', () => {
    const items: BoqItem[] = [
      { id: '1', projectId: 'p', billNo: '1', code: 'a', description: '', unit: '', qty: 1, rate: 100, amount: 100 },
      { id: '2', projectId: 'p', billNo: '1', code: 'b', description: '', unit: '', qty: 1, rate: 200, amount: 200 },
      { id: '3', projectId: 'p', billNo: '2', code: 'c', description: '', unit: '', qty: 1, rate: 50, amount: 50 },
    ];
    const bills = groupByBill(items);
    expect(bills).toHaveLength(2);
    expect(bills[0].total).toBe(300);
    expect(bills[1].total).toBe(50);
  });
});

describe('IPC deductions + line rollups', () => {
  it('builds the deduction-to-net waterfall', () => {
    const d = ipcDeductionBreakdown(1_000_000);
    expect(d.retention).toBe(100_000);
    expect(d.incomeTax).toBe(70_000);
    expect(d.net).toBe(830_000);
    expect(ipcDeductionBreakdown(1_000_000, { advanceRecovery: 30_000 }).net).toBe(800_000);
  });
  it('rolls vetted/paid and claimed qty from IPC lines by status', () => {
    const ipcs = [
      { status: 'vetted' as const, lines: [{ boqItemId: 'a', amount: 100, qty: 2 }] },
      { status: 'paid' as const, lines: [{ boqItemId: 'a', amount: 50, qty: 1 }] },
      { status: 'draft' as const, lines: [{ boqItemId: 'a', amount: 999, qty: 9 }] },
    ];
    const { vetted, paid } = ipcVettedPaidByItem(ipcs);
    expect(vetted['a']).toBe(150); // vetted + paid count as vetted; draft excluded
    expect(paid['a']).toBe(50);
    expect(ipcClaimedQtyByItem(ipcs)['a']).toBe(12);
  });
});

import { pnCoefficient, DEFAULT_PBS_COMPONENTS } from './escalation';
describe('PBS index Pₙ', () => {
  it('computes Pₙ = Σ wᵢ·(Cᵢ/Bᵢ) from the default PBS master', () => {
    const r = pnCoefficient(DEFAULT_PBS_COMPONENTS);
    expect(r.sumWeights).toBeCloseTo(1, 6);
    expect(r.pn).toBeCloseTo(1.1252, 4);
    expect(r.factor).toBeCloseTo(0.1252, 4);
    expect(r.lines[2].contribution).toBeCloseTo(0.2534, 4); // Steel
  });
});

import { retentionSummary } from './retention';
import type { Ipc } from '../data/types';
describe('retention cap + DLP split', () => {
  const ipc = (seq: number, gross: number): Ipc => ({ id: `i${seq}`, projectId: 'p', ipcNo: `IPC-0${seq}`, seq, period: 'P', status: 'paid', gross, netPayable: 0, cumGross: 0 });
  it('caps cumulative retention at the contract ceiling', () => {
    const s = retentionSummary([ipc(1, 4000), ipc(2, 4000)], 10000); // cap = 5% × 10000 = 500
    expect(s.rawDeducted).toBe(800);
    expect(s.cap).toBe(500);
    expect(s.deducted).toBe(500);
    expect(s.atCapped).toBe(true);
    expect(s.heldForDlp).toBe(500);
    expect(s.releasedAtCompletion).toBe(0); // no Final Bill yet
  });
  it('splits 50/50 once the Final Bill is approved', () => {
    const s = retentionSummary([ipc(1, 1000)], 1_000_000, { finalBillApproved: true });
    expect(s.releasedAtCompletion).toBe(50);
    expect(s.heldForDlp).toBe(50);
  });
});

import { buildAging, agingTotals, urgencyOf, periodToDate } from './aging';
import { marginAnalytics } from './marginanalytics';
import type { Ipc as IpcT, Allocation, ProgressUpdate, BoqItem as BoqT, Subcontractor } from '../data/types';

describe('aging', () => {
  const ipc = (no: string, status: IpcT['status'], period: string, gross: number): IpcT =>
    ({ id: no, projectId: 'p', ipcNo: no, seq: 1, period, status, gross, netPayable: 0, cumGross: 0 });
  it('ages in-pipeline docs and flags breaches', () => {
    const today = new Date('2026-06-18T00:00:00');
    const docs = buildAging([ipc('IPC-01', 'paid', 'Jan-2026', 1000), ipc('IPC-02', 'vetted', 'May-2026', 2000)], [], [], today);
    expect(docs).toHaveLength(1);            // paid excluded
    expect(docs[0].ref).toBe('IPC-02');
    expect(docs[0].urgency).toBe('critical'); // ~48 days / 14 ≈ 3.4×
    expect(agingTotals(docs).critical).toBe(1);
  });
  it('classifies urgency and parses periods', () => {
    expect(urgencyOf(2)).toBe('critical');
    expect(urgencyOf(1.5)).toBe('high');
    expect(urgencyOf(1)).toBe('medium');
    expect(urgencyOf(0.4)).toBe('low');
    expect(periodToDate('May-2026')?.getMonth()).toBe(4);
  });
});

describe('margin analytics', () => {
  const boqItem = (id: string, rate: number): BoqT => ({ id, projectId: 'p', billNo: '1', code: id, description: id, unit: 'U', qty: 100, rate, amount: 100 * rate });
  it('computes revenue, costs, margin and risk items', () => {
    const boq = [boqItem('a', 100), boqItem('b', 200)];
    const allocs: Allocation[] = [
      { id: '1', projectId: 'p', boqItemId: 'a', executionType: 'sublet', contractorId: 's1', qty: 10, rate: 95 },
      { id: '2', projectId: 'p', boqItemId: 'b', executionType: 'labor', qty: 5, rate: 50 },
    ];
    const progress: ProgressUpdate[] = [{ id: 'pr', projectId: 'p', boqItemId: 'a', period: 'P', executedQty: 10, status: 'validated' }];
    const subs: Subcontractor[] = [{ id: 's1', projectId: 'p', name: 'FWO' } as Subcontractor];
    const m = marginAnalytics(boq, allocs, progress, subs, [], []);
    expect(m.grossRevenue).toBe(1000);
    expect(m.scCost).toBe(950);
    expect(m.loCost).toBe(250);
    expect(m.riskItems).toHaveLength(1);   // 95/100 = 0.95 > 0.9
    expect(m.topContractors[0].name).toBe('FWO');
  });
});

import { commercialCashflow, cashflowTotals } from './commercialcashflow';
import type { Rar as RarT } from '../data/types';
describe('commercial cashflow', () => {
  const ipcCF = (no: string, period: string, net: number): IpcT => ({ id: no, projectId: 'p', ipcNo: no, seq: 1, period, status: 'paid', gross: net, netPayable: net, cumGross: 0 });
  const rarCF = (period: string, net: number): RarT => ({ id: `r${period}`, projectId: 'p', rarNo: 'R', seq: 1, period, status: 'paid', subcontractorId: 's', gross: net, netPayable: net });
  it('aggregates inflow/outflow by period with a running net', () => {
    const pts = commercialCashflow([ipcCF('IPC-01', 'Jan-2026', 900), ipcCF('IPC-02', 'Feb-2026', 500)], [rarCF('Jan-2026', 400)]);
    expect(pts[0].period).toBe('Jan-2026');
    expect(pts[0].net).toBe(500);
    expect(pts[0].cumNet).toBe(500);
    expect(pts[1].cumNet).toBe(1000);
    expect(cashflowTotals(pts).inflow).toBe(1400);
  });
});

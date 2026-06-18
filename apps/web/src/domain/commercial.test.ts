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

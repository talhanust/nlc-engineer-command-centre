import { describe, it, expect } from 'vitest';
import { applyAction, nextTransition, computeNet, IPC_PIPELINE } from './ipc';
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

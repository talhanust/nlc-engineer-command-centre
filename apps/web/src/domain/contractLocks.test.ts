import { describe, it, expect } from 'vitest';
import type { BoqItem, Contract } from '../data/types';
import { itemLocks, contractLineIssues, contractValue, lockingContracts } from './contractLocks';

const item = (id: string, qty: number, over: Partial<BoqItem> = {}): BoqItem => ({
  id, projectId: 'p1', billNo: '1', billName: 'Roadworks', section: 'Earthworks',
  code: id.toUpperCase(), description: id, unit: 'm3', qty, rate: 100, amount: qty * 100, ...over,
} as BoqItem);

const contract = (id: string, lines: Array<[string, number, number]>, over: Partial<Contract> = {}): Contract => ({
  id, projectId: 'p1', contractNo: id, title: id, subcontractorId: `sub-${id}`,
  scopeBills: ['1'], value: 0, status: 'draft',
  lines: lines.map(([boqItemId, qty, rate]) => ({ boqItemId, qty, rate })), ...over,
});

const items = [item('i1', 10_000), item('i2', 500)];

describe('contractValue', () => {
  it('is the sum of qty × rate, never a typed figure', () => {
    expect(contractValue([{ boqItemId: 'i1', qty: 100, rate: 90 }, { boqItemId: 'i2', qty: 10, rate: 500 }])).toBe(14_000);
  });
  it('ignores negative quantities and rates', () => {
    expect(contractValue([{ boqItemId: 'i1', qty: -5, rate: 90 }])).toBe(0);
  });
});

describe('itemLocks', () => {
  it('reports locked and unallocated quantity per item', () => {
    const locks = itemLocks(items, [contract('C1', [['i1', 6000, 90]])]);
    const l = locks.get('i1')!;
    expect(l.lockedQty).toBe(6000);
    expect(l.unallocatedQty).toBe(4000);
    expect(l.overCommitted).toBe(false);
    expect(l.holders).toHaveLength(1);
    expect(l.holders[0].contractNo).toBe('C1');
  });

  it('splits one item across several contractors', () => {
    const locks = itemLocks(items, [contract('C1', [['i1', 6000, 90]]), contract('C2', [['i1', 4000, 88]])]);
    const l = locks.get('i1')!;
    expect(l.lockedQty).toBe(10_000);
    expect(l.unallocatedQty).toBe(0);
    expect(l.overCommitted).toBe(false);
    expect(l.holders.map((h) => h.contractNo).sort()).toEqual(['C1', 'C2']);
  });

  it('flags an item committed beyond its BOQ quantity', () => {
    const locks = itemLocks(items, [contract('C1', [['i1', 7000, 90]]), contract('C2', [['i1', 5000, 88]])]);
    const l = locks.get('i1')!;
    expect(l.lockedQty).toBe(12_000);
    expect(l.unallocatedQty).toBe(0); // floored, never negative
    expect(l.overCommitted).toBe(true);
  });

  it('leaves an unmapped item fully unallocated', () => {
    const locks = itemLocks(items, [contract('C1', [['i1', 1000, 90]])]);
    expect(locks.get('i2')!.unallocatedQty).toBe(500);
    expect(locks.get('i2')!.lockedQty).toBe(0);
  });
});

describe('lockingContracts', () => {
  it('excludes closed contracts and those without lines', () => {
    const live = contract('C1', [['i1', 100, 90]]);
    const closed = contract('C2', [['i1', 100, 90]], { status: 'closed' });
    const empty = contract('C3', []);
    expect(lockingContracts([live, closed, empty]).map((c) => c.id)).toEqual(['C1']);
  });
});

describe('contractLineIssues — the overlap warning', () => {
  it('is silent when the new lines fit within the remaining quantity', () => {
    const existing = [contract('C1', [['i1', 6000, 90]])];
    const issues = contractLineIssues([{ boqItemId: 'i1', qty: 4000, rate: 88 }], items, existing);
    expect(issues).toHaveLength(0);
  });

  it('warns when the new lines push an item past its BOQ quantity', () => {
    const existing = [contract('C1', [['i1', 6000, 90]])];
    const issues = contractLineIssues([{ boqItemId: 'i1', qty: 5000, rate: 88 }], items, existing);
    expect(issues).toHaveLength(1);
    expect(issues[0].itemCode).toBe('I1');
    expect(issues[0].overBy).toBe(1000);
  });

  it('ignores the contract being edited so it does not clash with itself', () => {
    // C1 currently holds 9000 of i1 (cap 10000). Editing it to 9500 must not
    // count its OWN old 9000, so 9500 ≤ 10000 → no issue.
    const self = contract('C1', [['i1', 9000, 90]]);
    expect(contractLineIssues([{ boqItemId: 'i1', qty: 9500, rate: 90 }], items, [self], 'C1')).toHaveLength(0);
    const over = contractLineIssues([{ boqItemId: 'i1', qty: 10_500, rate: 90 }], items, [self], 'C1');
    expect(over[0].overBy).toBe(500);
    expect(over[0].lockedQty).toBe(10_500);
  });

  it('folds a contract own repeated lines for the same item', () => {
    const issues = contractLineIssues(
      [{ boqItemId: 'i1', qty: 6000, rate: 90 }, { boqItemId: 'i1', qty: 5000, rate: 90 }],
      items, [],
    );
    expect(issues[0].lockedQty).toBe(11_000);
    expect(issues[0].overBy).toBe(1000);
  });

  it('ignores closed contracts when accumulating existing locks', () => {
    const closed = contract('C1', [['i1', 9000, 90]], { status: 'closed' });
    const issues = contractLineIssues([{ boqItemId: 'i1', qty: 3000, rate: 88 }], items, [closed]);
    expect(issues).toHaveLength(0);
  });
});

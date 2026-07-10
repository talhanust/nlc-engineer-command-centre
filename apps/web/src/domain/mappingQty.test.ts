import { describe, it, expect } from 'vitest';
import type { BoqWbsLink } from '../data/types';
import {
  effectiveWeight, usesQtyAllocation, itemAllocation, allocationIssues,
  linksByActivity, activityMappedValue, linksByItem,
} from './mapping';

const link = (activityId: string, over: Partial<BoqWbsLink> = {}): BoqWbsLink => ({
  boqItemId: 'i1', projectId: 'p1', activityId, confidence: 'confirmed', ...over,
});
const ITEM = { id: 'i1', qty: 100, amount: 500_000 };

describe('effectiveWeight — allocation priority', () => {
  it('splits evenly when neither qty nor weight is given', () => {
    const ls = [link('A'), link('B')];
    expect(effectiveWeight(ls[0], ls)).toBe(0.5);
  });

  it('honours an explicit weight over an even split', () => {
    const ls = [link('A', { weight: 0.7 }), link('B', { weight: 0.3 })];
    expect(effectiveWeight(ls[0], ls)).toBeCloseTo(0.7);
  });

  it('prefers quantity allocation over weight when the item is known', () => {
    const ls = [link('A', { qty: 30, weight: 0.9 }), link('B', { qty: 70 })];
    expect(effectiveWeight(ls[0], ls, ITEM)).toBeCloseTo(0.3);
    expect(effectiveWeight(ls[1], ls, ITEM)).toBeCloseTo(0.7);
  });

  it('treats a link with no qty as zero once the item is quantity-allocated', () => {
    const ls = [link('A', { qty: 40 }), link('B')];
    expect(effectiveWeight(ls[1], ls, ITEM)).toBe(0);
  });

  it('falls back to weight when the item is not passed (legacy call sites)', () => {
    const ls = [link('A', { qty: 30, weight: 0.9 })];
    expect(effectiveWeight(ls[0], ls)).toBeCloseTo(0.9);
  });

  it('clamps a qty larger than the item quantity to a full share', () => {
    const ls = [link('A', { qty: 250 })];
    expect(effectiveWeight(ls[0], ls, ITEM)).toBe(1);
  });
});

describe('itemAllocation', () => {
  it('reports allocated and remaining quantity', () => {
    const ls = [link('A', { qty: 30 }), link('B', { qty: 45 })];
    const a = itemAllocation(ITEM, ls);
    expect(a.allocatedQty).toBe(75);
    expect(a.remainingQty).toBe(25);
    expect(a.fullyAllocated).toBe(false);
    expect(a.overAllocated).toBe(false);
    expect(a.usesQty).toBe(true);
  });

  it('flags over-allocation', () => {
    const a = itemAllocation(ITEM, [link('A', { qty: 60 }), link('B', { qty: 60 })]);
    expect(a.overAllocated).toBe(true);
    expect(a.remainingQty).toBe(0);
  });

  it('treats a fully allocated item as complete, within decimal tolerance', () => {
    const a = itemAllocation({ id: 'i1', qty: 0.3 }, [link('A', { qty: 0.1 }), link('B', { qty: 0.2 })]);
    expect(a.fullyAllocated).toBe(true);
    expect(a.overAllocated).toBe(false);
  });

  it('reports usesQty=false for weight-only mappings', () => {
    expect(itemAllocation(ITEM, [link('A', { weight: 0.5 })]).usesQty).toBe(false);
    expect(usesQtyAllocation([link('A')])).toBe(false);
  });
});

describe('allocationIssues — the pre-lock gate', () => {
  const items = [{ id: 'i1', qty: 100 }, { id: 'i2', qty: 50 }];

  it('blocks when any item allocates more than its BOQ quantity', () => {
    const links = [link('A', { qty: 80 }), link('B', { qty: 40 })];
    const issues = allocationIssues(items, links);
    expect(issues.blocking).toBe(true);
    expect(issues.overAllocated.map((a) => a.itemId)).toEqual(['i1']);
  });

  it('warns but does not block on partly allocated items', () => {
    const issues = allocationIssues(items, [link('A', { qty: 60 })]);
    expect(issues.blocking).toBe(false);
    expect(issues.underAllocated.map((a) => a.itemId)).toEqual(['i1']);
  });

  it('is silent for a fully allocated item', () => {
    const issues = allocationIssues(items, [link('A', { qty: 100 })]);
    expect(issues.overAllocated).toHaveLength(0);
    expect(issues.underAllocated).toHaveLength(0);
  });

  it('ignores weight-only and unmapped items', () => {
    const issues = allocationIssues(items, [link('A', { weight: 0.5 })]);
    expect(issues.blocking).toBe(false);
    expect(issues.underAllocated).toHaveLength(0);
  });

  it('ignores disputed links', () => {
    const links = [link('A', { qty: 80, confidence: 'disputed' }), link('B', { qty: 40 })];
    expect(allocationIssues(items, links).blocking).toBe(false);
  });
});

describe('activity-centric view — one activity, many BOQ items', () => {
  it('groups links by activity', () => {
    const links = [link('A'), link('B'), link('A', { boqItemId: 'i2' })];
    const by = linksByActivity(links);
    expect(by.get('A')).toHaveLength(2);
    expect(by.get('B')).toHaveLength(1);
  });

  it('values an activity by its allocated share of each mapped item', () => {
    const items = new Map([
      ['i1', { id: 'i1', qty: 100, amount: 500_000 }],
      ['i2', { id: 'i2', qty: 10, amount: 100_000 }],
    ]);
    const links = [
      link('A', { boqItemId: 'i1', qty: 30 }),   // 30% of 500k = 150k
      link('B', { boqItemId: 'i1', qty: 70 }),
      link('A', { boqItemId: 'i2', qty: 5 }),    // 50% of 100k = 50k
      link('B', { boqItemId: 'i2', qty: 5 }),
    ];
    const byItem = linksByItem(links);
    const byAct = linksByActivity(links);
    expect(activityMappedValue(byAct.get('A')!, items, byItem)).toBeCloseTo(200_000);
    expect(activityMappedValue(byAct.get('B')!, items, byItem)).toBeCloseTo(400_000);
  });
});

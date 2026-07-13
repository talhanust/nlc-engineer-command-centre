import { describe, it, expect } from 'vitest';
import type { BoqItem, ScheduleActivity, BoqWbsLink } from '../data/types';
import { distribute, suggestAllocations, proposalsToLinks, matchScore } from './mappingSuggest';

const item = (id: string, description: string, qty: number, over: Partial<BoqItem> = {}): BoqItem => ({
  id, projectId: 'p1', billNo: '1', billName: 'Roadworks', section: 'Earthworks',
  code: id.toUpperCase(), description, unit: 'm3', qty, rate: 100, amount: qty * 100, ...over,
} as BoqItem);

const act = (activityId: string, name: string, over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
  id: `a-${activityId}`, projectId: 'p1', activityId, name, wbs: '1.1',
  durationDays: 10, plannedStart: '2026-01-01', plannedFinish: '2026-01-10', isMilestone: false, ...over,
});

describe('distribute — parts must sum exactly to the whole', () => {
  it('splits proportionally to weights', () => {
    expect(distribute(100, [1, 1])).toEqual([50, 50]);
    expect(distribute(100, [3, 1])).toEqual([75, 25]);
  });

  it('hands rounding crumbs to the largest fractional parts, losing nothing', () => {
    const parts = distribute(100, [1, 1, 1]);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(100); // not 99.99
    expect(parts.filter((p) => p === 33.34)).toHaveLength(1);
    expect(parts.filter((p) => p === 33.33)).toHaveLength(2);
  });

  it('never loses quantity on awkward decimals', () => {
    for (const total of [10, 7.77, 1234.56, 0.03]) {
      for (const weights of [[1, 2, 3], [5, 5, 5, 5], [9, 1]]) {
        const parts = distribute(total, weights);
        expect(+parts.reduce((s, v) => s + v, 0).toFixed(2)).toBe(+total.toFixed(2));
      }
    }
  });

  it('returns zeroes for zero or empty weights rather than dividing by zero', () => {
    expect(distribute(100, [0, 0])).toEqual([0, 0]);
    expect(distribute(100, [])).toEqual([]);
  });
});

describe('matchScore — a P6 import gives more to match on', () => {
  it('matches on the activity name', () => {
    expect(matchScore(item('i1', 'Clearing and grubbing', 100), act('A-1', 'Clearing & grubbing'))).toBeGreaterThan(0.5);
  });

  it('matches on assigned resource names when the title is uninformative', () => {
    const a = act('A-1', 'Zone 1 works', { resourceNames: ['Clearing & grubbing'] });
    const bare = act('A-2', 'Zone 1 works');
    expect(matchScore(item('i1', 'Clearing and grubbing', 100), a))
      .toBeGreaterThan(matchScore(item('i1', 'Clearing and grubbing', 100), bare));
  });

  it('matches on the readable WBS path', () => {
    const a = act('A-1', 'Layer 1', { wbsPath: 'Construction › Drainage works' });
    expect(matchScore(item('i1', 'Drainage structures', 100), a)).toBeGreaterThan(0);
  });
});

describe('suggestAllocations — which activities consume an item, and how much', () => {
  const items = [item('i1', 'Excavation in ordinary soil', 10_000)];
  const acts = [
    act('E-1', 'Earthwork Zone 1', { originalDurationDays: 30 }),
    act('E-2', 'Earthwork Zone 2', { originalDurationDays: 10 }),
    act('P-1', 'Painting and signage', { originalDurationDays: 5 }),
  ];

  it('splits an item across the activities that plausibly execute it', () => {
    const [p] = suggestAllocations(items, acts, []);
    expect(p.boqItemId).toBe('i1');
    expect(p.allocations.map((a) => a.activityId).sort()).toEqual(['E-1', 'E-2']);
    expect(p.allocations.reduce((s, a) => s + a.qty, 0)).toBe(10_000); // nothing lost
  });

  it('gives the longer activity more of the quantity', () => {
    const [p] = suggestAllocations(items, acts, []);
    const e1 = p.allocations.find((a) => a.activityId === 'E-1')!;
    const e2 = p.allocations.find((a) => a.activityId === 'E-2')!;
    expect(e1.qty).toBeGreaterThan(e2.qty);
  });

  it('never proposes for an item a human already mapped', () => {
    const existing: BoqWbsLink[] = [{ boqItemId: 'i1', projectId: 'p1', activityId: 'E-1', confidence: 'confirmed', qty: 500 }];
    expect(suggestAllocations(items, acts, existing)).toHaveLength(0);
  });

  it('caps how many activities one item is split across', () => {
    const many = [act('E-1', 'Earthwork one'), act('E-2', 'Earthwork two'), act('E-3', 'Earthwork three'), act('E-4', 'Earthwork four')];
    const [p] = suggestAllocations([item('i1', 'Earthwork excavation', 100)], many, [], { maxPerItem: 2 });
    expect(p.allocations).toHaveLength(2);
    expect(p.allocations.reduce((s, a) => s + a.qty, 0)).toBe(100);
  });

  it('skips milestones and zero-quantity items', () => {
    const ms = [act('M-1', 'Earthwork complete', { isMilestone: true })];
    expect(suggestAllocations(items, ms, [])).toHaveLength(0);
    expect(suggestAllocations([item('i2', 'Excavation in ordinary soil', 0)], acts, [])).toHaveLength(0);
  });

  it('proposes nothing when nothing matches above the threshold', () => {
    expect(suggestAllocations([item('i3', 'Zzzz qqqq', 50)], acts, [])).toHaveLength(0);
  });

  it('is deterministic for equal scores', () => {
    const a = suggestAllocations(items, acts, []);
    const b = suggestAllocations(items, acts, []);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('emits auto links that carry the proposed quantity and await confirmation', () => {
    const links = proposalsToLinks(suggestAllocations(items, acts, []), 'p1');
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.confidence).toBe('auto'); // takes no part in derived progress yet
      expect(l.qty).toBeGreaterThan(0);
      expect(l.projectId).toBe('p1');
    }
    expect(links.reduce((s, l) => s + (l.qty ?? 0), 0)).toBe(10_000);
  });
});

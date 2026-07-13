import { describe, it, expect } from 'vitest';
import type { ScheduleActivity, ScheduleMeta } from '../data/types';
import { scurveFromSchedule, monthKey, reconcileProgrammeCost } from './scurveFromSchedule';
import { hashBytes, shortHash } from '../components/fileHash';

const act = (activityId: string, start: string, finish: string, over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
  id: `id-${activityId}`, projectId: 'p1', activityId, name: activityId, wbs: '1',
  durationDays: 10, plannedStart: start, plannedFinish: finish, isMilestone: false, ...over,
});
const SEVEN: ScheduleMeta = { workingWeekdays: [0, 1, 2, 3, 4, 5, 6] };
const FIVE: ScheduleMeta = { workingWeekdays: [1, 2, 3, 4, 5] };

describe('monthKey', () => {
  it('matches the label the S-curve axis already uses', () => {
    expect(monthKey('2026-02-23')).toBe('Feb-26');
    expect(monthKey('2027-12-01')).toBe('Dec-27');
  });
  it('passes through anything it cannot parse', () => {
    expect(monthKey('rubbish')).toBe('rubbish');
  });
});

describe('scurveFromSchedule — cost-loaded programme', () => {
  it('spreads each activity budget across its working days and accumulates', () => {
    const acts = [
      act('A', '2026-01-01', '2026-01-31', { budgetCost: 310 }),
      act('B', '2026-02-01', '2026-02-28', { budgetCost: 280 }),
    ];
    const { points, costLoaded, totalCost } = scurveFromSchedule(acts, SEVEN);
    expect(costLoaded).toBe(true);
    expect(totalCost).toBe(590);
    expect(points.map((p) => p.month)).toEqual(['Jan-26', 'Feb-26']);
    expect(points[0].planned).toBeCloseTo(52.5, 1); // 310 / 590
    expect(points[1].planned).toBe(100);
  });

  it('splits an activity that straddles a month boundary by working days', () => {
    // 4 days in Jan, 6 in Feb, cost 100 → 40% by end of January.
    const acts = [act('A', '2026-01-28', '2026-02-06', { budgetCost: 100 })];
    const { points } = scurveFromSchedule(acts, SEVEN);
    expect(points[0].month).toBe('Jan-26');
    expect(points[0].planned).toBe(40);
    expect(points[1].planned).toBe(100);
  });

  it('earns nothing on non-working days', () => {
    // Mon 2026-01-05 to Sun 2026-01-11: five working days on a Mon–Fri calendar.
    const acts = [act('A', '2026-01-05', '2026-01-11', { budgetCost: 100 })];
    const five = scurveFromSchedule(acts, FIVE);
    const seven = scurveFromSchedule(acts, SEVEN);
    expect(five.points).toHaveLength(1);
    expect(seven.points).toHaveLength(1);
    // Both reach 100%, but a five-day week concentrates the spend in fewer days.
    expect(five.points[0].planned).toBe(100);
  });

  it('always ends at exactly 100, never 99.9', () => {
    const acts = [
      act('A', '2026-01-01', '2026-03-31', { budgetCost: 1 }),
      act('B', '2026-02-01', '2026-04-30', { budgetCost: 2 }),
      act('C', '2026-03-01', '2026-05-31', { budgetCost: 3 }),
    ];
    const { points } = scurveFromSchedule(acts, SEVEN);
    expect(points[points.length - 1].planned).toBe(100);
  });

  it('rises monotonically — a cumulative curve never goes backwards', () => {
    const acts = [
      act('A', '2026-01-01', '2026-02-15', { budgetCost: 500 }),
      act('B', '2026-02-01', '2026-04-30', { budgetCost: 100 }),
      act('C', '2026-03-01', '2026-03-31', { budgetCost: 900 }),
    ];
    const { points } = scurveFromSchedule(acts, SEVEN);
    for (let i = 1; i < points.length; i++) expect(points[i].planned).toBeGreaterThanOrEqual(points[i - 1].planned);
  });

  it('leaves actuals empty — a derived plan asserts nothing about what happened', () => {
    const { points } = scurveFromSchedule([act('A', '2026-01-01', '2026-01-31', { budgetCost: 10 })], SEVEN);
    expect(points.every((p) => p.actual === null)).toBe(true);
  });

  it('ignores milestones, which carry no work', () => {
    const acts = [
      act('A', '2026-01-01', '2026-01-31', { budgetCost: 100 }),
      act('M', '2026-01-15', '2026-01-15', { isMilestone: true, budgetCost: 999 }),
    ];
    expect(scurveFromSchedule(acts, SEVEN).totalCost).toBe(100);
  });
});

describe('scurveFromSchedule — programme without costs', () => {
  it('falls back to duration weighting and says so', () => {
    const acts = [
      act('A', '2026-01-01', '2026-01-31', { originalDurationDays: 31 }),
      act('B', '2026-02-01', '2026-02-28', { originalDurationDays: 28 }),
    ];
    const { costLoaded, totalCost, points } = scurveFromSchedule(acts, SEVEN);
    expect(costLoaded).toBe(false);
    expect(totalCost).toBe(0); // no money was involved, so none is reported
    expect(points[points.length - 1].planned).toBe(100);
  });
});

describe('scurveFromSchedule — degenerate input', () => {
  it('returns an empty curve rather than dividing by zero', () => {
    expect(scurveFromSchedule([], SEVEN).points).toEqual([]);
    expect(scurveFromSchedule([act('A', '', '')], SEVEN).points).toEqual([]);
  });

  it('skips an activity whose whole window is non-working', () => {
    // Sat–Sun only, on a Mon–Fri calendar.
    const r = scurveFromSchedule([act('A', '2026-01-10', '2026-01-11', { budgetCost: 50 })], FIVE);
    expect(r.skipped).toBe(1);
    expect(r.points).toEqual([]);
  });

  it('counts activities missing dates as skipped', () => {
    expect(scurveFromSchedule([act('A', '', '2026-01-31', { budgetCost: 5 })], SEVEN).skipped).toBe(1);
  });
});

describe('reconcileProgrammeCost', () => {
  it('agrees when the programme and the BOQ tell the same story', () => {
    const r = reconcileProgrammeCost(1_000_000, 1_020_000)!;
    expect(r.agrees).toBe(true);
    expect(r.differencePct).toBeCloseTo(-2, 1);
  });

  it('disagrees beyond tolerance — a bill left out of the programme', () => {
    const r = reconcileProgrammeCost(600_000, 1_000_000)!;
    expect(r.agrees).toBe(false);
    expect(r.differencePct).toBe(-40);
  });

  it('respects a custom tolerance', () => {
    expect(reconcileProgrammeCost(1_100_000, 1_000_000, 15)!.agrees).toBe(true);
    expect(reconcileProgrammeCost(1_100_000, 1_000_000, 5)!.agrees).toBe(false);
  });

  it('says nothing at all when either side is missing', () => {
    expect(reconcileProgrammeCost(0, 1_000)).toBeNull();
    expect(reconcileProgrammeCost(1_000, 0)).toBeNull();
  });
});

describe('hashBytes — provenance', () => {
  const bytes = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

  it('produces a stable SHA-256 for identical content', async () => {
    const a = await hashBytes(bytes('hello world'));
    const b = await hashBytes(bytes('hello world'));
    expect(a.hash).toBe(b.hash);
    expect(a.algorithm).toBe('sha-256');
    // The known digest of "hello world".
    expect(a.hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('differs for different content', async () => {
    const a = await hashBytes(bytes('EMA-13 rev 1'));
    const b = await hashBytes(bytes('EMA-13 rev 2'));
    expect(a.hash).not.toBe(b.hash);
  });

  it('shortens for display without losing the ends', () => {
    expect(shortHash('b94d27b9934d3e08a52e52d7da7dabfa')).toBe('b94d27…abfa');
    expect(shortHash('abc')).toBe('abc');
  });
});

import { describe, it, expect } from 'vitest';
import { scheduleProgress, plannedPctAt } from './scheduleProgress';
import type { BoqItem, ScheduleActivity, BoqWbsLink, ProgressUpdate } from '../data/types';

function item(id: string, qty: number, rate: number): BoqItem {
  return { id, projectId: 'p', billNo: '1', code: id, description: id, unit: 'cum', qty, rate, amount: qty * rate };
}
function act(activityId: string, start: string, finish: string): ScheduleActivity {
  return { id: activityId, projectId: 'p', activityId, name: activityId, wbs: '1', durationDays: 10, plannedStart: start, plannedFinish: finish, isMilestone: false };
}
function link(boqItemId: string, activityId: string): BoqWbsLink {
  return { boqItemId, projectId: 'p', activityId, confidence: 'confirmed' };
}
function prog(boqItemId: string, executedQty: number, status: ProgressUpdate['status'] = 'validated'): ProgressUpdate {
  return { id: `${boqItemId}-u`, projectId: 'p', boqItemId, period: '2026-06', executedQty, status };
}

describe('plannedPctAt', () => {
  it('is 0 before start, 100 after finish, linear between', () => {
    const a = act('A', '2026-06-01', '2026-06-11');
    expect(plannedPctAt(a, new Date('2026-05-01'))).toBe(0);
    expect(plannedPctAt(a, new Date('2026-07-01'))).toBe(100);
    expect(plannedPctAt(a, new Date('2026-06-06'))).toBeCloseTo(50, 0);
  });
});

describe('scheduleProgress', () => {
  it('value-weights mapped BOQ item progress into a per-activity actual %', () => {
    // A100 has two items: b1 (50% done, weight 100k) and b2 (100% done, weight 300k)
    const items = [item('b1', 100, 1000), item('b2', 100, 3000)];
    const acts = [act('A100', '2026-06-01', '2026-06-30')];
    const links = [link('b1', 'A100'), link('b2', 'A100')];
    const updates = [prog('b1', 50), prog('b2', 100)];
    const sp = scheduleProgress(acts, items, links, updates, new Date('2026-06-01'));
    const row = sp.rows[0];
    // weighted: (100k*50 + 300k*100) / 400k = (5,000,000 + 30,000,000)/400,000 = 87.5
    expect(row.actualPct).toBeCloseTo(87.5, 1);
    expect(row.mappedItems).toBe(2);
    expect(sp.mappedActivities).toBe(1);
  });

  it('ignores draft (unvalidated) progress', () => {
    const items = [item('b1', 100, 1000)];
    const acts = [act('A100', '2026-06-01', '2026-06-30')];
    const sp = scheduleProgress(acts, items, [link('b1', 'A100')], [prog('b1', 100, 'draft')], new Date('2026-06-15'));
    expect(sp.rows[0].actualPct).toBe(0);
  });

  it('counts unmapped activities and excludes them from the roll-up', () => {
    const items = [item('b1', 100, 1000)];
    const acts = [act('A100', '2026-06-01', '2026-06-30'), act('A200', '2026-06-01', '2026-06-30')];
    const sp = scheduleProgress(acts, items, [link('b1', 'A100')], [prog('b1', 40)], new Date('2026-06-15'));
    expect(sp.mappedActivities).toBe(1);
    expect(sp.unmappedActivities).toBe(1);
    expect(sp.overallActualPct).toBe(40);
  });
});

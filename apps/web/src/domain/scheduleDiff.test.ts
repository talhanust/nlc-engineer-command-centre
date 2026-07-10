import { describe, it, expect } from 'vitest';
import type { ScheduleActivity, BoqWbsLink } from '../data/types';
import { diffSchedule, isNoOp, diffHeadline, baselineIndex, varianceOf, type DraftActivity } from './scheduleDiff';

const cur = (activityId: string, start: string, finish: string, over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
  id: `act-${activityId}`, projectId: 'p1', activityId, name: activityId, wbs: '1',
  durationDays: 1, plannedStart: start, plannedFinish: finish, isMilestone: false, ...over,
});
const draft = (activityId: string, start: string, finish: string, over: Partial<DraftActivity> = {}): DraftActivity => ({
  activityId, name: activityId, wbs: '1', durationDays: 1,
  plannedStart: start, plannedFinish: finish, isMilestone: false, ...over,
});
const link = (activityId: string, boqItemId = 'i1'): BoqWbsLink => ({ boqItemId, projectId: 'p1', activityId, confidence: 'confirmed' });

describe('diffSchedule', () => {
  it('reports a first import rather than pretending everything is new', () => {
    const d = diffSchedule([], [draft('A', '2026-01-01', '2026-01-05')]);
    expect(d.isFirstImport).toBe(true);
    expect(diffHeadline(d)).toMatch(/First import/);
  });

  it('detects added, removed and unchanged activities', () => {
    const d = diffSchedule(
      [cur('A', '2026-01-01', '2026-01-05'), cur('B', '2026-01-06', '2026-01-10')],
      [draft('A', '2026-01-01', '2026-01-05'), draft('C', '2026-02-01', '2026-02-05')],
    );
    expect(d.added.map((a) => a.activityId)).toEqual(['C']);
    expect(d.removed.map((a) => a.activityId)).toEqual(['B']);
    expect(d.unchanged).toBe(1);
    expect(d.changed).toHaveLength(0);
  });

  it('lists the fields that changed on an activity', () => {
    const d = diffSchedule(
      [cur('A', '2026-01-01', '2026-01-05', { name: 'Old', durationDays: 5 })],
      [draft('A', '2026-01-03', '2026-01-12', { name: 'New', durationDays: 10 })],
    );
    const fields = d.changed[0].changes.map((c) => c.field).sort();
    expect(fields).toEqual(['duration', 'finish', 'name', 'start']);
    expect(d.changed[0].finishSlipDays).toBe(7);
  });

  it('flags removals that would orphan BOQ links — the data-loss case', () => {
    const links = [link('B'), link('B', 'i2'), link('A')];
    const d = diffSchedule(
      [cur('A', '2026-01-01', '2026-01-05'), cur('B', '2026-01-06', '2026-01-10')],
      [draft('A', '2026-01-01', '2026-01-05')],
      links,
    );
    expect(d.orphaned.map((o) => o.activityId)).toEqual(['B']);
    expect(d.orphanedLinkCount).toBe(2);
  });

  it('ignores disputed links when counting orphans', () => {
    const links: BoqWbsLink[] = [{ ...link('B'), confidence: 'disputed' }];
    const d = diffSchedule([cur('B', '2026-01-06', '2026-01-10')], [], links);
    expect(d.orphanedLinkCount).toBe(0);
  });

  it('measures the shift of the programme finish date', () => {
    const d = diffSchedule(
      [cur('A', '2026-01-01', '2026-01-05'), cur('B', '2026-01-06', '2026-01-31')],
      [draft('A', '2026-01-01', '2026-01-05'), draft('B', '2026-01-06', '2026-02-10')],
    );
    expect(d.finishShiftDays).toBe(10);
  });

  it('ranks slipped activities worst first', () => {
    const d = diffSchedule(
      [cur('A', '2026-01-01', '2026-01-05'), cur('B', '2026-01-01', '2026-01-05'), cur('C', '2026-01-01', '2026-01-05')],
      [draft('A', '2026-01-01', '2026-01-08'), draft('B', '2026-01-01', '2026-01-20'), draft('C', '2026-01-01', '2026-01-02')],
    );
    expect(d.slipped.map((s) => s.activityId)).toEqual(['B', 'A']); // C pulled earlier, not slipped
    expect(d.slipped[0].finishSlipDays).toBe(15);
  });

  it('recognises a no-op re-import', () => {
    const same = [cur('A', '2026-01-01', '2026-01-05')];
    const d = diffSchedule(same, [draft('A', '2026-01-01', '2026-01-05')]);
    expect(isNoOp(d)).toBe(true);
    expect(diffHeadline(d)).toMatch(/No changes/);
  });

  it('summarises a mixed diff in one line', () => {
    const d = diffSchedule(
      [cur('A', '2026-01-01', '2026-01-05'), cur('B', '2026-01-01', '2026-01-05')],
      [draft('A', '2026-01-01', '2026-01-09'), draft('C', '2026-01-01', '2026-01-05')],
    );
    expect(diffHeadline(d)).toBe('1 changed · 1 added · 1 removed');
  });
});

describe('baseline variance', () => {
  const baseline = {
    capturedAt: '2026-01-01',
    activities: [
      { activityId: 'A', plannedStart: '2026-01-01', plannedFinish: '2026-01-10', durationDays: 10 },
      { activityId: 'B', plannedStart: '2026-02-01', plannedFinish: '2026-02-10', durationDays: 10 },
    ],
  };
  const index = baselineIndex(baseline);

  it('measures slip against the frozen programme', () => {
    const v = varianceOf(cur('A', '2026-01-05', '2026-01-20'), index)!;
    expect(v.startVarDays).toBe(4);
    expect(v.finishVarDays).toBe(10);
    expect(v.baselineFinish).toBe('2026-01-10');
  });

  it('reports a negative variance when work is pulled earlier', () => {
    expect(varianceOf(cur('B', '2026-01-25', '2026-02-05'), index)!.finishVarDays).toBe(-5);
  });

  it('returns null for an activity absent from the baseline', () => {
    expect(varianceOf(cur('Z', '2026-01-01', '2026-01-02'), index)).toBeNull();
  });

  it('tolerates a missing baseline entirely', () => {
    expect(baselineIndex(null).size).toBe(0);
    expect(varianceOf(cur('A', '2026-01-01', '2026-01-02'), baselineIndex(null))).toBeNull();
  });
});

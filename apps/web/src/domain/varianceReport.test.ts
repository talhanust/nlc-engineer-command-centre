import { describe, it, expect } from 'vitest';
import type { ScheduleActivity, ScheduleBaseline } from '../data/types';
import { varianceReport, floatBand } from './varianceReport';

const act = (activityId: string, finish: string, over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
  id: `id-${activityId}`, projectId: 'p1', activityId, name: activityId, wbs: '1',
  durationDays: 5, plannedStart: '2026-01-01', plannedFinish: finish, isMilestone: false, ...over,
});
const base = (id: string, revision: number, finishes: Record<string, string>): ScheduleBaseline => ({
  id, capturedAt: '2026-01-01', revision,
  activities: Object.entries(finishes).map(([activityId, plannedFinish]) => ({
    activityId, plannedStart: '2026-01-01', plannedFinish, durationDays: 5,
  })),
});

describe('varianceReport — two yardsticks at once', () => {
  // Original said A finishes 10 Jan. Rev 1 granted 10 days (20 Jan).
  // Today A actually finishes 25 Jan: 15 late vs contract, 5 late vs revision.
  const original = base('b0', 0, { A: '2026-01-10', B: '2026-01-20' });
  const revision = base('b1', 1, { A: '2026-01-20', B: '2026-01-20' });
  const current = [act('A', '2026-01-25', { isCritical: true }), act('B', '2026-01-18')];

  const { rows, summary } = varianceReport(current, [original, revision]);

  it('reads slip against the original and the latest revision separately', () => {
    const a = rows.find((r) => r.activityId === 'A')!;
    expect(a.varVsOriginal).toBe(15);
    expect(a.varVsRevision).toBe(5);
  });

  it('reports the slip an approved amendment already absorbed', () => {
    expect(rows.find((r) => r.activityId === 'A')!.absorbedByRevision).toBe(10);
    expect(rows.find((r) => r.activityId === 'B')!.absorbedByRevision).toBe(0);
  });

  it('shows an activity can be behind the contract yet ahead of its revision', () => {
    const b = rows.find((r) => r.activityId === 'B')!;
    expect(b.varVsOriginal).toBe(-2); // pulled earlier than the original too
    expect(b.varVsRevision).toBe(-2);
    expect(summary.aheadVsRevision).toBe(1);
  });

  it('rolls the programme finish up against each frozen programme', () => {
    expect(summary.originalFinish).toBe('2026-01-20');
    expect(summary.revisionFinish).toBe('2026-01-20');
    expect(summary.currentFinish).toBe('2026-01-25');
    expect(summary.finishVsOriginal).toBe(5);
    expect(summary.finishVsRevision).toBe(5);
  });

  it('counts slipped activities and critical slip', () => {
    expect(summary.slippedVsOriginal).toBe(1);
    expect(summary.slippedVsRevision).toBe(1);
    expect(summary.criticalSlipped).toBe(1);
  });

  it('ranks the worst slips against the current commitment', () => {
    expect(summary.worst[0].activityId).toBe('A');
    expect(summary.worst).toHaveLength(1); // B is ahead, not slipped
  });

  it('flags work absent from the original programme as new scope', () => {
    const withNew = varianceReport([...current, act('C', '2026-02-01')], [original, revision]);
    const c = withNew.rows.find((r) => r.activityId === 'C')!;
    expect(c.varVsOriginal).toBeNull();
    expect(c.varVsRevision).toBeNull();
    expect(withNew.summary.newActivities).toBe(1);
  });

  it('measures the amendment at programme level', () => {
    const orig = base('b0', 0, { A: '2026-01-10' });
    const rev = base('b1', 1, { A: '2026-02-10' });
    const r = varianceReport([act('A', '2026-02-10')], [orig, rev]);
    expect(r.summary.absorbedByRevision).toBe(31); // the revision granted 31 days
    expect(r.summary.finishVsRevision).toBe(0);    // and the job is on it
    expect(r.summary.finishVsOriginal).toBe(31);   // while 31 days behind contract
  });
});

describe('varianceReport — single baseline', () => {
  const original = base('b0', 0, { A: '2026-01-10' });

  it('collapses both yardsticks and says so', () => {
    const { rows, summary } = varianceReport([act('A', '2026-01-15')], [original]);
    expect(summary.singleBaseline).toBe(true);
    expect(rows[0].varVsOriginal).toBe(5);
    expect(rows[0].varVsRevision).toBe(5);
    expect(rows[0].absorbedByRevision).toBe(0);
  });

  it('handles no baseline at all without throwing', () => {
    const { rows, summary } = varianceReport([act('A', '2026-01-15')], []);
    expect(rows[0].varVsOriginal).toBeNull();
    expect(summary.finishVsOriginal).toBe(0);
    expect(summary.singleBaseline).toBe(true);
  });
});

describe('floatBand', () => {
  it('calls zero or negative float critical', () => {
    expect(floatBand({ totalFloatDays: 0 })).toBe('critical');
    expect(floatBand({ totalFloatDays: -3 })).toBe('critical');
    expect(floatBand({ isCritical: true, totalFloatDays: 40 })).toBe('critical');
  });

  it('bands the activities one bad week from driving completion', () => {
    expect(floatBand({ totalFloatDays: 1 })).toBe('near_critical');
    expect(floatBand({ totalFloatDays: 10 })).toBe('near_critical');
    expect(floatBand({ totalFloatDays: 11 })).toBe('normal');
  });

  it('takes a configurable threshold', () => {
    expect(floatBand({ totalFloatDays: 15 }, 20)).toBe('near_critical');
  });

  it('reports unknown when the import carried no float', () => {
    expect(floatBand({})).toBe('unknown');
  });
});

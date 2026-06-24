import { describe, it, expect } from 'vitest';
import { criticalPath } from './criticalPath';
import type { ScheduleActivity } from '../data/types';

function act(activityId: string, durationDays: number, predecessors: string[] = []): ScheduleActivity {
  return { id: activityId, projectId: 'p', activityId, name: activityId, wbs: '1', durationDays, plannedStart: '2026-06-01', plannedFinish: '2026-06-10', isMilestone: false, predecessors };
}

describe('criticalPath', () => {
  // A(3) -> B(5) -> D(2) ; A(3) -> C(2) -> D(2). Longest path A-B-D = 10.
  const net = [act('A', 3), act('B', 5, ['A']), act('C', 2, ['A']), act('D', 2, ['B', 'C'])];

  it('computes project duration as the longest path', () => {
    expect(criticalPath(net).projectDuration).toBe(10);
  });

  it('marks the longest-path activities critical and slack ones not', () => {
    const cp = criticalPath(net);
    expect([...cp.criticalIds].sort()).toEqual(['A', 'B', 'D']);
    expect(cp.nodes.get('C')!.critical).toBe(false);
    expect(cp.nodes.get('C')!.totalFloat).toBe(3); // can slip 3 days
    expect(cp.nodes.get('B')!.totalFloat).toBe(0);
  });

  it('gives early/late starts consistent with the schedule', () => {
    const cp = criticalPath(net);
    expect(cp.nodes.get('A')!.es).toBe(0);
    expect(cp.nodes.get('B')!.es).toBe(3);
    expect(cp.nodes.get('D')!.es).toBe(8);
    expect(cp.nodes.get('C')!.ls).toBe(6); // ES 3 + float 3
  });

  it('reports no network (nothing critical) when there are no predecessors', () => {
    const cp = criticalPath([act('A', 3), act('B', 5)]);
    expect(cp.hasNetwork).toBe(false);
    expect(cp.criticalIds.size).toBe(0);
    expect(cp.projectDuration).toBe(5);
  });

  it('does not hang on a cycle', () => {
    const cyclic = [act('A', 2, ['B']), act('B', 2, ['A'])];
    const cp = criticalPath(cyclic);
    expect(cp.nodes.size).toBe(2);
  });
});

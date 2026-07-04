import { describe, it, expect } from 'vitest';
import {
  INITIAL_BASELINE_WORKFLOW, pendingBaselineStage, advanceBaseline, amendBaseline, canEditBaseline,
} from './schedulebaseline';

describe('schedule baseline approval cycle', () => {
  it('runs PM → Manager Plan → PD → Manager Plan (Engrs) → Comd Engineer and locks', () => {
    let s = INITIAL_BASELINE_WORKFLOW;
    expect(pendingBaselineStage(s)?.role).toBe('pm');
    expect(canEditBaseline(s)).toBe(true);
    expect(advanceBaseline(s, 'pd').error).toBeTruthy(); // wrong role
    for (const r of ['pm', 'manager_plan', 'pd', 'manager_plan_engrs', 'comd_engrs']) {
      expect(pendingBaselineStage(s)?.role).toBe(r);
      s = advanceBaseline(s, r).state;
    }
    expect(s.locked).toBe(true);
    expect(canEditBaseline(s)).toBe(false);
  });

  it('amends a locked baseline into a new revision and re-runs', () => {
    let s = { stageIndex: 5, locked: true, revision: 0 };
    expect(amendBaseline({ ...INITIAL_BASELINE_WORKFLOW }).error).toBeTruthy(); // not locked
    s = amendBaseline(s).state;
    expect(s.locked).toBe(false);
    expect(s.revision).toBe(1);
    expect(pendingBaselineStage(s)?.role).toBe('pm');
  });
});

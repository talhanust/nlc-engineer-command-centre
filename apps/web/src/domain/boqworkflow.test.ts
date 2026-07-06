import { describe, it, expect } from 'vitest';
import {
  INITIAL_BOQ_WORKFLOW, pendingBoqStage, advanceBoq, raiseVo, canEditBoq,
} from './boqworkflow';

describe('BOQ lifecycle state machine', () => {
  it('runs the initial chain SQS → PM → Manager Contracts and locks', () => {
    let s = INITIAL_BOQ_WORKFLOW;
    expect(pendingBoqStage(s)?.role).toBe('sqs');
    expect(canEditBoq(s)).toBe(true);

    expect(advanceBoq(s, 'pm').error).toBeTruthy(); // wrong role
    s = advanceBoq(s, 'sqs').state;
    expect(pendingBoqStage(s)?.role).toBe('pm');
    s = advanceBoq(s, 'pm').state;
    expect(pendingBoqStage(s)?.role).toBe('manager_contracts');
    s = advanceBoq(s, 'manager_contracts').state;
    expect(s.locked).toBe(true);
    expect(canEditBoq(s)).toBe(false);
    expect(pendingBoqStage(s)).toBeNull();
  });

  it('raises a VO only when locked and re-runs PM → Manager Contracts → PD', () => {
    let s = { ...INITIAL_BOQ_WORKFLOW, locked: true, stageIndex: 3 };
    expect(raiseVo({ ...INITIAL_BOQ_WORKFLOW }).error).toBeTruthy(); // not locked

    s = raiseVo(s).state;
    expect(s.phase).toBe('vo');
    expect(s.locked).toBe(false);
    expect(s.voCount).toBe(1);
    expect(pendingBoqStage(s)?.role).toBe('pm');

    s = advanceBoq(s, 'pm').state;
    s = advanceBoq(s, 'manager_contracts').state;
    s = advanceBoq(s, 'pd').state;
    expect(s.locked).toBe(true);
  });
});

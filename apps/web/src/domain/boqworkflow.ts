// BOQ lifecycle: initial approval chain locks the BOQ; a variation order (VO)
// unlocks it for editing and runs a second chain that re-locks on PD verification.

export type BoqPhase = 'initial' | 'vo';

export interface BoqStage {
  action: string;
  role: string;
  label: string;
}

/** Pending approval stages after SQS has uploaded the BOQ items. */
export const BOQ_INITIAL_CHAIN: BoqStage[] = [
  { action: 'validate', role: 'sqs', label: 'Validate (SQS)' },
  { action: 'endorse', role: 'pm', label: 'Endorse (PM)' },
  { action: 'verify', role: 'manager_contracts', label: 'Verify & lock (Manager Contracts)' },
];

/** VO chain — runs after SQS edits the BOQ; PD verification re-locks. */
export const BOQ_VO_CHAIN: BoqStage[] = [
  { action: 'validate', role: 'pm', label: 'Validate (PM)' },
  { action: 'endorse', role: 'manager_contracts', label: 'Endorse (Manager Contracts)' },
  { action: 'verify', role: 'pd', label: 'Verify & lock (PD)' },
];

export interface BoqWorkflowState {
  phase: BoqPhase;
  stageIndex: number;
  locked: boolean;
  voCount: number;
}

export const INITIAL_BOQ_WORKFLOW: BoqWorkflowState = {
  phase: 'initial', stageIndex: 0, locked: false, voCount: 0,
};

export function chainFor(phase: BoqPhase): BoqStage[] {
  return phase === 'vo' ? BOQ_VO_CHAIN : BOQ_INITIAL_CHAIN;
}

/** The stage awaiting action, or null when locked. */
export function pendingBoqStage(s: BoqWorkflowState): BoqStage | null {
  if (s.locked) return null;
  return chainFor(s.phase)[s.stageIndex] ?? null;
}

export function canEditBoq(s: BoqWorkflowState): boolean {
  return !s.locked;
}

/** Advance one stage if `role` matches the pending stage; lock when the chain completes. */
export function advanceBoq(s: BoqWorkflowState, role: string): { state: BoqWorkflowState; error?: string } {
  const stage = pendingBoqStage(s);
  if (!stage) return { state: s, error: 'BOQ is locked.' };
  if (stage.role !== role) {
    return { state: s, error: `Awaiting ${stage.role}, not ${role}.` };
  }
  const chain = chainFor(s.phase);
  const nextIndex = s.stageIndex + 1;
  if (nextIndex >= chain.length) {
    return { state: { ...s, stageIndex: chain.length, locked: true } };
  }
  return { state: { ...s, stageIndex: nextIndex } };
}

/** Raise a variation order: only when locked. Unlocks into the VO chain. */
export function raiseVo(s: BoqWorkflowState): { state: BoqWorkflowState; error?: string } {
  if (!s.locked) return { state: s, error: 'BOQ must be locked before raising a VO.' };
  return { state: { phase: 'vo', stageIndex: 0, locked: false, voCount: s.voCount + 1 } };
}

// Execution baseline (Primavera import) approval cycle. Planning Engineer
// imports the baseline; the chain locks it on Comd Engineer approval. An
// amendment unlocks and re-runs the same cycle (revision++).

export interface BaselineStage {
  action: string;
  role: string;
  label: string;
}

export const SCHEDULE_BASELINE_CHAIN: BaselineStage[] = [
  { action: 'validate', role: 'pm', label: 'Validate (PM)' },
  { action: 'scrutinize', role: 'manager_plan', label: 'Scrutinise (Manager Plan HQ PD)' },
  { action: 'endorse', role: 'pd', label: 'Endorse (PD)' },
  { action: 'tech_check', role: 'manager_plan_engrs', label: 'Tech-check (Manager Plan HQ Engrs)' },
  { action: 'approve', role: 'comd_engrs', label: 'Approve & lock (Comd Engineer)' },
];

export interface BaselineWorkflowState {
  stageIndex: number;
  locked: boolean;
  revision: number;
}

export const INITIAL_BASELINE_WORKFLOW: BaselineWorkflowState = { stageIndex: 0, locked: false, revision: 0 };

export function pendingBaselineStage(s: BaselineWorkflowState): BaselineStage | null {
  if (s.locked) return null;
  return SCHEDULE_BASELINE_CHAIN[s.stageIndex] ?? null;
}

export function canEditBaseline(s: BaselineWorkflowState): boolean {
  return !s.locked;
}

export function advanceBaseline(s: BaselineWorkflowState, role: string): { state: BaselineWorkflowState; error?: string } {
  const stage = pendingBaselineStage(s);
  if (!stage) return { state: s, error: 'Baseline is locked.' };
  if (stage.role !== role) return { state: s, error: `Awaiting ${stage.role}, not ${role}.` };
  const nextIndex = s.stageIndex + 1;
  if (nextIndex >= SCHEDULE_BASELINE_CHAIN.length) {
    return { state: { ...s, stageIndex: SCHEDULE_BASELINE_CHAIN.length, locked: true } };
  }
  return { state: { ...s, stageIndex: nextIndex } };
}

/** Amend a locked baseline: unlock and restart the cycle (new revision). */
export function amendBaseline(s: BaselineWorkflowState): { state: BaselineWorkflowState; error?: string } {
  if (!s.locked) return { state: s, error: 'Baseline must be locked before amending.' };
  return { state: { stageIndex: 0, locked: false, revision: s.revision + 1 } };
}

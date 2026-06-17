// Mapping approval: SQS + Planning Engineer + Manager Contracts prepare the
// BOQ↔activity / material↔activity mapping; PM validates; PD approves & locks.
// Changes are re-approved by PD (amend → re-run).
import type { BaselineWorkflowState } from './schedulebaseline';

export interface MappingStage { action: string; role: string; label: string; }

export const MAPPING_CHAIN: MappingStage[] = [
  { action: 'validate', role: 'pm', label: 'Validate (PM)' },
  { action: 'approve', role: 'pd', label: 'Approve & lock (PD)' },
];

export const INITIAL_MAPPING_WORKFLOW: BaselineWorkflowState = { stageIndex: 0, locked: false, revision: 0 };

export function pendingMappingStage(s: BaselineWorkflowState): MappingStage | null {
  if (s.locked) return null;
  return MAPPING_CHAIN[s.stageIndex] ?? null;
}

export function advanceMappingWf(s: BaselineWorkflowState, role: string): { state: BaselineWorkflowState; error?: string } {
  const stage = pendingMappingStage(s);
  if (!stage) return { state: s, error: 'Mapping is locked.' };
  if (stage.role !== role) return { state: s, error: `Awaiting ${stage.role}, not ${role}.` };
  const next = s.stageIndex + 1;
  if (next >= MAPPING_CHAIN.length) return { state: { ...s, stageIndex: MAPPING_CHAIN.length, locked: true } };
  return { state: { ...s, stageIndex: next } };
}

export function amendMappingWf(s: BaselineWorkflowState): { state: BaselineWorkflowState; error?: string } {
  if (!s.locked) return { state: s, error: 'Mapping must be locked before amending.' };
  return { state: { stageIndex: 0, locked: false, revision: s.revision + 1 } };
}

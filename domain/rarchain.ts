// RAR billing approval chains (role-gated). Interim RARs use the short chain;
// final bills run the long HQ-Engineers route ending in a CFO payment authority.

export interface RarStage {
  action: string;
  role: string;
  label: string;
}

export const RAR_INTERIM_CHAIN: RarStage[] = [
  { action: 'endorse', role: 'pm', label: 'Endorse (PM)' },
  { action: 'vet', role: 'preaudit', label: 'Pre-Audit vet' },
  { action: 'approve', role: 'pd', label: 'Approve (PD)' },
  { action: 'pay', role: 'fm', label: 'Mark paid (FM)' },
];

export const RAR_FINAL_CHAIN: RarStage[] = [
  { action: 'endorse', role: 'pm', label: 'Endorse (PM)' },
  { action: 'vet', role: 'preaudit', label: 'Pre-Audit vet' },
  { action: 'submit_hq', role: 'pd', label: 'Submit to HQ Engrs (PD)' },
  { action: 'tech_check', role: 'sdo_tech', label: 'Tech-check (SDO Tech)' },
  { action: 'scrutinize', role: 'manager_contracts', label: 'Scrutinise (Manager Contracts)' },
  { action: 'review', role: 'snr_manager_contracts', label: 'Review (Sr Manager Contracts)' },
  { action: 'recommend', role: 'dy_comd_engrs', label: 'Recommend (Dy Comd Engineer)' },
  { action: 'approve', role: 'comd_engrs', label: 'Approve (Comd Engineers)' },
  { action: 'payment_authority', role: 'cfo', label: 'Issue payment authority (CFO)' },
  { action: 'pay', role: 'fm', label: 'Mark paid (FM HQ PD)' },
];

export function rarChain(isFinal: boolean): RarStage[] {
  return isFinal ? RAR_FINAL_CHAIN : RAR_INTERIM_CHAIN;
}

export interface RarChainState {
  isFinal: boolean;
  stageIndex: number;
}

export function pendingRarStage(s: RarChainState): RarStage | null {
  return rarChain(s.isFinal)[s.stageIndex] ?? null;
}

export function isRarPaid(s: RarChainState): boolean {
  return s.stageIndex >= rarChain(s.isFinal).length;
}

/** Advance one stage if `role` matches the pending stage. */
export function advanceRar(s: RarChainState, role: string): { state: RarChainState; error?: string } {
  const stage = pendingRarStage(s);
  if (!stage) return { state: s, error: 'RAR is fully processed.' };
  if (stage.role !== role) return { state: s, error: `Awaiting ${stage.role}, not ${role}.` };
  return { state: { ...s, stageIndex: s.stageIndex + 1 } };
}

export interface MaintStage { action: string; role: string; label: string; }

export const MAINTENANCE_CHAIN: MaintStage[] = [
  { action: 'validate', role: 'pm', label: 'Validate (PM)' },
  { action: 'approve', role: 'manager_procurement', label: 'Approve (Manager Procurement HQ PD)' },
  { action: 'pay', role: 'fm', label: 'Mark paid (FM)' },
];

export function pendingMaintStage(stageIndex: number): MaintStage | null {
  return MAINTENANCE_CHAIN[stageIndex] ?? null;
}

export function isMaintComplete(stageIndex: number): boolean {
  return stageIndex >= MAINTENANCE_CHAIN.length;
}

export function advanceMaint(stageIndex: number, role: string): { stageIndex: number; error?: string } {
  const stage = pendingMaintStage(stageIndex);
  if (!stage) return { stageIndex, error: 'Request fully processed.' };
  if (stage.role !== role) return { stageIndex, error: `Awaiting ${stage.role}, not ${role}.` };
  return { stageIndex: stageIndex + 1 };
}

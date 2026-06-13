import type { IpcStatus } from '../data/types';

/** The IPC pipeline, ported from the prototype. */
export const IPC_PIPELINE: IpcStatus[] = [
  'draft',
  'submitted',
  'vetted',
  'forwarded_to_client',
  'approved',
  'paid_pending_ack',
  'paid',
];

export const IPC_STATUS_LABEL: Record<IpcStatus, string> = {
  draft: 'Generated (SQS)',
  submitted: 'Submitted to consultant',
  vetted: 'Vetted',
  forwarded_to_client: 'With client',
  approved: 'Approved (client)',
  paid_pending_ack: 'Receipt pending',
  paid: 'Receipt confirmed',
};

interface Transition {
  action: string;
  label: string;
  to: IpcStatus;
  role: string;
}

const TRANSITIONS: Partial<Record<IpcStatus, Transition>> = {
  draft: { action: 'submit', label: 'Validate & submit', to: 'submitted', role: 'pm' },
  submitted: { action: 'vet', label: 'Mark vetted', to: 'vetted', role: 'pm' },
  vetted: { action: 'forward', label: 'Submit to client', to: 'forwarded_to_client', role: 'pm' },
  forwarded_to_client: { action: 'approve', label: 'Mark approved', to: 'approved', role: 'pm' },
  approved: { action: 'ack', label: 'Record receipt', to: 'paid_pending_ack', role: 'fm' },
  paid_pending_ack: { action: 'pay', label: 'Confirm receipt', to: 'paid', role: 'fm' },
};

/** Role responsible for the action available at this status. */
export function transitionRole(status: IpcStatus): string | null {
  return TRANSITIONS[status]?.role ?? null;
}

export function nextTransition(status: IpcStatus): Transition | null {
  return TRANSITIONS[status] ?? null;
}

/** Resolve the target status for an action, validating the edge. */
export function applyAction(status: IpcStatus, action: string): IpcStatus | null {
  const t = TRANSITIONS[status];
  return t && t.action === action ? t.to : null;
}

// Deductions. Demo defaults; production reads these from commercial_settings.
export const DEFAULT_DEDUCTIONS = { retentionPct: 10, incomeTaxPct: 7 };

export function computeNet(gross: number, d = DEFAULT_DEDUCTIONS): number {
  return gross * (1 - (d.retentionPct + d.incomeTaxPct) / 100);
}

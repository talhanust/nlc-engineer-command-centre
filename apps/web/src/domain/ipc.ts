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
  draft: 'Draft',
  submitted: 'Submitted',
  vetted: 'Vetted',
  forwarded_to_client: 'With client',
  approved: 'Approved',
  paid_pending_ack: 'Paid (ack pending)',
  paid: 'Paid',
};

interface Transition {
  action: string;
  label: string;
  to: IpcStatus;
}

const TRANSITIONS: Partial<Record<IpcStatus, Transition>> = {
  draft: { action: 'submit', label: 'Submit', to: 'submitted' },
  submitted: { action: 'vet', label: 'Vet', to: 'vetted' },
  vetted: { action: 'forward', label: 'Forward to client', to: 'forwarded_to_client' },
  forwarded_to_client: { action: 'approve', label: 'Mark approved', to: 'approved' },
  approved: { action: 'ack', label: 'Mark paid (pending ack)', to: 'paid_pending_ack' },
  paid_pending_ack: { action: 'pay', label: 'Confirm paid', to: 'paid' },
};

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

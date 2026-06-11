import type { RarStatus } from '../data/types';

export const RAR_PIPELINE: RarStatus[] = [
  'draft',
  'submitted',
  'verified',
  'approved',
  'marked_payment',
  'paid',
];

export const RAR_STATUS_LABEL: Record<RarStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  verified: 'Verified',
  approved: 'Approved',
  marked_payment: 'Marked for payment',
  paid: 'Paid',
};

interface Transition {
  action: string;
  label: string;
  to: RarStatus;
}

const TRANSITIONS: Partial<Record<RarStatus, Transition>> = {
  draft: { action: 'submit', label: 'Submit', to: 'submitted' },
  submitted: { action: 'verify', label: 'Verify', to: 'verified' },
  verified: { action: 'approve', label: 'Approve', to: 'approved' },
  approved: { action: 'mark_payment', label: 'Mark for payment', to: 'marked_payment' },
  marked_payment: { action: 'pay', label: 'Confirm paid', to: 'paid' },
};

export function nextRarTransition(status: RarStatus): Transition | null {
  return TRANSITIONS[status] ?? null;
}

export function applyRarAction(status: RarStatus, action: string): RarStatus | null {
  const t = TRANSITIONS[status];
  return t && t.action === action ? t.to : null;
}

import type { Variation, VariationStatus, VariationType } from '../data/types';

export const VO_PIPELINE: VariationStatus[] = ['draft', 'submitted', 'recommended', 'approved'];

export const VO_STATUS_LABEL: Record<VariationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  recommended: 'Recommended',
  approved: 'Approved (client)',
  rejected: 'Rejected',
};

export const VO_TYPE_LABEL: Record<VariationType, string> = {
  addition: 'Addition',
  omission: 'Omission',
  substitution: 'Substitution',
  rate_change: 'Rate change',
};

interface VoTransition { action: string; label: string; to: VariationStatus; role: string }

const TRANSITIONS: Partial<Record<VariationStatus, VoTransition>> = {
  draft: { action: 'submit', label: 'Submit', to: 'submitted', role: 'qs' },
  submitted: { action: 'recommend', label: 'Recommend', to: 'recommended', role: 'pm' },
  recommended: { action: 'approve', label: 'Approve', to: 'approved', role: 'pd' },
};

export function nextVoTransition(status: VariationStatus): VoTransition | null {
  return TRANSITIONS[status] ?? null;
}

export function applyVoAction(status: VariationStatus, action: string): VariationStatus | null {
  if (action === 'reject' && status !== 'approved') return 'rejected';
  const t = TRANSITIONS[status];
  return t && t.action === action ? t.to : null;
}

export interface VariationSummary {
  approvedTotal: number;   // signed
  pendingTotal: number;    // signed, not-yet-approved (excl. rejected)
  additions: number;
  omissions: number;
  count: number;
  revisedContractValue: number;
}

export function variationSummary(variations: Variation[], originalContractValue: number): VariationSummary {
  let approvedTotal = 0; let pendingTotal = 0; let additions = 0; let omissions = 0;
  for (const v of variations) {
    if (v.status === 'rejected') continue;
    if (v.status === 'approved') approvedTotal += v.amount; else pendingTotal += v.amount;
    if (v.amount >= 0) additions += v.amount; else omissions += v.amount;
  }
  return {
    approvedTotal, pendingTotal, additions, omissions,
    count: variations.filter((v) => v.status !== 'rejected').length,
    revisedContractValue: originalContractValue + approvedTotal,
  };
}

/** Revised contract value = original + approved variations. */
export function revisedContractValue(originalContractValue: number, variations: Variation[]): number {
  return originalContractValue + variations.filter((v) => v.status === 'approved').reduce((s, v) => s + v.amount, 0);
}

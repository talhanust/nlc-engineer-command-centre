import type { TransferStage } from '../data/types';

export interface PostingStage {
  stage: TransferStage;
  role: string;
  action: string;
  label: string;
}

/**
 * Posting/deployment approval chain. A movement is raised by HR, recommended by
 * the losing PM, approved by the gaining PD, then effected. It can be rejected
 * at any approval step.
 */
export const POSTING_CHAIN: PostingStage[] = [
  { stage: 'raised', role: 'hr', action: 'raise', label: 'Raised' },
  { stage: 'recommended', role: 'pm', action: 'recommend', label: 'Recommended' },
  { stage: 'approved', role: 'pd', action: 'approve', label: 'Approved' },
  { stage: 'effected', role: 'hr', action: 'effect', label: 'Effected' },
];

const ORDER: TransferStage[] = POSTING_CHAIN.map((s) => s.stage);

export function nextTransferStage(stage: TransferStage): TransferStage | null {
  if (stage === 'rejected' || stage === 'effected') return null;
  const i = ORDER.indexOf(stage);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null;
}

export const TRANSFER_STAGE_LABEL: Record<TransferStage, string> = {
  raised: 'Raised', recommended: 'Recommended', approved: 'Approved',
  effected: 'Effected', rejected: 'Rejected',
};

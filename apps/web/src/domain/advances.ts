import type { Advance, BankGuarantee } from '../data/types';

export interface AdvanceSummary {
  received: number;
  recovered: number;
  outstandingClient: number;
  disbursed: number;
  outstandingSub: number;
}

/** Two-sided advance totals for a kind. Recovery flows through IPCs/RARs (wired separately). */
export function advanceSummary(advances: Advance[], kind: Advance['kind'], recovered = 0): AdvanceSummary {
  const k = advances.filter((a) => a.kind === kind);
  const received = k.filter((a) => a.direction === 'client_receipt').reduce((s, a) => s + a.amount, 0);
  const disbursed = k.filter((a) => a.direction === 'sub_disbursement').reduce((s, a) => s + a.amount, 0);
  return {
    received, recovered,
    outstandingClient: +(received - recovered).toFixed(2),
    disbursed,
    outstandingSub: disbursed,
  };
}

export type BgExpiry = 'active' | 'expiring' | 'expired' | 'none';

/** Expiry urgency for a bank guarantee; ≤60 days to expiry counts as "expiring". */
export function bgExpiryStatus(expires?: string, today: Date = new Date()): BgExpiry {
  if (!expires) return 'none';
  const exp = new Date(`${expires}T00:00:00`);
  if (Number.isNaN(exp.getTime())) return 'none';
  const days = Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 60) return 'expiring';
  return 'active';
}

export const BG_EXPIRY_LABEL: Record<BgExpiry, string> = {
  active: 'Valid', expiring: 'Expiring', expired: 'Expired', none: 'No expiry',
};

export function bgActiveCover(bgs: BankGuarantee[], kind: Advance['kind']): number {
  return bgs.filter((b) => b.kind === kind && b.status === 'active').reduce((s, b) => s + b.amount, 0);
}

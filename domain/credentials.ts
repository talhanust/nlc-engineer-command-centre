import type { HrCredential, CredentialKind } from '../data/types';

export const CREDENTIAL_KINDS: CredentialKind[] = ['PEC', 'License', 'Certification', 'Training', 'Medical'];

export type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'none';

/** Status of a credential relative to `today` (default: now). Expiring ≤ 90 days. */
export function expiryStatus(expires: string | undefined, today = new Date(), windowDays = 90): ExpiryStatus {
  if (!expires) return 'none';
  const exp = new Date(expires + (expires.length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(exp.getTime())) return 'none';
  const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= windowDays) return 'expiring';
  return 'valid';
}

export function daysToExpiry(expires: string, today = new Date()): number {
  const exp = new Date(expires + (expires.length <= 10 ? 'T00:00:00' : ''));
  return Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
}

/** Credentials needing attention (expired or expiring), most urgent first. */
export function expiringCredentials(creds: HrCredential[], today = new Date()): HrCredential[] {
  return creds
    .filter((c) => { const s = expiryStatus(c.expires, today); return s === 'expired' || s === 'expiring'; })
    .sort((a, b) => daysToExpiry(a.expires!, today) - daysToExpiry(b.expires!, today));
}

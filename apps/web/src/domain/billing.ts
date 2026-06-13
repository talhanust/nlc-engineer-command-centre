// Billing rules for sublet/labor RARs.
// The spec fixes the withholding splits (sublet 70/30, labor 95/5) and the
// retention release (half with final bill, half after DLP). The retention
// RATE and DLP length are not given by the spec, so they are configurable
// defaults documented here.

export type ContractKind = 'labor' | 'sublet';

export const DEFAULT_RETENTION_RATE = 0.10; // 10% of gross — configurable
export const DEFAULT_DLP_DAYS = 365;        // 1-year Defects Liability Period — configurable

export interface RarPayment {
  gross: number;
  payableNowPct: number; // 70 / 95 / 100
  payableNow: number;
  withheldPct: number;   // 30 / 5 / 0
  withheld: number;      // released later, on IPC payment
  retention: number;     // retention held against this bill
  note: string;
}

/**
 * Interim RAR payment.
 * - Sublet: 70% gross if the client IPC is not yet approved (30% withheld);
 *   the 30% is released on IPC payment, less retention.
 * - Labor: 95% paid; remaining 5% after the IPC is approved.
 * Retention is held at the configured rate on the gross.
 */
export function computeRarPayment(
  gross: number,
  kind: ContractKind,
  ipcApproved: boolean,
  retentionRate = DEFAULT_RETENTION_RATE,
): RarPayment {
  const retention = +(gross * retentionRate).toFixed(2);
  if (ipcApproved) {
    return {
      gross, payableNowPct: 100, payableNow: +(gross - retention).toFixed(2),
      withheldPct: 0, withheld: 0, retention,
      note: 'IPC approved — full gross payable, less retention.',
    };
  }
  if (kind === 'sublet') {
    return {
      gross, payableNowPct: 70, payableNow: +(gross * 0.7).toFixed(2),
      withheldPct: 30, withheld: +(gross * 0.3).toFixed(2), retention,
      note: '70% payable; 30% withheld until IPC payment, then released less retention.',
    };
  }
  // labor
  return {
    gross, payableNowPct: 95, payableNow: +(gross * 0.95).toFixed(2),
    withheldPct: 5, withheld: +(gross * 0.05).toFixed(2), retention,
    note: '95% payable; 5% released after the IPC is approved.',
  };
}

export interface WithheldRelease {
  withheld: number;
  retentionDeducted: number;
  released: number;
}

/** Release the withheld portion on IPC payment; for sublet, deduct retention. */
export function releaseWithheld(withheld: number, kind: ContractKind, retention: number): WithheldRelease {
  const retentionDeducted = kind === 'sublet' ? retention : 0;
  return { withheld, retentionDeducted, released: +(withheld - retentionDeducted).toFixed(2) };
}

export interface RetentionRelease {
  held: number;
  withFinalBill: number; // half released with the final bill
  afterDlp: number;      // half released after the DLP
}

/** Retention is released half with the final bill, half after the DLP. */
export function retentionRelease(held: number): RetentionRelease {
  const half = +(held / 2).toFixed(2);
  return { held, withFinalBill: half, afterDlp: +(held - half).toFixed(2) };
}

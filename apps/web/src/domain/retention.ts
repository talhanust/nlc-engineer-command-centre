import type { Ipc } from '../data/types';
import { DEFAULT_DEDUCTIONS } from './ipc';

export interface RetentionPoint {
  ipcNo: string;
  period: string;
  gross: number;
  held: number; // retention withheld on this IPC
  cumHeld: number; // cumulative retention held to date
}

/**
 * Retention timeline from the IPC register: retention is withheld per IPC at
 * the configured percentage and accumulates until release. Returns one point
 * per IPC (chronological by sequence) with the running balance held.
 */
export function retentionTimeline(ipcs: Ipc[], pct: number = DEFAULT_DEDUCTIONS.retentionPct): RetentionPoint[] {
  let cum = 0;
  return [...ipcs]
    .sort((a, b) => a.seq - b.seq)
    .map((i) => {
      const held = (i.gross * pct) / 100;
      cum += held;
      return { ipcNo: i.ipcNo, period: i.period, gross: i.gross, held, cumHeld: cum };
    });
}

export interface ReleaseSchedule {
  totalHeld: number;
  atCompletion: number; // 50% on substantial completion
  afterDlp: number; // 50% after defect liability period
}

/** Standard NLC release: half on substantial completion, half after DLP. */
export function releaseSchedule(points: RetentionPoint[]): ReleaseSchedule {
  const totalHeld = points.length ? points[points.length - 1].cumHeld : 0;
  return { totalHeld, atCompletion: totalHeld * 0.5, afterDlp: totalHeld * 0.5 };
}

export const DEFAULT_RETENTION_CAP_PCT = 5; // cap retention at 5% of contract value

export interface RetentionSummary {
  deducted: number;        // cumulative retention withheld (capped)
  rawDeducted: number;     // before cap
  cap: number;             // ceiling = capPct% of contract value
  capPct: number;
  capUsedPct: number;      // 0..1 of cap consumed
  atCapped: boolean;
  releasedAtCompletion: number;
  heldForDlp: number;
  releasedAfterDlp: number;
  writtenOff: number;
  finalBillApproved: boolean;
  ipcCount: number;
}

/**
 * Retention position. Retention accrues per IPC at the deduction rate but is
 * capped at capPct% of the contract value. The completion/DLP split is only
 * realised once the Final Bill is client-approved; until then the full balance
 * is "held for DLP".
 */
export function retentionSummary(
  ipcs: Ipc[],
  contractValue: number,
  opts?: { capPct?: number; finalBillApproved?: boolean; pct?: number },
): RetentionSummary {
  const capPct = opts?.capPct ?? DEFAULT_RETENTION_CAP_PCT;
  const finalBillApproved = opts?.finalBillApproved ?? false;
  const points = retentionTimeline(ipcs, opts?.pct);
  const rawDeducted = points.length ? points[points.length - 1].cumHeld : 0;
  const cap = contractValue > 0 ? +(contractValue * capPct / 100).toFixed(2) : Infinity;
  const deducted = Number.isFinite(cap) ? Math.min(rawDeducted, cap) : rawDeducted;
  const releasedAtCompletion = finalBillApproved ? +(deducted * 0.5).toFixed(2) : 0;
  const heldForDlp = finalBillApproved ? +(deducted * 0.5).toFixed(2) : deducted;
  return {
    deducted, rawDeducted, cap, capPct,
    capUsedPct: Number.isFinite(cap) && cap > 0 ? Math.min(1, deducted / cap) : 0,
    atCapped: Number.isFinite(cap) && rawDeducted >= cap && cap > 0,
    releasedAtCompletion, heldForDlp, releasedAfterDlp: 0, writtenOff: 0,
    finalBillApproved, ipcCount: ipcs.length,
  };
}

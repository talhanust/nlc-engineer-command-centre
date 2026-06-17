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

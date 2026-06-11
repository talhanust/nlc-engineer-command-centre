import type { MonthlySeriesPoint } from '../data/types';

/** Fixed 12-month demo timeline; the "current" month is index CURRENT_IDX. */
export const TIMELINE = [
  'Sep-25', 'Oct-25', 'Nov-25', 'Dec-25', 'Jan-26', 'Feb-26',
  'Mar-26', 'Apr-26', 'May-26', 'Jun-26', 'Jul-26', 'Aug-26',
];
export const CURRENT_IDX = 9; // Jun-26 is "now"

/** Smoothstep 0..1 — gives the curve its S shape. */
function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Synthesize a project's monthly cumulative S-curve from its latest
 * planned/actual progress. Planned ramps 0→plannedPct across the timeline;
 * actual ramps 0→actualPct up to "now", then null (not yet incurred).
 */
export function synthSeries(plannedPct: number, actualPct: number): MonthlySeriesPoint[] {
  const n = TIMELINE.length;
  return TIMELINE.map((month, i) => {
    const planned = +(plannedPct * smooth(i / (n - 1))).toFixed(2);
    const actual =
      i <= CURRENT_IDX ? +(actualPct * smooth(i / CURRENT_IDX)).toFixed(2) : null;
    return { month, planned, actual };
  });
}

export interface WeightedPoint {
  month: string;
  planned: number;
  actual: number | null;
}

/**
 * Contract-value-weighted aggregate of several projects' monthly curves —
 * the branch-node portfolio S-curve. A 50 Cr project moves the aggregate more
 * than a 5 Cr one. Returns the weighted planned/actual per month.
 */
export function weightedPortfolioCurve(
  series: Array<{ weight: number; points: MonthlySeriesPoint[] }>,
): WeightedPoint[] {
  const totalWeight = series.reduce((a, s) => a + s.weight, 0) || 1;
  return TIMELINE.map((month, i) => {
    let planned = 0;
    let actualSum = 0;
    let actualWeight = 0;
    for (const s of series) {
      const p = s.points[i];
      if (!p) continue;
      planned += p.planned * s.weight;
      if (p.actual != null) {
        actualSum += p.actual * s.weight;
        actualWeight += s.weight;
      }
    }
    return {
      month,
      planned: +(planned / totalWeight).toFixed(2),
      actual: actualWeight > 0 ? +(actualSum / actualWeight).toFixed(2) : null,
    };
  });
}

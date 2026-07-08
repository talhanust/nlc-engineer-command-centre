import { periodToDate } from './aging';

export interface TrendPoint { period: string; value: number; cum: number }

/** Bucket items by billing period and return per-period + cumulative values, period-sorted. */
export function seriesByPeriod<T>(items: T[], periodOf: (t: T) => string, valueOf: (t: T) => number): TrendPoint[] {
  const m = new Map<string, number>();
  for (const it of items) { const p = periodOf(it); m.set(p, (m.get(p) ?? 0) + valueOf(it)); }
  const periods = [...m.keys()].sort((a, b) => ((periodToDate(a)?.getTime() ?? 0) - (periodToDate(b)?.getTime() ?? 0)) || a.localeCompare(b));
  let cum = 0;
  return periods.map((p) => { const v = m.get(p)!; cum += v; return { period: p, value: v, cum }; });
}

/** Period-over-period change of the latest bucket vs the previous one (null if undefined). */
export function trendDelta(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1].value;
  const prev = points[points.length - 2].value;
  if (prev === 0) return null;
  return (last - prev) / prev;
}

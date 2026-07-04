import { TIMELINE } from './scurve';
import type { Ipc, MonthlySeriesPoint } from '../data/types';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parse an IPC/RAR period string to a TIMELINE month label, or null. */
export function parsePeriodToMonth(period: string): string | null {
  if (!period) return null;
  const p = period.trim().toLowerCase();
  const direct = TIMELINE.find((m) => m.toLowerCase() === p);
  if (direct) return direct;
  return resolve(p);
}

function resolve(p: string): string | null {
  let monIdx = -1, year = -1;
  const nameMatch = p.match(/[a-z]{3,}/);
  if (nameMatch) monIdx = MONTHS.indexOf(nameMatch[0].slice(0, 3));
  const numMatches = p.match(/\d+/g) ?? [];
  for (const n of numMatches) {
    const v = Number(n);
    if (n.length === 4) year = v;
    else if (v >= 1 && v <= 12 && monIdx < 0) monIdx = v - 1;
    else if (n.length <= 2 && year < 0) year = 2000 + v;
  }
  if (monIdx < 0 || year < 0) return null;
  const yy = String(year).slice(-2);
  const label = `${MONTHS[monIdx][0].toUpperCase()}${MONTHS[monIdx].slice(1)}-${yy}`;
  return TIMELINE.includes(label) ? label : null;
}

export type PeriodMap = Record<string, string>; // ipcNo -> month label

/** Auto-default a mapping for any unmapped IPC whose period parses cleanly. */
export function withAutoDefaults(ipcs: Ipc[], map: PeriodMap): PeriodMap {
  const next: PeriodMap = { ...map };
  for (const ipc of ipcs) {
    if (!next[ipc.ipcNo]) {
      const m = parsePeriodToMonth(ipc.period);
      if (m) next[ipc.ipcNo] = m;
    }
  }
  return next;
}

export function coverage(ipcs: Ipc[], map: PeriodMap): number {
  if (ipcs.length === 0) return 0;
  const mapped = ipcs.filter((i) => map[i.ipcNo]).length;
  return Math.round((mapped / ipcs.length) * 100);
}

/** Cumulative billed (gross) as % of contract value, by timeline month. */
export function financialCurve(ipcs: Ipc[], map: PeriodMap, contractValue: number): Array<{ month: string; billedPct: number }> {
  const byMonth = new Map<string, number>();
  for (const ipc of ipcs) {
    const m = map[ipc.ipcNo];
    if (m) byMonth.set(m, (byMonth.get(m) ?? 0) + ipc.gross);
  }
  let cum = 0;
  return TIMELINE.map((month) => {
    cum += byMonth.get(month) ?? 0;
    return { month, billedPct: contractValue > 0 ? +((cum / contractValue) * 100).toFixed(2) : 0 };
  });
}

/** Merge the physical S-curve with the financial (billing) curve for twin charting. */
export function twinSeries(
  physical: MonthlySeriesPoint[],
  financial: Array<{ month: string; billedPct: number }>,
): Array<{ month: string; physical: number | null; financial: number }> {
  const fin = new Map(financial.map((f) => [f.month, f.billedPct]));
  return physical.map((p) => ({ month: p.month, physical: p.actual, financial: fin.get(p.month) ?? 0 }));
}

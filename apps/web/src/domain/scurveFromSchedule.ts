// The planned S-curve, computed from the programme rather than transcribed from
// a second spreadsheet.
//
// Two sources of truth for the same curve will drift, silently, and the drift is
// always discovered at the worst moment. A cost-loaded P6 programme already knows
// what it plans to spend and when: each activity carries a budget (Σ of its
// resource target costs) and a window. Spread the budget across the activity's
// WORKING days — not its calendar days, since nothing is earned on a holiday —
// bucket those days by month, and accumulate. That is the planned curve.
//
// When the programme is not cost-loaded we fall back to weighting by duration, and
// say so: a duration-weighted curve assumes every day of work is worth the same,
// which is a claim about the project, not a fact about it.

import type { ScheduleActivity, ScheduleMeta, MonthlySeriesPoint } from '../data/types';
import { calendarFromMeta, type WorkingCalendar } from './scheduleTree';

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-02-23" → "Feb-26", the label the S-curve axis already uses. */
export function monthKey(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})/);
  if (!m) return ymd;
  return `${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}`;
}

export interface DerivedCurve {
  points: MonthlySeriesPoint[];
  /** Programme budget the curve was built from (0 when duration-weighted). */
  totalCost: number;
  /** True when the curve reflects money; false when it reflects working days. */
  costLoaded: boolean;
  /** Activities that contributed nothing (no dates, or no working days). */
  skipped: number;
}

/** The working days an activity occupies, as YYYY-MM-DD, on the given calendar. */
function workingDaysOf(start: string, finish: string, cal: WorkingCalendar): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  const end = Date.parse(`${finish}T00:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(end) || end < t) return out;
  let guard = 0;
  while (t <= end && guard++ < 20000) {
    const d = new Date(t);
    const ymd = d.toISOString().slice(0, 10);
    if (cal.workingWeekdays.has(d.getUTCDay()) && !cal.holidays.has(ymd)) out.push(ymd);
    t += DAY;
  }
  return out;
}

/**
 * Build the cumulative planned-percentage curve. Milestones carry no work, so
 * they contribute nothing; an activity with no working days in its window (a
 * whole span of holidays) is skipped rather than dividing by zero.
 */
export function scurveFromSchedule(activities: ScheduleActivity[], meta: ScheduleMeta | null | undefined): DerivedCurve {
  const cal = calendarFromMeta(meta);
  const costLoaded = activities.some((a) => (a.budgetCost ?? 0) > 0);

  const perMonth = new Map<string, number>();
  let total = 0;
  let skipped = 0;

  for (const a of activities) {
    if (a.isMilestone) continue;
    if (!a.plannedStart || !a.plannedFinish) { skipped++; continue; }

    // Weight: money if the programme is cost-loaded, otherwise time.
    const weight = costLoaded ? (a.budgetCost ?? 0) : (a.originalDurationDays ?? a.durationDays ?? 0);
    if (weight <= 0) continue;

    const days = workingDaysOf(a.plannedStart, a.plannedFinish, cal);
    if (days.length === 0) { skipped++; continue; }

    const perDay = weight / days.length;
    for (const d of days) {
      const k = monthKey(d);
      perMonth.set(k, (perMonth.get(k) ?? 0) + perDay);
    }
    total += weight;
  }

  if (total <= 0) return { points: [], totalCost: 0, costLoaded, skipped };

  // Chronological order — the map is keyed by label, so sort by the real date.
  const keys = [...perMonth.keys()].sort((a, b) => monthOrder(a) - monthOrder(b));
  const points: MonthlySeriesPoint[] = [];
  let cumulative = 0;
  for (const k of keys) {
    cumulative += perMonth.get(k)!;
    points.push({ month: k, planned: round1((cumulative / total) * 100), actual: null });
  }
  // Floating-point accumulation can leave the last point at 99.9.
  if (points.length > 0) points[points.length - 1].planned = 100;

  return { points, totalCost: costLoaded ? Math.round(total) : 0, costLoaded, skipped };
}

function monthOrder(key: string): number {
  const [mon, yy] = key.split('-');
  const m = MONTHS.indexOf(mon);
  const y = Number(yy);
  if (m < 0 || !Number.isFinite(y)) return 0;
  return (2000 + y) * 12 + m;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * A cost-loaded programme is an INDEPENDENT statement of the contract value. If
 * it disagrees with the BOQ by more than a tolerance, something is wrong — a bill
 * left out of the programme, a resource never loaded. Surfacing that at import is
 * a control, not a nicety.
 */
export interface CostReconciliation {
  programmeCost: number;
  boqAmount: number;
  differencePct: number;
  agrees: boolean;
}

export function reconcileProgrammeCost(programmeCost: number, boqAmount: number, tolerancePct = 5): CostReconciliation | null {
  if (programmeCost <= 0 || boqAmount <= 0) return null;
  const differencePct = ((programmeCost - boqAmount) / boqAmount) * 100;
  return {
    programmeCost,
    boqAmount,
    differencePct: round1(differencePct),
    agrees: Math.abs(differencePct) <= tolerancePct,
  };
}

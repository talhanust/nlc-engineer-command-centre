// Translates commercial executed progress into schedule actuals. The BOQ→WBS
// mapping (Mapping tab) is the bridge: each schedule activity inherits a
// value-weighted % complete from the BOQ items mapped to it, where every item's
// % comes from validated ProgressUpdates in the Commercial module. This is how
// "executed progress updated in Commercial" surfaces as "actual progress" in
// Execution without re-keying anything.
import type { BoqItem, ScheduleActivity, BoqWbsLink, ProgressUpdate } from '../data/types';
import { itemPctComplete } from './progress';

export interface ActivityActual {
  activity: ScheduleActivity;
  mappedItems: number;
  /** value-weighted % from mapped BOQ items (Commercial) */
  actualPct: number;
  /** time-elapsed planned % as of `asOf` */
  plannedPct: number;
  /** actualPct − plannedPct (negative = behind) */
  variancePct: number;
  /** Σ amount of mapped BOQ items (the activity's commercial weight) */
  mappedValue: number;
}

/** Time-based planned % for an activity at `asOf` (clamped 0..100). */
export function plannedPctAt(a: ScheduleActivity, asOf: Date): number {
  const s = Date.parse(a.plannedStart), f = Date.parse(a.plannedFinish);
  if (!Number.isFinite(s) || !Number.isFinite(f)) return 0;
  const now = asOf.getTime();
  if (now <= s) return 0;
  if (now >= f || f <= s) return 100;
  return +(((now - s) / (f - s)) * 100).toFixed(1);
}

export interface ScheduleProgress {
  rows: ActivityActual[];
  overallActualPct: number;  // value-weighted across mapped activities
  overallPlannedPct: number;
  mappedActivities: number;
  unmappedActivities: number;
}

/**
 * Per-activity actuals derived from the BOQ→WBS links and validated progress.
 * `links` connect a BOQ item to an activity by ScheduleActivity.activityId.
 */
export function scheduleProgress(
  activities: ScheduleActivity[],
  items: BoqItem[],
  links: BoqWbsLink[],
  updates: ProgressUpdate[],
  asOf: Date,
): ScheduleProgress {
  const itemById = new Map(items.map((i) => [i.id, i]));
  // activityId → mapped BOQ items
  const byActivity = new Map<string, BoqItem[]>();
  for (const l of links) {
    const it = itemById.get(l.boqItemId);
    if (!it) continue;
    const arr = byActivity.get(l.activityId) ?? [];
    arr.push(it);
    byActivity.set(l.activityId, arr);
  }

  const rows: ActivityActual[] = activities.map((a) => {
    const mapped = byActivity.get(a.activityId) ?? [];
    const mappedValue = mapped.reduce((s, i) => s + i.amount, 0);
    const earned = mapped.reduce((s, i) => s + i.amount * itemPctComplete(i, updates), 0);
    const actualPct = mappedValue > 0 ? +(earned / mappedValue).toFixed(1) : 0;
    const plannedPct = plannedPctAt(a, asOf);
    return {
      activity: a,
      mappedItems: mapped.length,
      actualPct,
      plannedPct,
      variancePct: +(actualPct - plannedPct).toFixed(1),
      mappedValue,
    };
  });

  const weighted = rows.filter((r) => r.mappedValue > 0);
  const totalValue = weighted.reduce((s, r) => s + r.mappedValue, 0);
  const overallActualPct = totalValue > 0
    ? +(weighted.reduce((s, r) => s + r.mappedValue * r.actualPct, 0) / totalValue).toFixed(1)
    : 0;
  const overallPlannedPct = totalValue > 0
    ? +(weighted.reduce((s, r) => s + r.mappedValue * r.plannedPct, 0) / totalValue).toFixed(1)
    : 0;

  return {
    rows,
    overallActualPct,
    overallPlannedPct,
    mappedActivities: weighted.length,
    unmappedActivities: rows.length - weighted.length,
  };
}

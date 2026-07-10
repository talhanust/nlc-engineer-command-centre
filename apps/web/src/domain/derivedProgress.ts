import type { BoqItem, BoqWbsLink, ProgressUpdate, ScheduleActivity } from '../data/types';
import { linksByItem, effectiveWeight } from './mapping';
import { cumulativeExecuted } from './progress';
import type { Alert } from './alerts';

/**
 * Progress → Planning push (reqs 3a(4)(5)(6), 3b(2)). Each activity's physical
 * % is DERIVED from validated executed BOQ quantities through the BOQ↔WBS
 * mapping — one progress entry updates billing AND schedule progress with no
 * re-entry. The derived % is compared with the schedule-expected % (time
 * elapsed between planned start/finish) and flagged when the gap exceeds the
 * configured tolerance.
 */

export interface ActivityDerivedRow {
  activityId: string;
  name: string;
  mappedValue: number;    // Σ item value share mapped to this activity
  executedValue: number;  // Σ executed value share (validated progress only)
  derivedPct: number;     // executed / mapped, 0..100 (null-equivalent -1 when unmapped)
  expectedPct: number;    // schedule-expected % as of `asOf` (time-based)
  divergence: number;     // derivedPct − expectedPct
  mapped: boolean;
}

function timeExpectedPct(a: ScheduleActivity, asOf: string): number {
  const s = Date.parse(a.plannedStart);
  const f = Date.parse(a.plannedFinish);
  const t = Date.parse(asOf);
  if (!Number.isFinite(s) || !Number.isFinite(f) || f <= s) return 0;
  if (t <= s) return 0;
  if (t >= f) return 100;
  return Math.round(((t - s) / (f - s)) * 100);
}

export function activityDerivedProgress(
  acts: ScheduleActivity[],
  items: BoqItem[],
  links: BoqWbsLink[],
  progress: ProgressUpdate[],
  asOf: string,
): ActivityDerivedRow[] {
  const effective = links.filter((l) => l.confidence === 'confirmed'); // only named-user-confirmed links drive planning
  const byItem = linksByItem(effective);
  const itemOf = new Map(items.map((i) => [i.id, i]));

  const mappedValue = new Map<string, number>();
  const executedValue = new Map<string, number>();
  for (const [itemId, itemLinks] of byItem) {
    const item = itemOf.get(itemId);
    if (!item) continue;
    const execQty = cumulativeExecuted(progress, itemId);
    const execVal = Math.min(execQty, item.qty) * item.rate;
    for (const l of itemLinks) {
      // Quantity-allocated links carry exactly the value of their own quantity.
      const w = effectiveWeight(l, itemLinks, item);
      mappedValue.set(l.activityId, (mappedValue.get(l.activityId) ?? 0) + item.amount * w);
      executedValue.set(l.activityId, (executedValue.get(l.activityId) ?? 0) + execVal * w);
    }
  }

  return acts.filter((a) => !a.isMilestone).map((a) => {
    const mv = mappedValue.get(a.activityId) ?? 0;
    const ev = executedValue.get(a.activityId) ?? 0;
    const derivedPct = mv > 0 ? Math.min(100, Math.round((ev / mv) * 100)) : 0;
    const expectedPct = timeExpectedPct(a, asOf);
    return {
      activityId: a.activityId, name: a.name,
      mappedValue: mv, executedValue: ev,
      derivedPct, expectedPct,
      divergence: mv > 0 ? derivedPct - expectedPct : 0,
      mapped: mv > 0,
    };
  });
}

/** Divergence alerts for activities breaching the tolerance (req 3a(6), 3i(1)). */
export function divergenceAlerts(rows: ActivityDerivedRow[], tolerancePct: number): Alert[] {
  return rows
    .filter((r) => r.mapped && Math.abs(r.divergence) > tolerancePct)
    .map((r) => ({
      id: `dv-${r.activityId}`,
      severity: Math.abs(r.divergence) > tolerancePct * 2 ? 'critical' as const : 'warning' as const,
      title: `${r.activityId} ${r.divergence < 0 ? 'behind schedule' : 'ahead of billing baseline'}`,
      detail: `derived ${r.derivedPct}% vs expected ${r.expectedPct}% (±${tolerancePct}% tolerance) — ${r.name}`,
      sub: 'planner',
    }));
}

/** Unmapped-BOQ alert (req 3i(1)) — raised while any BOQ value has no confirmed WBS link. */
export function unmappedBoqAlert(items: BoqItem[], links: BoqWbsLink[]): Alert | null {
  const confirmed = new Set(links.filter((l) => l.confidence === 'confirmed').map((l) => l.boqItemId));
  const unmapped = items.filter((i) => !confirmed.has(i.id));
  if (unmapped.length === 0) return null;
  const value = unmapped.reduce((s, i) => s + i.amount, 0);
  return {
    id: 'um-boq',
    severity: 'warning',
    title: `${unmapped.length} BOQ item${unmapped.length === 1 ? '' : 's'} unmapped to WBS`,
    detail: `PKR ${Math.round(value).toLocaleString('en-PK')} of BOQ value not reflected in schedule progress — resolve in Mapping`,
    sub: 'planner',
  };
}

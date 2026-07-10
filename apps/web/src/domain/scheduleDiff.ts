// Re-importing a revised programme must never be a silent overwrite.
//
// The mapping keys off an activity's CODE (BoqWbsLink.activityId), so an import
// that drops an activity quietly orphans every BOQ link hanging off it, taking
// the quantity allocations with it. This module answers "what would change?"
// before anything is written, and surfaces the orphan risk explicitly.

import type { ScheduleActivity, BoqWbsLink } from '../data/types';

const DAY = 86400000;

export type DraftActivity = Omit<ScheduleActivity, 'id' | 'projectId'>;

export interface FieldChange {
  field: string;
  from: string | number;
  to: string | number;
}
export interface ChangedActivity {
  activityId: string;
  name: string;
  changes: FieldChange[];
  /** Positive = the new finish is later than the old one. */
  finishSlipDays: number;
}
export interface RemovedActivity {
  activityId: string;
  name: string;
  /** Confirmed BOQ links that would be orphaned by removing this activity. */
  linkCount: number;
}
export interface ScheduleDiff {
  isFirstImport: boolean;
  added: DraftActivity[];
  removed: RemovedActivity[];
  changed: ChangedActivity[];
  unchanged: number;
  /** Removed activities that still carry BOQ links — data loss if applied. */
  orphaned: RemovedActivity[];
  orphanedLinkCount: number;
  /** Net movement of the programme finish date, in days. */
  finishShiftDays: number;
  /** Changed activities whose finish moved later, worst first. */
  slipped: ChangedActivity[];
}

const daysBetween = (a: string, b: string): number => {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / DAY);
};

const maxYmd = (rows: Array<{ plannedFinish: string }>): string =>
  rows.reduce((m, r) => (r.plannedFinish > m ? r.plannedFinish : m), '');

/**
 * Compare the schedule already stored against the one about to be imported.
 * `links` lets the diff report which removals would orphan BOQ mappings.
 */
export function diffSchedule(
  current: ScheduleActivity[],
  incoming: DraftActivity[],
  links: BoqWbsLink[] = [],
): ScheduleDiff {
  const linkCounts = new Map<string, number>();
  for (const l of links) {
    if (l.confidence === 'disputed') continue;
    linkCounts.set(l.activityId, (linkCounts.get(l.activityId) ?? 0) + 1);
  }

  const currentBy = new Map(current.map((a) => [a.activityId, a]));
  const incomingBy = new Map(incoming.map((a) => [a.activityId, a]));

  const added = incoming.filter((a) => !currentBy.has(a.activityId));

  const removed: RemovedActivity[] = current
    .filter((a) => !incomingBy.has(a.activityId))
    .map((a) => ({ activityId: a.activityId, name: a.name, linkCount: linkCounts.get(a.activityId) ?? 0 }));

  const changed: ChangedActivity[] = [];
  let unchanged = 0;
  for (const a of current) {
    const b = incomingBy.get(a.activityId);
    if (!b) continue;
    const changes: FieldChange[] = [];
    const cmp = (field: string, from: string | number | undefined, to: string | number | undefined) => {
      const f = from ?? '';
      const t = to ?? '';
      if (f !== t) changes.push({ field, from: f, to: t });
    };
    cmp('name', a.name, b.name);
    cmp('start', a.plannedStart, b.plannedStart);
    cmp('finish', a.plannedFinish, b.plannedFinish);
    cmp('duration', a.durationDays, b.durationDays);
    cmp('status', a.status, b.status);
    cmp('wbs', a.wbs, b.wbs);
    if (changes.length === 0) { unchanged++; continue; }
    changed.push({
      activityId: a.activityId,
      name: b.name,
      changes,
      finishSlipDays: daysBetween(a.plannedFinish, b.plannedFinish),
    });
  }

  const orphaned = removed.filter((r) => r.linkCount > 0);
  const curFinish = maxYmd(current);
  const newFinish = maxYmd(incoming);

  return {
    isFirstImport: current.length === 0,
    added,
    removed,
    changed,
    unchanged,
    orphaned,
    orphanedLinkCount: orphaned.reduce((s, r) => s + r.linkCount, 0),
    finishShiftDays: curFinish && newFinish ? daysBetween(curFinish, newFinish) : 0,
    slipped: changed.filter((c) => c.finishSlipDays > 0).sort((x, y) => y.finishSlipDays - x.finishSlipDays),
  };
}

/** True when applying this import would change nothing at all. */
export function isNoOp(d: ScheduleDiff): boolean {
  return !d.isFirstImport && d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
}

/** One-line human summary, e.g. "142 changed · 8 added · 3 removed". */
export function diffHeadline(d: ScheduleDiff): string {
  if (d.isFirstImport) return 'First import — nothing to compare against.';
  if (isNoOp(d)) return 'No changes — the imported programme matches the current one.';
  const parts: string[] = [];
  if (d.changed.length) parts.push(`${d.changed.length} changed`);
  if (d.added.length) parts.push(`${d.added.length} added`);
  if (d.removed.length) parts.push(`${d.removed.length} removed`);
  if (d.unchanged) parts.push(`${d.unchanged} unchanged`);
  return parts.join(' · ');
}

// ---- Variance against the frozen baseline ----

export interface Variance {
  /** Positive = current start is later than baseline. */
  startVarDays: number;
  /** Positive = current finish is later than baseline (slip). */
  finishVarDays: number;
  baselineStart: string;
  baselineFinish: string;
}

/** Index the baseline by activity code for O(1) variance lookups. */
export function baselineIndex(
  baseline: { activities: Array<{ activityId: string; plannedStart: string; plannedFinish: string }> } | null | undefined,
): Map<string, { plannedStart: string; plannedFinish: string }> {
  const m = new Map<string, { plannedStart: string; plannedFinish: string }>();
  for (const b of baseline?.activities ?? []) m.set(b.activityId, { plannedStart: b.plannedStart, plannedFinish: b.plannedFinish });
  return m;
}

/** Variance of one activity against the baseline, or null when not baselined. */
export function varianceOf(
  activity: { activityId: string; plannedStart: string; plannedFinish: string },
  index: Map<string, { plannedStart: string; plannedFinish: string }>,
): Variance | null {
  const b = index.get(activity.activityId);
  if (!b) return null;
  return {
    startVarDays: daysBetween(b.plannedStart, activity.plannedStart),
    finishVarDays: daysBetween(b.plannedFinish, activity.plannedFinish),
    baselineStart: b.plannedStart,
    baselineFinish: b.plannedFinish,
  };
}

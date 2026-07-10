// The variance report a PD signs.
//
// With more than one frozen programme, slip has to be read two ways at once:
//   • against the ORIGINAL approval — the programme the contract was signed
//     against, and the yardstick an extension-of-time claim is argued from;
//   • against the LATEST approved revision — what the team committed to most
//     recently, and therefore what day-to-day performance is judged on.
//
// The difference between the two is the slip an approved amendment already
// absorbed. Presenting it explicitly is the point: a project can be twelve weeks
// behind the contract while perfectly on top of its current revision, and both
// statements are true.

import type { ScheduleActivity, ScheduleBaseline } from '../data/types';
import { baselineIndex } from './scheduleDiff';

const DAY = 86400000;

const daysBetween = (a: string, b: string): number => {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / DAY);
};

export interface VarianceRow {
  activityId: string;
  name: string;
  isCritical: boolean;
  currentFinish: string;
  /** Baseline finishes, blank when the activity is absent from that programme. */
  originalFinish: string;
  revisionFinish: string;
  /** Positive = later than the original approval. null when not in it (new work). */
  varVsOriginal: number | null;
  /** Positive = later than the latest approved revision. */
  varVsRevision: number | null;
  /**
   * Slip already absorbed by approved amendments: how far the revision moved the
   * finish away from the original. Positive = the revision granted time.
   */
  absorbedByRevision: number | null;
}

export interface VarianceSummary {
  /** Programme finish under each frozen programme, and today's. */
  currentFinish: string;
  originalFinish: string;
  revisionFinish: string;
  /** Programme-level slip. */
  finishVsOriginal: number;
  finishVsRevision: number;
  absorbedByRevision: number;
  slippedVsOriginal: number;
  slippedVsRevision: number;
  aheadVsRevision: number;
  /** Activities absent from the original programme — new scope. */
  newActivities: number;
  criticalSlipped: number;
  /** Worst slips against the latest revision, worst first. */
  worst: VarianceRow[];
  /** True when only one programme has ever been approved. */
  singleBaseline: boolean;
}

export interface VarianceReport {
  rows: VarianceRow[];
  summary: VarianceSummary;
}

const maxFinish = (rows: Array<{ plannedFinish: string }>): string =>
  rows.reduce((m, r) => (r.plannedFinish > m ? r.plannedFinish : m), '');

/**
 * Build the report. `baselines` is the full set, oldest first: index 0 is the
 * original, the last entry is the latest approved revision. With a single
 * baseline the two collapse and `singleBaseline` says so, so the UI can hide the
 * columns rather than print zeroes.
 */
export function varianceReport(activities: ScheduleActivity[], baselines: ScheduleBaseline[]): VarianceReport {
  const original = baselines[0] ?? null;
  const revision = baselines.length > 1 ? baselines[baselines.length - 1] : original;
  const singleBaseline = baselines.length <= 1;

  const origIdx = baselineIndex(original);
  const revIdx = baselineIndex(revision);

  const acts = activities.filter((a) => !a.isMilestone || a.plannedFinish);
  const rows: VarianceRow[] = acts.map((a) => {
    const o = origIdx.get(a.activityId);
    const r = revIdx.get(a.activityId);
    const varVsOriginal = o ? daysBetween(o.plannedFinish, a.plannedFinish) : null;
    const varVsRevision = r ? daysBetween(r.plannedFinish, a.plannedFinish) : null;
    return {
      activityId: a.activityId,
      name: a.name,
      isCritical: a.isCritical === true,
      currentFinish: a.plannedFinish,
      originalFinish: o?.plannedFinish ?? '',
      revisionFinish: r?.plannedFinish ?? '',
      varVsOriginal,
      varVsRevision,
      absorbedByRevision: o && r ? daysBetween(o.plannedFinish, r.plannedFinish) : null,
    };
  });

  const currentFinish = maxFinish(acts);
  const originalFinish = maxFinish(original?.activities ?? []);
  const revisionFinish = maxFinish(revision?.activities ?? []);

  const summary: VarianceSummary = {
    currentFinish,
    originalFinish,
    revisionFinish,
    finishVsOriginal: originalFinish && currentFinish ? daysBetween(originalFinish, currentFinish) : 0,
    finishVsRevision: revisionFinish && currentFinish ? daysBetween(revisionFinish, currentFinish) : 0,
    absorbedByRevision: originalFinish && revisionFinish ? daysBetween(originalFinish, revisionFinish) : 0,
    slippedVsOriginal: rows.filter((r) => (r.varVsOriginal ?? 0) > 0).length,
    slippedVsRevision: rows.filter((r) => (r.varVsRevision ?? 0) > 0).length,
    aheadVsRevision: rows.filter((r) => (r.varVsRevision ?? 0) < 0).length,
    newActivities: rows.filter((r) => r.varVsOriginal === null).length,
    criticalSlipped: rows.filter((r) => r.isCritical && (r.varVsRevision ?? 0) > 0).length,
    worst: [...rows]
      .filter((r) => (r.varVsRevision ?? 0) > 0)
      .sort((x, y) => (y.varVsRevision ?? 0) - (x.varVsRevision ?? 0))
      .slice(0, 10),
    singleBaseline,
  };

  return { rows, summary };
}

/**
 * Float bands. The critical path tells you what IS late; the near-critical band
 * tells you what is about to be — the activities one bad week from driving the
 * completion date.
 */
export type FloatBand = 'critical' | 'near_critical' | 'normal' | 'unknown';

export function floatBand(activity: { totalFloatDays?: number; isCritical?: boolean }, nearDays = 10): FloatBand {
  if (activity.isCritical) return 'critical';
  if (activity.totalFloatDays == null) return 'unknown';
  if (activity.totalFloatDays <= 0) return 'critical';
  return activity.totalFloatDays <= nearDays ? 'near_critical' : 'normal';
}

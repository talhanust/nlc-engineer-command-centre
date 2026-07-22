// Builds the P6-style Activities view: WBS summary rows interleaved with the
// activities that sit under them, each summary rolling its descendants up.
//
// Rollup rules follow Primavera:
//  - Start  = earliest descendant start, Finish = latest descendant finish.
//  - Original / Remaining Duration = the WORKING-DAY span of that window on the
//    project calendar (not the sum of child durations — a WBS containing two
//    milestones twelve months apart shows twelve months, not zero).
//  - Schedule % Complete = duration-weighted mean of the leaf activities, so a
//    long activity moves the parent more than a one-day one.
//
// Activities whose WBS id is missing (pasted / .xlsx imports carry no
// hierarchy) fall back to a flat list, which is exactly the old behaviour.

import type { ScheduleActivity, ScheduleWbsNode, ScheduleMeta } from '../data/types';

const DAY_MS = 86400000;

export interface WorkingCalendar {
  workingWeekdays: Set<number>;
  holidays: Set<string>;
}

export function calendarFromMeta(meta: ScheduleMeta | null | undefined): WorkingCalendar {
  const days = meta?.workingWeekdays?.length ? meta.workingWeekdays : [0, 1, 2, 3, 4, 5, 6];
  return { workingWeekdays: new Set(days), holidays: new Set(meta?.holidays ?? []) };
}

/** Inclusive count of working days between two YYYY-MM-DD dates. */
export function workingDaySpan(startYmd: string, finishYmd: string, cal: WorkingCalendar): number {
  if (!startYmd || !finishYmd) return 0;
  let t = Date.parse(`${startYmd}T00:00:00Z`);
  const end = Date.parse(`${finishYmd}T00:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(end) || end < t) return 0;
  let days = 0;
  let guard = 0;
  while (t <= end && guard++ < 20000) {
    const d = new Date(t);
    if (cal.workingWeekdays.has(d.getUTCDay()) && !cal.holidays.has(d.toISOString().slice(0, 10))) days++;
    t += DAY_MS;
  }
  return days;
}

export interface ScheduleRow {
  kind: 'wbs' | 'activity';
  /** Stable key: wbs node id, or the activity's row id. */
  key: string;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  /** Activity ID for activities; WBS code for summary rows. */
  code: string;
  name: string;
  originalDuration: number;
  remainingDuration: number;
  schedulePct: number;
  start: string;
  finish: string;
  isMilestone: boolean;
  isCritical: boolean;
  /** Present only on activity rows. */
  activity?: ScheduleActivity;
}

interface Agg {
  start: string;
  finish: string;
  weighted: number;
  weight: number;
  leaves: number;
  critical: boolean;
}

const minYmd = (a: string, b: string): string => (!a ? b : !b ? a : a < b ? a : b);
const maxYmd = (a: string, b: string): string => (!a ? b : !b ? a : a > b ? a : b);

const origOf = (a: ScheduleActivity): number => a.originalDurationDays ?? a.durationDays ?? 0;
const remOf = (a: ScheduleActivity): number => a.remainingDurationDays ?? a.durationDays ?? 0;
const pctOf = (a: ScheduleActivity): number => a.schedulePctComplete ?? a.pctComplete ?? 0;

/**
 * Flatten the WBS tree into display rows, honouring the collapsed set.
 * Returns a flat list ready to render — WBS rows carry rolled-up figures.
 */
export function buildScheduleRows(
  activities: ScheduleActivity[],
  wbsNodes: ScheduleWbsNode[],
  meta: ScheduleMeta | null | undefined,
  collapsed: ReadonlySet<string>,
): ScheduleRow[] {
  const cal = calendarFromMeta(meta);

  // No hierarchy (pasted / .xlsx import) → flat activity list, as before.
  const usable = wbsNodes.filter((n) => n.id);
  if (usable.length === 0 || !activities.some((a) => a.wbsId)) {
    return activities.map((a) => activityRow(a, 0));
  }

  const childrenOf = new Map<string | null, ScheduleWbsNode[]>();
  for (const n of usable) {
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a.seq - b.seq || a.code.localeCompare(b.code));

  const actsOf = new Map<string, ScheduleActivity[]>();
  const orphans: ScheduleActivity[] = [];
  const known = new Set(usable.map((n) => n.id));
  for (const a of activities) {
    if (a.wbsId && known.has(a.wbsId)) {
      const list = actsOf.get(a.wbsId) ?? [];
      list.push(a);
      actsOf.set(a.wbsId, list);
    } else {
      orphans.push(a);
    }
  }
  for (const list of actsOf.values()) {
    list.sort((x, y) => (x.plannedStart || '').localeCompare(y.plannedStart || '') || x.activityId.localeCompare(y.activityId));
  }

  // Post-order aggregation so a parent sees its children's rollups.
  const agg = new Map<string, Agg>();
  function aggregate(node: ScheduleWbsNode): Agg {
    const acc: Agg = { start: '', finish: '', weighted: 0, weight: 0, leaves: 0, critical: false };
    for (const a of actsOf.get(node.id) ?? []) {
      acc.start = minYmd(acc.start, a.plannedStart);
      acc.finish = maxYmd(acc.finish, a.plannedFinish);
      const w = Math.max(origOf(a), 1); // milestones still carry a vote
      acc.weighted += pctOf(a) * w;
      acc.weight += w;
      acc.leaves++;
      if (a.isCritical) acc.critical = true;
    }
    for (const child of childrenOf.get(node.id) ?? []) {
      const c = aggregate(child);
      acc.start = minYmd(acc.start, c.start);
      acc.finish = maxYmd(acc.finish, c.finish);
      acc.weighted += c.weighted;
      acc.weight += c.weight;
      acc.leaves += c.leaves;
      acc.critical = acc.critical || c.critical;
    }
    agg.set(node.id, acc);
    return acc;
  }
  for (const root of childrenOf.get(null) ?? []) aggregate(root);

  const rows: ScheduleRow[] = [];
  function walk(node: ScheduleWbsNode, depth: number): void {
    const a = agg.get(node.id) ?? { start: '', finish: '', weighted: 0, weight: 0, leaves: 0, critical: false };
    if (a.leaves === 0) return; // don't show empty branches of the WBS
    const kids = childrenOf.get(node.id) ?? [];
    const own = actsOf.get(node.id) ?? [];
    const hasChildren = kids.length > 0 || own.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const span = workingDaySpan(a.start, a.finish, cal);
    rows.push({
      kind: 'wbs',
      key: node.id,
      depth,
      hasChildren,
      collapsed: isCollapsed,
      code: node.code,
      name: node.name,
      originalDuration: span,
      remainingDuration: a.weight > 0 && a.weighted >= a.weight * 100 ? 0 : span,
      schedulePct: a.weight > 0 ? Math.round(a.weighted / a.weight) : 0,
      start: a.start,
      finish: a.finish,
      isMilestone: false,
      isCritical: a.critical,
    });
    if (isCollapsed) return;
    for (const child of kids) walk(child, depth + 1);
    for (const act of own) rows.push(activityRow(act, depth + 1));
  }
  for (const root of childrenOf.get(null) ?? []) walk(root, 0);

  // Activities that reference no known WBS node still have to be reachable.
  for (const a of orphans) rows.push(activityRow(a, 0));
  return rows;
}

function activityRow(a: ScheduleActivity, depth: number): ScheduleRow {
  return {
    kind: 'activity',
    key: a.id,
    depth,
    hasChildren: false,
    collapsed: false,
    code: a.activityId,
    name: a.name,
    originalDuration: origOf(a),
    remainingDuration: remOf(a),
    schedulePct: pctOf(a),
    start: a.plannedStart,
    finish: a.plannedFinish,
    isMilestone: a.isMilestone,
    isCritical: a.isCritical === true,
    activity: a,
  };
}

/** All WBS node ids, for expand-all / collapse-all. */
export function allWbsIds(nodes: ScheduleWbsNode[]): string[] {
  return nodes.map((n) => n.id);
}

/** "2026-02-23" → "23-Feb-26", the format P6 users read. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatP6Date(ymd: string): string {
  if (!ymd) return '';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const month = MONTHS[Number(m[2]) - 1] ?? '???';
  return `${m[3]}-${month}-${m[1].slice(2)}`;
}

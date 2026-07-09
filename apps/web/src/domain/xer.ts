// Primavera P6 .xer parser + mapper.
//
// An .xer file is P6's native interchange format: a tab-delimited dump of many
// relational tables. Each line begins with a record tag:
//   ERMHDR  – file header (version, date, currency …)
//   %T <table>   – begins a table
//   %F <f1> <f2> – field (column) names for the current table
//   %R <v1> <v2> – one data record (values line up with the %F names)
//   %E           – end of file
// Values are separated by TAB; a literal empty value is an empty field.
//
// This module is pure (no DOM): parseXer() turns the text into a typed table
// map, and xerToSchedule() maps the P6 tables onto our ScheduleActivity model,
// resolving the WBS hierarchy, calendars (hours→days), relationship logic,
// resource assignments, %-complete and total-float/critical flags.

import type { ScheduleActivity, ActivityStatus, SchedulePredecessor, ScheduleWbsNode } from '../data/types';

export interface XerTable {
  fields: string[];
  rows: Array<Record<string, string>>;
}
export interface XerDatabase {
  header: string[];
  tables: Record<string, XerTable>;
}

/** A P6 calendar reduced to what schedule maths needs. */
export interface XerCalendar {
  dayHours: number;
  /** JS weekday numbers (0 = Sunday) that carry at least one work shift. */
  workingWeekdays: Set<number>;
  /** Holiday exceptions as YYYY-MM-DD. */
  holidays: Set<string>;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

/** P6 stores calendar exceptions as Excel-style day serials. */
function serialToYmd(serial: number): string {
  return new Date(EXCEL_EPOCH_MS + serial * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Parse CALENDAR.clndr_data. The payload looks like:
 *   (0||CalendarData()(
 *     (0||DaysOfWeek()(
 *       (0||1()(  (0||0(s|08:00|f|16:00)())))   ← day 1 = Sunday, has a shift
 *       (0||2()())                              ← no shift = non-working
 *     ...
 *     (0||Exceptions()( (0||0(d|37257)()) ... ))
 * A weekday is a working day when its block contains at least one shift ("s|").
 */
export function parseCalendarData(data: string | undefined, dayHours: number): XerCalendar {
  const workingWeekdays = new Set<number>();
  const holidays = new Set<string>();
  if (!data) {
    // No pattern available — assume a full week so durations never silently shrink.
    for (let d = 0; d < 7; d++) workingWeekdays.add(d);
    return { dayHours, workingWeekdays, holidays };
  }

  const dowStart = data.indexOf('DaysOfWeek');
  const excStart = data.indexOf('Exceptions');
  if (dowStart >= 0) {
    let end = data.length;
    for (const marker of ['VIEW', 'Exceptions']) {
      const i = data.indexOf(marker, dowStart);
      if (i > dowStart) end = Math.min(end, i);
    }
    const block = data.slice(dowStart, end);
    // Split on day markers "(0||<n>()(" keeping the day number.
    const parts = block.split(/\(0\|\|([1-7])\(\)\(/);
    for (let i = 1; i < parts.length; i += 2) {
      const p6Day = Number(parts[i]);          // 1 = Sunday … 7 = Saturday
      const segment = parts[i + 1] ?? '';
      if (segment.includes('s|')) workingWeekdays.add((p6Day - 1) % 7);
    }
  }
  if (workingWeekdays.size === 0) for (let d = 0; d < 7; d++) workingWeekdays.add(d);

  if (excStart >= 0) {
    const block = data.slice(excStart);
    for (const m of block.matchAll(/\(d\|(\d+)\)/g)) {
      const serial = Number(m[1]);
      if (Number.isFinite(serial) && serial > 0) holidays.add(serialToYmd(serial));
    }
  }
  return { dayHours, workingWeekdays, holidays };
}

/** Inclusive count of working days between two YYYY-MM-DD dates on a calendar. */
export function workingDaysBetween(startYmd: string, finishYmd: string, cal: XerCalendar): number {
  if (!startYmd || !finishYmd) return 0;
  let t = Date.parse(`${startYmd}T00:00:00Z`);
  const end = Date.parse(`${finishYmd}T00:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(end) || end < t) return 0;
  let days = 0;
  let guard = 0;
  while (t <= end && guard++ < 20000) {
    const d = new Date(t);
    const ymd = d.toISOString().slice(0, 10);
    if (cal.workingWeekdays.has(d.getUTCDay()) && !cal.holidays.has(ymd)) days++;
    t += DAY_MS;
  }
  return days;
}

/** Parse raw .xer text into a typed table map. Tolerant of \r\n and stray blanks. */
export function parseXer(text: string): XerDatabase {
  const db: XerDatabase = { header: [], tables: {} };
  let current: XerTable | null = null;
  // Split on newlines; XER uses \r\n but we tolerate either.
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line === '') continue;
    const cells = line.split('\t');
    const tag = cells[0];
    if (tag === 'ERMHDR') {
      db.header = cells.slice(1);
    } else if (tag === '%T') {
      const name = cells[1] ?? '';
      current = { fields: [], rows: [] };
      db.tables[name] = current;
    } else if (tag === '%F') {
      if (current) current.fields = cells.slice(1);
    } else if (tag === '%R') {
      if (current) {
        const values = cells.slice(1);
        const rec: Record<string, string> = {};
        for (let i = 0; i < current.fields.length; i++) rec[current.fields[i]] = values[i] ?? '';
        current.rows.push(rec);
      }
    } else if (tag === '%E') {
      current = null;
    }
    // Unknown tags are ignored.
  }
  return db;
}

const rowsOf = (db: XerDatabase, table: string): Array<Record<string, string>> => db.tables[table]?.rows ?? [];

/** "2026-02-23 08:00" | "2026-02-23" → "2026-02-23"; blank → ''. */
function ymd(raw: string | undefined): string {
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
const num = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const STATUS: Record<string, ActivityStatus> = {
  TK_NotStart: 'not_started',
  TK_Active: 'in_progress',
  TK_Complete: 'completed',
};
const PRED_TYPE: Record<string, SchedulePredecessor['type']> = {
  PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF',
};
const MILESTONE_TYPES = new Set(['TT_Mile', 'TT_FinMile']);

export interface XerScheduleResult {
  /** Rows ready for provider.replaceSchedule (no id/projectId). */
  activities: Array<Omit<ScheduleActivity, 'id' | 'projectId'>>;
  /** The WBS hierarchy the activities hang from (project root excluded). */
  wbs: ScheduleWbsNode[];
  projectShortName: string;
  projectName: string;
  planStart: string;
  planFinish: string;
  /** P6 data date (last_recalc_date) — the "as of" line on the Gantt. */
  dataDate: string;
  /** Working pattern of the programme's dominant calendar (JS weekdays, 0=Sun). */
  workingWeekdays: number[];
  holidays: string[];
  wbsCount: number;
  milestoneCount: number;
  relationshipCount: number;
  resourceCount: number;
  /** Non-fatal notes surfaced to the user (multi-project file, dropped rows …). */
  warnings: string[];
}

/**
 * Map a parsed P6 database onto our schedule model. Resolves:
 *  - WBS code path ("2.4.1") and readable name path ("Construction › Zone 1")
 *  - duration in days = target_drtn_hr_cnt ÷ calendar day-hours
 *  - planned / actual dates, %-complete, status
 *  - total float (days) and critical flag (total float ≤ 0)
 *  - predecessor logic (resolved to activity codes, with type + lag in days)
 *  - resource assignment names
 */
export function xerToSchedule(db: XerDatabase): XerScheduleResult {
  const warnings: string[] = [];

  const projects = rowsOf(db, 'PROJECT');
  if (projects.length === 0) warnings.push('No PROJECT record found in the file.');
  if (projects.length > 1) warnings.push(`File contains ${projects.length} projects — importing all activities.`);
  const project = projects[0] ?? {};

  // Calendars: id → work pattern (hours/day, working weekdays, holidays).
  const calendars = new Map<string, XerCalendar>();
  for (const c of rowsOf(db, 'CALENDAR')) {
    const h = num(c.day_hr_cnt);
    calendars.set(c.clndr_id, parseCalendarData(c.clndr_data, h > 0 ? h : 8));
  }
  const DEFAULT_CAL: XerCalendar = { dayHours: 8, workingWeekdays: new Set([0, 1, 2, 3, 4, 5, 6]), holidays: new Set() };
  const calOf = (clndrId: string | undefined): XerCalendar => (clndrId && calendars.get(clndrId)) || DEFAULT_CAL;
  const hrsPerDay = (clndrId: string | undefined): number => calOf(clndrId).dayHours;

  // WBS: id → node, plus helpers to walk the parent chain up to (not incl.) the
  // project root node (proj_node_flag = 'Y').
  const wbs = new Map<string, Record<string, string>>();
  for (const w of rowsOf(db, 'PROJWBS')) wbs.set(w.wbs_id, w);
  const isRoot = (id: string | undefined): boolean => !!id && wbs.get(id)?.proj_node_flag === 'Y';
  function wbsChain(wbsId: string | undefined): Array<Record<string, string>> {
    const chain: Array<Record<string, string>> = [];
    const seen = new Set<string>();
    let id = wbsId;
    while (id && wbs.has(id) && !seen.has(id)) {
      seen.add(id);
      const node = wbs.get(id)!;
      if (node.proj_node_flag === 'Y') break; // stop at the project root
      chain.push(node);
      id = node.parent_wbs_id;
    }
    return chain.reverse();
  }
  const wbsCode = (wbsId: string | undefined): string => {
    const parts = wbsChain(wbsId).map((n) => n.wbs_short_name || '?');
    return parts.join('.') || '1';
  };
  const wbsPath = (wbsId: string | undefined): string =>
    wbsChain(wbsId).map((n) => n.wbs_name || n.wbs_short_name || '?').join(' › ');

  // The WBS hierarchy as a flat parent-pointer list, project root dropped and
  // its children re-parented to null so the tree has visible top-level branches.
  const wbsNodes: ScheduleWbsNode[] = [];
  for (const w of rowsOf(db, 'PROJWBS')) {
    if (w.proj_node_flag === 'Y') continue;
    wbsNodes.push({
      id: w.wbs_id,
      parentId: isRoot(w.parent_wbs_id) ? null : (w.parent_wbs_id || null),
      code: wbsCode(w.wbs_id),
      name: w.wbs_name || w.wbs_short_name || '?',
      seq: num(w.seq_num),
    });
  }

  // task_id → task_code, so relationships can reference readable activity ids.
  const taskCode = new Map<string, string>();
  for (const t of rowsOf(db, 'TASK')) taskCode.set(t.task_id, t.task_code);

  // task_id → its calendar day-hours, so relationship lag converts to whole days.
  const taskDayHours = new Map<string, number>();
  for (const t of rowsOf(db, 'TASK')) taskDayHours.set(t.task_id, hrsPerDay(t.clndr_id));

  // Predecessors grouped by successor task_id.
  const preds = new Map<string, SchedulePredecessor[]>();
  let relationshipCount = 0;
  for (const r of rowsOf(db, 'TASKPRED')) {
    const predCode = taskCode.get(r.pred_task_id);
    if (!predCode) continue;
    relationshipCount++;
    const lagDays = Math.round(num(r.lag_hr_cnt) / (taskDayHours.get(r.task_id) || 8));
    const list = preds.get(r.task_id) ?? [];
    list.push({ activityId: predCode, type: PRED_TYPE[r.pred_type] ?? 'FS', lagDays });
    preds.set(r.task_id, list);
  }

  // Resource names per task.
  const rsrcName = new Map<string, string>();
  for (const r of rowsOf(db, 'RSRC')) rsrcName.set(r.rsrc_id, r.rsrc_name || r.rsrc_short_name || '');
  const taskResources = new Map<string, string[]>();
  for (const a of rowsOf(db, 'TASKRSRC')) {
    const nm = rsrcName.get(a.rsrc_id);
    if (!nm) continue;
    const list = taskResources.get(a.task_id) ?? [];
    if (!list.includes(nm)) list.push(nm);
    taskResources.set(a.task_id, list);
  }

  function pctComplete(t: Record<string, string>, status: ActivityStatus): number {
    if (status === 'completed') return 100;
    if (status === 'not_started') return 0;
    const type = t.complete_pct_type;
    if (type === 'CP_Phys') return clampPct(num(t.phys_complete_pct));
    // Duration- or unit-based: derive from remaining vs target duration.
    const target = num(t.target_drtn_hr_cnt);
    if (target > 0) return clampPct(Math.round((1 - num(t.remain_drtn_hr_cnt) / target) * 100));
    return clampPct(num(t.phys_complete_pct));
  }

  /** P6 "Schedule % Complete" is duration-based: how much of the original
   *  duration has elapsed, regardless of the activity's %-complete type. */
  function schedulePct(t: Record<string, string>, status: ActivityStatus): number {
    if (status === 'completed') return 100;
    if (status === 'not_started') return 0;
    const target = num(t.target_drtn_hr_cnt);
    if (target <= 0) return 0;
    return clampPct(Math.round((1 - num(t.remain_drtn_hr_cnt) / target) * 100));
  }

  const activities: XerScheduleResult['activities'] = [];
  let milestoneCount = 0;
  let dropped = 0;
  for (const t of rowsOf(db, 'TASK')) {
    if (t.task_type === 'TT_WBS') { dropped++; continue; } // WBS summary rows aren't activities
    const hrs = hrsPerDay(t.clndr_id);
    const isMilestone = MILESTONE_TYPES.has(t.task_type);
    if (isMilestone) milestoneCount++;
    const status = STATUS[t.status_code] ?? 'not_started';
    const plannedStart = ymd(t.target_start_date || t.early_start_date || t.restart_date || t.act_start_date);
    const plannedFinish = ymd(t.target_end_date || t.early_end_date || t.reend_date || t.act_end_date);
    const durationDays = isMilestone ? 0 : Math.max(0, Math.round(num(t.target_drtn_hr_cnt) / hrs));
    const remainingDurationDays = isMilestone ? 0 : Math.max(0, Math.round(num(t.remain_drtn_hr_cnt) / hrs));
    const totalFloatDays = Math.round(num(t.total_float_hr_cnt) / hrs);
    const predList = preds.get(t.task_id) ?? [];
    const resList = taskResources.get(t.task_id) ?? [];
    activities.push({
      activityId: t.task_code || t.task_id,
      name: t.task_name || t.task_code || t.task_id,
      wbs: wbsCode(t.wbs_id),
      wbsId: t.wbs_id || undefined,
      durationDays,
      originalDurationDays: durationDays,
      remainingDurationDays,
      schedulePctComplete: schedulePct(t, status),
      plannedStart,
      plannedFinish,
      isMilestone,
      status,
      pctComplete: pctComplete(t, status),
      actualStart: ymd(t.act_start_date) || undefined,
      actualFinish: ymd(t.act_end_date) || undefined,
      totalFloatDays,
      isCritical: num(t.total_float_hr_cnt) <= 0,
      activityType: t.task_type || undefined,
      wbsPath: wbsPath(t.wbs_id) || undefined,
      predecessors: predList.length ? predList : undefined,
      resourceNames: resList.length ? resList : undefined,
    });
  }
  if (dropped > 0) warnings.push(`Skipped ${dropped} WBS-summary row(s).`);
  if (activities.length === 0) warnings.push('No activities (TASK rows) found in the file.');

  // Sort by planned start then activity id for a clean Gantt / table order.
  activities.sort((a, b) =>
    (a.plannedStart || '').localeCompare(b.plannedStart || '') ||
    a.activityId.localeCompare(b.activityId),
  );

  const starts = activities.map((a) => a.plannedStart).filter(Boolean).sort();
  const finishes = activities.map((a) => a.plannedFinish).filter(Boolean).sort();

  // The programme's dominant calendar: the one most activities are driven by.
  // WBS rollups are measured in working days on this calendar.
  const calVotes = new Map<string, number>();
  for (const t of rowsOf(db, 'TASK')) if (t.clndr_id) calVotes.set(t.clndr_id, (calVotes.get(t.clndr_id) ?? 0) + 1);
  let dominant = project.clndr_id ?? '';
  let best = -1;
  for (const [id, votes] of calVotes) if (votes > best) { best = votes; dominant = id; }
  const domCal = calOf(dominant);

  return {
    activities,
    wbs: wbsNodes,
    projectShortName: project.proj_short_name ?? '',
    projectName: project.proj_short_name ?? '',
    planStart: ymd(project.plan_start_date) || starts[0] || '',
    planFinish: ymd(project.scd_end_date) || finishes[finishes.length - 1] || '',
    dataDate: ymd(project.last_recalc_date) || ymd(project.plan_start_date) || '',
    workingWeekdays: [...domCal.workingWeekdays].sort((a, b) => a - b),
    holidays: [...domCal.holidays].sort(),
    wbsCount: new Set(activities.map((a) => a.wbs)).size,
    milestoneCount,
    relationshipCount,
    resourceCount: rowsOf(db, 'RSRC').length,
    warnings,
  };
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Convenience: text → mapped schedule in one call. */
export function parseXerSchedule(text: string): XerScheduleResult {
  return xerToSchedule(parseXer(text));
}

/** Compact display form of a predecessor list, e.g. "A-100 (FS+2d), A-090 (SS)". */
export function predecessorLabel(preds: SchedulePredecessor[] | undefined): string {
  if (!preds || preds.length === 0) return '';
  return preds
    .map((p) => {
      const lag = p.lagDays > 0 ? `+${p.lagDays}d` : p.lagDays < 0 ? `${p.lagDays}d` : '';
      return `${p.activityId} (${p.type}${lag})`;
    })
    .join(', ');
}

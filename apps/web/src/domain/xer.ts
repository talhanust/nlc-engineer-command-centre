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

import type { ScheduleActivity, ActivityStatus, SchedulePredecessor } from '../data/types';

export interface XerTable {
  fields: string[];
  rows: Array<Record<string, string>>;
}
export interface XerDatabase {
  header: string[];
  tables: Record<string, XerTable>;
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
  projectShortName: string;
  projectName: string;
  planStart: string;
  planFinish: string;
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

  // Calendars: id → hours per working day (used to convert hour counts to days).
  const dayHours = new Map<string, number>();
  for (const c of rowsOf(db, 'CALENDAR')) {
    const h = num(c.day_hr_cnt);
    dayHours.set(c.clndr_id, h > 0 ? h : 8);
  }
  const hrsPerDay = (clndrId: string | undefined): number => (clndrId && dayHours.get(clndrId)) || 8;

  // WBS: id → node, plus helpers to walk the parent chain up to (not incl.) the
  // project root node (proj_node_flag = 'Y').
  const wbs = new Map<string, Record<string, string>>();
  for (const w of rowsOf(db, 'PROJWBS')) wbs.set(w.wbs_id, w);
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
    const totalFloatDays = Math.round(num(t.total_float_hr_cnt) / hrs);
    const predList = preds.get(t.task_id) ?? [];
    const resList = taskResources.get(t.task_id) ?? [];
    activities.push({
      activityId: t.task_code || t.task_id,
      name: t.task_name || t.task_code || t.task_id,
      wbs: wbsCode(t.wbs_id),
      durationDays,
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

  return {
    activities,
    projectShortName: project.proj_short_name ?? '',
    projectName: project.proj_short_name ?? '',
    planStart: ymd(project.plan_start_date) || starts[0] || '',
    planFinish: ymd(project.scd_end_date) || finishes[finishes.length - 1] || '',
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

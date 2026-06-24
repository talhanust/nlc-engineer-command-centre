// Pure parser for Primavera P6 .xer exports. The XER format is a set of
// tab-delimited tables, each introduced by a `%T` row, a `%F` field header and
// one `%R` row per record, terminated by `%E`. We read the schedule-relevant
// tables (PROJECT, PROJWBS, TASK, TASKPRED) and flatten TASK into the app's
// ScheduleActivity shape, resolving each task's WBS path from PROJWBS and its
// duration from the target dates (falling back to the planned hour count).
import type { ScheduleActivity } from '../data/types';

export type XerActivityRow = Pick<
  ScheduleActivity,
  'activityId' | 'name' | 'wbs' | 'durationDays' | 'plannedStart' | 'plannedFinish' | 'isMilestone' | 'predecessors' | 'physCompletePct'
>;

export interface ParsedXer {
  activities: XerActivityRow[];
  projectName: string;
  taskCount: number;
  wbsCount: number;
  relationshipCount: number;
  error?: string;
}

interface XerTable {
  fields: string[];
  rows: Array<Record<string, string>>;
}

const DAY = 86400000;
const HOURS_PER_DAY = 8; // P6 default working day; good enough for a day count.

/** Tokenise the raw XER text into the handful of tables we consume. */
function readTables(text: string): Record<string, XerTable> {
  const tables: Record<string, XerTable> = {};
  let current: XerTable | null = null;
  let name = '';
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue;
    const cells = raw.split('\t');
    const tag = cells[0];
    if (tag === '%T') {
      name = cells[1] ?? '';
      current = { fields: [], rows: [] };
      tables[name] = current;
    } else if (tag === '%F' && current) {
      current.fields = cells.slice(1);
    } else if (tag === '%R' && current) {
      const values = cells.slice(1);
      const rec: Record<string, string> = {};
      current.fields.forEach((f, i) => { rec[f] = values[i] ?? ''; });
      current.rows.push(rec);
    } else if (tag === '%E') {
      current = null;
    }
  }
  return tables;
}

/** P6 dates look like `2026-06-01 08:00`; keep the calendar-date part only. */
function dateOnly(v: string | undefined): string {
  if (!v) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v.trim());
  return m ? m[1] : '';
}

const MILESTONE_TYPES = new Set(['TT_Mile', 'TT_FinMile']);

export function parseXer(text: string): ParsedXer {
  const empty: ParsedXer = { activities: [], projectName: '', taskCount: 0, wbsCount: 0, relationshipCount: 0 };
  if (!text || !/%T\t/.test(text)) {
    return { ...empty, error: 'This does not look like a Primavera .xer export.' };
  }
  const tables = readTables(text);
  const taskTable = tables['TASK'];
  if (!taskTable || taskTable.rows.length === 0) {
    return { ...empty, error: 'No TASK (activity) records found in the .xer file.' };
  }

  // PROJWBS → resolve a readable WBS path for each task (root project node skipped).
  const wbsTable = tables['PROJWBS'];
  const wbsById = new Map<string, { short: string; parent: string; isProj: boolean }>();
  if (wbsTable) {
    for (const w of wbsTable.rows) {
      wbsById.set(w['wbs_id'], {
        short: (w['wbs_short_name'] || w['wbs_name'] || '').trim(),
        parent: w['parent_wbs_id'] || '',
        isProj: w['proj_node_flag'] === 'Y',
      });
    }
  }
  function wbsPath(wbsId: string): string {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur = wbsId;
    while (cur && wbsById.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const node = wbsById.get(cur)!;
      if (!node.isProj && node.short) parts.unshift(node.short);
      cur = node.parent;
    }
    if (parts.length === 0) {
      const self = wbsById.get(wbsId);
      return self?.short || '1';
    }
    return parts.join(' / ');
  }

  const projectName = (tables['PROJECT']?.rows[0]?.['proj_short_name'] || '').trim();

  // task_id → task_code, to resolve predecessor relationships to readable codes.
  const codeByTaskId = new Map<string, string>();
  for (const t of taskTable.rows) {
    if (t['task_id']) codeByTaskId.set(t['task_id'], (t['task_code'] || '').trim());
  }
  // task_id → [predecessor task_codes] from TASKPRED.
  const predsByTaskId = new Map<string, string[]>();
  for (const r of tables['TASKPRED']?.rows ?? []) {
    const succ = r['task_id'], pred = r['pred_task_id'];
    const predCode = pred ? codeByTaskId.get(pred) : undefined;
    if (!succ || !predCode) continue;
    const arr = predsByTaskId.get(succ) ?? [];
    if (!arr.includes(predCode)) arr.push(predCode);
    predsByTaskId.set(succ, arr);
  }

  const activities: XerActivityRow[] = [];
  for (const t of taskTable.rows) {
    const activityId = (t['task_code'] || '').trim();
    const name = (t['task_name'] || '').trim();
    if (!activityId && !name) continue;
    const isMilestone = MILESTONE_TYPES.has(t['task_type'] || '');
    const plannedStart = dateOnly(t['target_start_date'] || t['early_start_date']);
    const plannedFinish = dateOnly(t['target_end_date'] || t['early_end_date']);
    const s = Date.parse(plannedStart), f = Date.parse(plannedFinish);
    let durationDays: number;
    if (Number.isFinite(s) && Number.isFinite(f) && f >= s) {
      durationDays = Math.round((f - s) / DAY);
    } else {
      const hrs = Number(t['target_drtn_hr_cnt']);
      durationDays = Number.isFinite(hrs) ? Math.round(hrs / HOURS_PER_DAY) : 0;
    }
    if (!isMilestone) durationDays = Math.max(1, durationDays);
    const preds = predsByTaskId.get(t['task_id'] || '') ?? [];
    const phys = Number(t['phys_complete_pct']);
    activities.push({
      activityId: activityId || name.slice(0, 8),
      name: name || activityId,
      wbs: wbsPath(t['wbs_id'] || ''),
      durationDays,
      plannedStart,
      plannedFinish,
      isMilestone,
      ...(preds.length ? { predecessors: preds } : {}),
      ...(Number.isFinite(phys) && phys > 0 ? { physCompletePct: phys } : {}),
    });
  }

  if (activities.length === 0) {
    return { ...empty, error: 'No usable activities parsed from the .xer file.' };
  }
  return {
    activities,
    projectName,
    taskCount: activities.length,
    wbsCount: wbsTable ? wbsTable.rows.filter((w) => w['proj_node_flag'] !== 'Y').length : 0,
    relationshipCount: tables['TASKPRED']?.rows.length ?? 0,
  };
}

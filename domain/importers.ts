// Pure parsers for baseline imports. Accept arrays-of-arrays (from a pasted
// table or a parsed .xlsx sheet) and map flexible headers to entities.

export type Row = Array<string | number>;

function headerIndex(header: Row, ...names: string[]): number {
  const norm = header.map((h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const n of names) {
    const i = norm.indexOf(n.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (i >= 0) return i;
  }
  return -1;
}


const DAY = 86400000;

export interface ParsedSchedule {
  rows: Array<Pick<import('../data/types').ScheduleActivity, 'activityId' | 'name' | 'wbs' | 'durationDays' | 'plannedStart' | 'plannedFinish' | 'isMilestone'>>;
  error?: string;
}

/** Columns (flexible): Activity ID, Name, WBS, Start, Finish, [Milestone]. */
export function parseScheduleRows(rows: Row[]): ParsedSchedule {
  if (rows.length === 0) return { rows: [], error: 'No rows.' };
  let body = rows;
  const head = rows[0];
  const SCHED_KEYS = ['activity', 'activityid', 'name', 'wbs', 'start', 'finish', 'plannedstart', 'plannedfinish', 'milestone', 'duration'];
  const hasHeader = head.some((c) => SCHED_KEYS.includes(String(c).toLowerCase().replace(/[^a-z0-9]/g, '')));
  let cols = { id: 0, name: 1, wbs: 2, start: 3, finish: 4, ms: 5 };
  if (hasHeader) {
    cols = {
      id: Math.max(0, headerIndex(head, 'activityid', 'id', 'activity')),
      name: Math.max(1, headerIndex(head, 'name', 'description', 'activityname')),
      wbs: Math.max(2, headerIndex(head, 'wbs')),
      start: Math.max(3, headerIndex(head, 'start', 'plannedstart', 'startdate')),
      finish: Math.max(4, headerIndex(head, 'finish', 'plannedfinish', 'enddate', 'finishdate')),
      ms: headerIndex(head, 'milestone'),
    };
    body = rows.slice(1);
  }
  const out: ParsedSchedule['rows'] = [];
  for (const r of body) {
    const activityId = String(r[cols.id] ?? '').trim();
    const name = String(r[cols.name] ?? '').trim();
    const start = String(r[cols.start] ?? '').trim();
    const finish = String(r[cols.finish] ?? '').trim();
    if (!activityId && !name) continue;
    const s = Date.parse(start), f = Date.parse(finish);
    const durationDays = Number.isFinite(s) && Number.isFinite(f) ? Math.max(1, Math.round((f - s) / DAY)) : 1;
    out.push({
      activityId: activityId || name.slice(0, 8),
      name: name || activityId,
      wbs: String(r[cols.wbs] ?? '').trim() || '1',
      durationDays,
      plannedStart: start,
      plannedFinish: finish,
      isMilestone: cols.ms >= 0 ? /^(y|yes|true|1|m)/i.test(String(r[cols.ms] ?? '')) : durationDays <= 1,
    });
  }
  if (out.length === 0) return { rows: [], error: 'No activities found.' };
  return { rows: out };
}

export interface ParsedScurve {
  points: Array<{ month: string; planned: number; actual: number | null }>;
  error?: string;
}

/** Columns (flexible): Month, Planned %, [Actual %]. */
export function parseScurveRows(rows: Row[]): ParsedScurve {
  if (rows.length === 0) return { points: [], error: 'No rows.' };
  let body = rows;
  const head = rows[0];
  const SCURVE_KEYS = ['month', 'period', 'planned', 'plannedpct', 'plan', 'actual', 'actualpct'];
  const hasHeader = head.some((c) => SCURVE_KEYS.includes(String(c).toLowerCase().replace(/[^a-z0-9]/g, '')));
  let cols = { month: 0, planned: 1, actual: 2 };
  if (hasHeader) {
    cols = {
      month: Math.max(0, headerIndex(head, 'month', 'period')),
      planned: Math.max(1, headerIndex(head, 'planned', 'plannedpct', 'plan')),
      actual: headerIndex(head, 'actual', 'actualpct'),
    };
    body = rows.slice(1);
  }
  const points: ParsedScurve['points'] = [];
  for (const r of body) {
    const month = String(r[cols.month] ?? '').trim();
    if (!month) continue;
    const planned = Number(String(r[cols.planned] ?? '').replace(/[%,]/g, ''));
    const actualRaw = cols.actual >= 0 ? String(r[cols.actual] ?? '').replace(/[%,]/g, '') : '';
    points.push({
      month,
      planned: Number.isFinite(planned) ? planned : 0,
      actual: actualRaw === '' ? null : Number(actualRaw),
    });
  }
  if (points.length === 0) return { points: [], error: 'No S-curve points found.' };
  return { points };
}

/** Split pasted tab/comma text into rows. */
export function textToRows(text: string): Row[] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}

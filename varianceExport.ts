// The variance report is the artifact that leaves the building: it goes into a
// claim submission, a PD's pack, a client meeting. This module turns the report
// into workbook sheets — as data, with no browser or SheetJS dependency, so the
// content can be asserted in tests rather than eyeballed in Excel.
//
// Two rules govern the shape:
//   • Variances are written as NUMBERS, not "+15d". A reviewer will sort, filter
//     and total this column, and a string defeats all three.
//   • A missing baseline entry is an empty cell, never a zero. An activity absent
//     from the contract programme is new scope; printing 0 would claim it was on
//     time.

import type { ScheduleBaseline } from '../data/types';
import { formatP6Date } from './scheduleTree';
import type { VarianceReport } from './varianceReport';
import { baselineLabel } from './baselines';

export interface ExportContext {
  projectName: string;
  baselines: ScheduleBaseline[];
  generatedOn: string; // YYYY-MM-DD
}

/** null means a genuinely EMPTY cell. An empty string would write a text cell,
 *  which turns a numeric variance column into text and breaks sorting and SUM. */
export type Cell = string | number | null;
/** Matches components/xlsxExport SheetSpec: name + arrays-of-arrays. */
export interface Sheet {
  name: string;
  aoa: Cell[][];
}

const blank = (n: number | null): Cell => n;                      // null → empty cell
const date = (ymd: string): Cell => (ymd ? formatP6Date(ymd) : null);

/** The cover sheet a reviewer reads first: what was compared, and the headline. */
export function summarySheet(report: VarianceReport, ctx: ExportContext): Sheet {
  const s = report.summary;
  const original = ctx.baselines[0];
  const revision = ctx.baselines.length > 1 ? ctx.baselines[ctx.baselines.length - 1] : null;

  const rows: Cell[][] = [
    ['Schedule variance & claim report'],
    ['Project', ctx.projectName],
    ['Generated', formatP6Date(ctx.generatedOn)],
    [],
    ['Contract baseline', original ? baselineLabel(original) : 'none'],
    ['Latest approved revision', revision ? baselineLabel(revision) : 'none — single baseline'],
    [],
    ['Measure', 'Days', 'Note'],
    ['Programme finish vs contract baseline', s.finishVsOriginal, `${date(s.originalFinish)} → ${date(s.currentFinish)}`],
  ];
  if (!s.singleBaseline) {
    rows.push(['Programme finish vs latest revision', s.finishVsRevision, 'what the team is judged on today']);
    rows.push(['Absorbed by approved amendments', s.absorbedByRevision, 'time already granted, not time lost']);
  }
  rows.push([]);
  rows.push(['Activities slipped vs contract', s.slippedVsOriginal, '']);
  if (!s.singleBaseline) rows.push(['Activities slipped vs revision', s.slippedVsRevision, '']);
  rows.push(['Activities ahead of revision', s.aheadVsRevision, '']);
  rows.push(['Slipped activities on the critical path', s.criticalSlipped, '']);
  rows.push(['New scope (absent from contract baseline)', s.newActivities, 'blank variance cells below']);

  if (s.worst.length > 0) {
    rows.push([]);
    rows.push(['Worst slips', 'Days', 'Activity']);
    for (const w of s.worst) rows.push([w.name, blank(w.varVsRevision), w.activityId]);
  }
  return { name: 'Summary', aoa: rows };
}

/** One row per activity — the table a claim is built from. */
export function detailSheet(report: VarianceReport): Sheet {
  const single = report.summary.singleBaseline;
  const header: Cell[] = ['Activity ID', 'Activity name', 'Critical', 'Contract finish'];
  if (!single) header.push('Revision finish');
  header.push('Current finish', 'Variance vs contract (days)');
  if (!single) header.push('Variance vs revision (days)', 'Absorbed by revision (days)');

  const rows: Cell[][] = [header];
  for (const r of report.rows) {
    const row: Cell[] = [r.activityId, r.name, r.isCritical ? 'Yes' : 'No', date(r.originalFinish)];
    if (!single) row.push(date(r.revisionFinish));
    row.push(date(r.currentFinish), blank(r.varVsOriginal));
    if (!single) row.push(blank(r.varVsRevision), blank(r.absorbedByRevision));
    rows.push(row);
  }
  return { name: 'Variance', aoa: rows };
}

export function varianceWorkbook(report: VarianceReport, ctx: ExportContext): Sheet[] {
  return [summarySheet(report, ctx), detailSheet(report)];
}

/** "Margalla Avenue — variance 2026-07-10.xlsx", safe for every filesystem. */
export function varianceFileName(projectName: string, generatedOn: string): string {
  const safe = projectName.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'project';
  return `${safe} - variance ${generatedOn}.xlsx`;
}

// ---- PDF ----

export interface PdfSpecLite {
  title: string;
  subtitle: string;
  meta: Array<[string, string]>;
  columns: Array<{ label: string; align?: 'left' | 'right' }>;
  rows: Array<Array<string | number>>;
}

const cell = (v: Cell): string | number => (v === null ? '' : v);

/**
 * The same report as a paginated table. A PDF cannot be sorted, so the headline
 * figures move into the meta block where a reader sees them before the table.
 */
export function variancePdf(report: VarianceReport, ctx: ExportContext): PdfSpecLite {
  const s = report.summary;
  const original = ctx.baselines[0];
  const revision = ctx.baselines.length > 1 ? ctx.baselines[ctx.baselines.length - 1] : null;
  const days = (n: number): string => `${n > 0 ? '+' : ''}${n}d`;

  const meta: Array<[string, string]> = [
    ['Contract baseline', original ? baselineLabel(original) : 'none'],
    ['Finish vs contract', `${days(s.finishVsOriginal)}  (${formatP6Date(s.originalFinish)} → ${formatP6Date(s.currentFinish)})`],
  ];
  if (revision) {
    meta.push(['Latest revision', baselineLabel(revision)]);
    meta.push(['Finish vs revision', days(s.finishVsRevision)]);
    meta.push(['Absorbed by amendments', days(s.absorbedByRevision)]);
  }
  meta.push(['Slipped activities', `${s.slippedVsRevision} (${s.criticalSlipped} critical)`]);
  if (s.newActivities > 0) meta.push(['New scope', `${s.newActivities} activities`]);

  const single = s.singleBaseline;
  const columns: PdfSpecLite['columns'] = [
    { label: 'Activity' }, { label: 'Name' }, { label: 'Critical' }, { label: 'Contract finish' },
  ];
  if (!single) columns.push({ label: 'Revision finish' });
  columns.push({ label: 'Current finish' }, { label: 'vs Contract', align: 'right' });
  if (!single) columns.push({ label: 'vs Revision', align: 'right' }, { label: 'Absorbed', align: 'right' });

  const rows = detailSheet(report).aoa.slice(1).map((r) => r.map(cell));

  return {
    title: 'Schedule variance & claim',
    subtitle: ctx.projectName,
    meta,
    columns,
    rows,
  };
}

/** "Margalla Avenue - variance 2026-07-10" — tablePdf appends the extension. */
export function variancePdfBaseName(projectName: string, generatedOn: string): string {
  return varianceFileName(projectName, generatedOn).replace(/\.xlsx$/, '');
}

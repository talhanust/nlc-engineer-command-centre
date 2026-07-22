import { describe, it, expect } from 'vitest';
import type { ScheduleActivity, ScheduleBaseline } from '../data/types';
import { varianceReport } from './varianceReport';
import { summarySheet, detailSheet, varianceWorkbook, varianceFileName, variancePdf, variancePdfBaseName } from './varianceExport';
import { widthsFor } from '../components/xlsxExport';

const act = (activityId: string, finish: string, over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
  id: `id-${activityId}`, projectId: 'p1', activityId, name: `${activityId} name`, wbs: '1',
  durationDays: 5, plannedStart: '2026-01-01', plannedFinish: finish, isMilestone: false, ...over,
});
const base = (id: string, revision: number, finishes: Record<string, string>): ScheduleBaseline => ({
  id, capturedAt: '2026-01-01', revision,
  activities: Object.entries(finishes).map(([activityId, plannedFinish]) => ({ activityId, plannedStart: '2026-01-01', plannedFinish, durationDays: 5 })),
});

const original = base('b0', 0, { A: '2026-01-10', B: '2026-01-20' });
const revision = base('b1', 1, { A: '2026-01-20', B: '2026-01-20' });
const acts = [act('A', '2026-01-25', { isCritical: true }), act('B', '2026-01-18'), act('C', '2026-02-01')];
const ctx = { projectName: 'Margalla Avenue', baselines: [original, revision], generatedOn: '2026-07-10' };

const flat = (rows: Array<Array<string | number | null>>): string => rows.map((r) => r.join('|')).join('\n');

describe('summarySheet', () => {
  const report = varianceReport(acts, [original, revision]);
  const sheet = summarySheet(report, ctx);

  it('names the project and both programmes it measured against', () => {
    const text = flat(sheet.aoa);
    expect(text).toContain('Margalla Avenue');
    expect(text).toContain('Original · 2026-01-01');
    expect(text).toContain('Rev 1 · 2026-01-01');
  });

  it('states the headline figures as numbers a reviewer can total', () => {
    const row = sheet.aoa.find((r) => r[0] === 'Programme finish vs contract baseline')!;
    // Contract finish 20-Jan; the current programme runs to 01-Feb (new scope C).
    expect(row[1]).toBe(12);
    expect(typeof row[1]).toBe('number'); // not "+12d"
  });

  it('reports the time approved amendments already granted', () => {
    expect(sheet.aoa.some((r) => r[0] === 'Absorbed by approved amendments')).toBe(true);
  });

  it('ranks the worst slips', () => {
    const i = sheet.aoa.findIndex((r) => r[0] === 'Worst slips');
    expect(i).toBeGreaterThan(0);
    expect(sheet.aoa[i + 1][2]).toBe('A');
  });

  it('omits the revision rows entirely when only one programme was approved', () => {
    const single = summarySheet(varianceReport(acts, [original]), { ...ctx, baselines: [original] });
    const text = flat(single.aoa);
    expect(text).toContain('none — single baseline');
    expect(text).not.toContain('Absorbed by approved amendments');
  });
});

describe('detailSheet', () => {
  const report = varianceReport(acts, [original, revision]);
  const sheet = detailSheet(report);

  it('writes one header plus one row per activity', () => {
    expect(sheet.aoa).toHaveLength(1 + acts.length);
    expect(sheet.aoa[0][0]).toBe('Activity ID');
  });

  it('writes variances as numbers, not decorated strings', () => {
    const rowA = sheet.aoa.find((r) => r[0] === 'A')!;
    expect(rowA[6]).toBe(15); // vs contract
    expect(rowA[7]).toBe(5);  // vs revision
    expect(rowA[8]).toBe(10); // absorbed
  });

  it('leaves new scope BLANK rather than claiming it was on time', () => {
    const rowC = sheet.aoa.find((r) => r[0] === 'C')!;
    expect(rowC[3]).toBeNull(); // no contract finish
    expect(rowC[6]).toBeNull(); // variance is unknown, not zero
    expect(rowC[6]).not.toBe(0);
  });

  it('marks the critical path', () => {
    expect(sheet.aoa.find((r) => r[0] === 'A')![2]).toBe('Yes');
    expect(sheet.aoa.find((r) => r[0] === 'B')![2]).toBe('No');
  });

  it('drops the revision columns for a single baseline', () => {
    const single = detailSheet(varianceReport(acts, [original]));
    expect(single.aoa[0]).not.toContain('Variance vs revision (days)');
    expect(single.aoa[0]).toContain('Variance vs contract (days)');
  });

  it('renders dates in the form planners read', () => {
    expect(sheet.aoa.find((r) => r[0] === 'A')![5]).toBe('25-Jan-26');
  });
});

describe('varianceWorkbook', () => {
  it('produces a summary sheet followed by the detail sheet', () => {
    const wb = varianceWorkbook(varianceReport(acts, [original, revision]), ctx);
    expect(wb.map((s) => s.name)).toEqual(['Summary', 'Variance']);
  });
});

describe('workbook round-trip through SheetJS', () => {
  it('writes two sheets that read back with the numbers intact', async () => {
    const XLSX = await import('xlsx');
    const sheets = varianceWorkbook(varianceReport(acts, [original, revision]), ctx);
    const wb = XLSX.utils.book_new();
    for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa), s.name);

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const back = XLSX.read(buf, { type: 'buffer' });

    expect(back.SheetNames).toEqual(['Summary', 'Variance']);
    const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(back.Sheets.Variance);
    expect(detail).toHaveLength(acts.length);
    const rowA = detail.find((r) => r['Activity ID'] === 'A')!;
    // Numeric cells survive as numbers, so Excel can sort and total them.
    expect(rowA['Variance vs contract (days)']).toBe(15);
    expect(typeof rowA['Variance vs contract (days)']).toBe('number');
    // New scope stays blank: the key is absent rather than zero.
    const rowC = detail.find((r) => r['Activity ID'] === 'C')!;
    expect(rowC['Variance vs contract (days)']).toBeUndefined();
  });
});

describe('varianceFileName', () => {
  it('names the file after the project and the day it was run', () => {
    expect(varianceFileName('Margalla Avenue', '2026-07-10')).toBe('Margalla Avenue - variance 2026-07-10.xlsx');
  });
  it('strips characters no filesystem accepts', () => {
    expect(varianceFileName('F-14/F-15: Phase*1', '2026-07-10')).toBe('F-14-F-15- Phase-1 - variance 2026-07-10.xlsx');
  });
  it('falls back when the project has no name', () => {
    expect(varianceFileName('   ', '2026-07-10')).toBe('project - variance 2026-07-10.xlsx');
  });
});

describe('variancePdf', () => {
  const report = varianceReport(acts, [original, revision]);
  const spec = variancePdf(report, ctx);

  it('lifts the headline figures into the meta block, since a PDF cannot be sorted', () => {
    const keys = spec.meta.map((m) => m[0]);
    expect(keys).toContain('Finish vs contract');
    expect(keys).toContain('Finish vs revision');
    expect(keys).toContain('Absorbed by amendments');
    expect(spec.meta.find((m) => m[0] === 'Finish vs contract')![1]).toContain('+12d');
  });

  it('names the project and the programmes compared', () => {
    expect(spec.subtitle).toBe('Margalla Avenue');
    expect(spec.meta.find((m) => m[0] === 'Contract baseline')![1]).toContain('Original');
  });

  it('carries every activity, right-aligning the numeric columns', () => {
    expect(spec.rows).toHaveLength(acts.length);
    expect(spec.columns.find((c) => c.label === 'vs Contract')!.align).toBe('right');
  });

  it('writes blanks as empty strings, because a PDF cell has no null', () => {
    const rowC = spec.rows.find((r) => r[0] === 'C')!;
    expect(rowC[6]).toBe('');
    expect(rowC.every((v) => v !== null && v !== undefined)).toBe(true);
  });

  it('drops the revision columns and rows for a single baseline', () => {
    const single = variancePdf(varianceReport(acts, [original]), { ...ctx, baselines: [original] });
    expect(single.columns.map((c) => c.label)).not.toContain('vs Revision');
    expect(single.meta.map((m) => m[0])).not.toContain('Absorbed by amendments');
  });

  it('derives a pdf name from the xlsx name', () => {
    expect(variancePdfBaseName('Margalla Avenue', '2026-07-10')).toBe('Margalla Avenue - variance 2026-07-10');
  });
});

describe('widthsFor', () => {
  it('sizes columns to their longest cell, within bounds', () => {
    const w = widthsFor([['ab', 'x'.repeat(80)], ['abcdef', 'y']]);
    expect(w[0].wch).toBe(10);  // floor
    expect(w[1].wch).toBe(46);  // ceiling
  });
});

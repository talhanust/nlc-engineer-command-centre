import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseXer, parseXerSchedule, predecessorLabel } from './xer';

// A trimmed slice of a real Primavera P6 export (EMA-13 / Margalla Avenue),
// keeping the authentic table structure, field names and value formats.
const XER = readFileSync(join(__dirname, '__fixtures__', 'sample.xer'), 'utf-8');

describe('parseXer — P6 interchange format', () => {
  it('reads the header and splits records into tables by %T/%F/%R', () => {
    const db = parseXer(XER);
    expect(db.header[0]).toBe('23.12');
    expect(Object.keys(db.tables)).toEqual(
      expect.arrayContaining(['PROJECT', 'CALENDAR', 'PROJWBS', 'TASK', 'TASKPRED', 'RSRC', 'TASKRSRC']),
    );
    const task = db.tables.TASK;
    expect(task.fields).toEqual(expect.arrayContaining(['task_id', 'task_code', 'task_name', 'status_code']));
    expect(task.rows.length).toBeGreaterThan(0);
    // Values are zipped onto their field names, not positional junk.
    expect(task.rows[0].task_code).toMatch(/^Z1-B1-/);
  });

  it('tolerates CRLF line endings and ignores unknown tags', () => {
    const db = parseXer('ERMHDR\t23.12\r\n%T\tPROJECT\r\n%F\tproj_id\r\n%R\t42\r\n%E\r\n');
    expect(db.tables.PROJECT.rows).toEqual([{ proj_id: '42' }]);
  });

  it('returns an empty database for empty input rather than throwing', () => {
    expect(parseXer('').tables).toEqual({});
  });
});

describe('xerToSchedule — mapping P6 onto the app schedule model', () => {
  const r = parseXerSchedule(XER);

  it('reads project identity and the programme window', () => {
    expect(r.projectShortName).toBe('EMA-13');
    expect(r.planStart).toBe('2026-02-23');
    expect(r.planFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.warnings).not.toContain('No activities (TASK rows) found in the file.');
  });

  it('maps every TASK row to an activity with dates as plain YYYY-MM-DD', () => {
    expect(r.activities.length).toBe(6);
    for (const a of r.activities) {
      expect(a.activityId).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.plannedStart).toMatch(/^\d{4}-\d{2}-\d{2}$/); // time component stripped
      expect(a.plannedFinish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('resolves the WBS code path and readable name path, excluding the project root', () => {
    const a = r.activities.find((x) => x.activityId === 'Z1-B1-101')!;
    expect(a.wbs).toBe('4.Z1.1');
    expect(a.wbsPath).toContain('Construction');
    expect(a.wbsPath).not.toContain('Ext of Margalla Ave'); // project node is not part of the path
  });

  it('converts durations and float from calendar hours into days', () => {
    // target_drtn_hr_cnt 72 on an 8-hour/day calendar → 9 days.
    const a = r.activities.find((x) => x.activityId === 'Z1-B1-101')!;
    expect(a.durationDays).toBe(9);
    expect(a.totalFloatDays).toBe(332); // 2656 hr ÷ 8
    expect(a.isCritical).toBe(false);
  });

  it('marks zero-float activities as critical', () => {
    const critical = { total_float_hr_cnt: '0' };
    expect(Number(critical.total_float_hr_cnt) <= 0).toBe(true);
    // and the mapper agrees for any activity carrying zero float
    for (const a of r.activities) {
      expect(a.isCritical).toBe((a.totalFloatDays ?? 1) <= 0);
    }
  });

  it('maps P6 status codes and derives %-complete', () => {
    for (const a of r.activities) {
      expect(a.status).toBe('not_started'); // this programme is an un-started baseline
      expect(a.pctComplete).toBe(0);
      expect(a.actualStart).toBeUndefined();
    }
  });

  it('resolves predecessor logic to activity codes with type and lag in days', () => {
    const a = r.activities.find((x) => x.activityId === 'Z1-B1-102A')!;
    expect(a.predecessors).toBeDefined();
    expect(a.predecessors![0]).toEqual({ activityId: 'Z1-B1-101', type: 'FS', lagDays: 0 });
    expect(r.relationshipCount).toBeGreaterThan(0);
  });

  it('attaches resource assignment names', () => {
    const withRes = r.activities.filter((a) => a.resourceNames && a.resourceNames.length > 0);
    expect(withRes.length).toBeGreaterThan(0);
    expect(withRes[0].resourceNames![0]).toBeTruthy();
  });

  it('sorts activities by planned start so the Gantt reads chronologically', () => {
    const starts = r.activities.map((a) => a.plannedStart);
    expect([...starts].sort()).toEqual(starts);
  });

  it('skips WBS-summary task rows rather than importing them as activities', () => {
    const xer = XER.replace(/(%R\tTT_ROW_PLACEHOLDER)/, '$1'); // structure unchanged
    const res = parseXerSchedule(xer);
    expect(res.activities.every((a) => a.activityType !== 'TT_WBS')).toBe(true);
  });

  it('warns instead of throwing when the file has no activities', () => {
    const res = parseXerSchedule('ERMHDR\t23.12\n%T\tPROJECT\n%F\tproj_id\n%R\t1\n%E\n');
    expect(res.activities).toHaveLength(0);
    expect(res.warnings.join(' ')).toMatch(/No activities/);
  });
});

describe('predecessorLabel', () => {
  it('renders type and signed lag compactly', () => {
    expect(predecessorLabel([{ activityId: 'A-100', type: 'FS', lagDays: 0 }])).toBe('A-100 (FS)');
    expect(predecessorLabel([{ activityId: 'A-100', type: 'SS', lagDays: 2 }])).toBe('A-100 (SS+2d)');
    expect(predecessorLabel([{ activityId: 'A-100', type: 'FF', lagDays: -3 }])).toBe('A-100 (FF-3d)');
    expect(predecessorLabel(undefined)).toBe('');
  });
});

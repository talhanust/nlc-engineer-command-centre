import { describe, it, expect } from 'vitest';
import { parseScheduleRows, parseScurveRows, textToRows } from './importers';

describe('schedule import parser', () => {
  it('parses a sheet with headers and computes duration', () => {
    const rows = [
      ['Activity ID', 'Name', 'WBS', 'Start', 'Finish', 'Milestone'],
      ['A-100', 'Earthworks', '1.1', '2025-09-01', '2025-09-11', ''],
      ['M-1', 'Substantial completion', '9', '2026-08-31', '2026-08-31', 'yes'],
    ];
    const { rows: acts, error } = parseScheduleRows(rows);
    expect(error).toBeUndefined();
    expect(acts).toHaveLength(2);
    expect(acts[0].activityId).toBe('A-100');
    expect(acts[0].durationDays).toBe(10);
    expect(acts[1].isMilestone).toBe(true);
  });

  it('parses headerless rows by position', () => {
    const rows = [['A-1', 'Task', '1', '2025-09-01', '2025-10-01']];
    const { rows: acts } = parseScheduleRows(rows);
    expect(acts[0].name).toBe('Task');
  });
});

describe('S-curve import parser', () => {
  it('parses month / planned / actual with %', () => {
    const rows = [
      ['Month', 'Planned', 'Actual'],
      ['Sep-25', '5%', '4%'],
      ['Oct-25', '12%', ''],
    ];
    const { points } = parseScurveRows(rows);
    expect(points[0]).toEqual({ month: 'Sep-25', planned: 5, actual: 4 });
    expect(points[1].actual).toBeNull();
  });
});

describe('textToRows', () => {
  it('splits tab/comma rows and drops blanks', () => {
    expect(textToRows('a\tb\n\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

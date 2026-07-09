import { describe, it, expect } from 'vitest';
import type { ScheduleActivity, ScheduleWbsNode, ScheduleMeta } from '../data/types';
import { buildScheduleRows, workingDaySpan, calendarFromMeta, formatP6Date } from './scheduleTree';

const act = (over: Partial<ScheduleActivity> & { activityId: string }): ScheduleActivity => ({
  id: `id-${over.activityId}`, projectId: 'p1', name: over.activityId, wbs: '1',
  durationDays: 1, plannedStart: '2026-01-01', plannedFinish: '2026-01-01', isMilestone: false,
  ...over,
});

const NODES: ScheduleWbsNode[] = [
  { id: 'w1', parentId: null, code: '1', name: 'Construction', seq: 1 },
  { id: 'w11', parentId: 'w1', code: '1.1', name: 'Zone 1', seq: 1 },
  { id: 'w2', parentId: null, code: '2', name: 'Prelims', seq: 2 },
  { id: 'w3', parentId: null, code: '3', name: 'Empty branch', seq: 3 },
];

const SEVEN_DAY: ScheduleMeta = { workingWeekdays: [0, 1, 2, 3, 4, 5, 6] };
const FIVE_DAY: ScheduleMeta = { workingWeekdays: [1, 2, 3, 4, 5] };

describe('workingDaySpan', () => {
  it('counts inclusively on a seven-day calendar', () => {
    // 23-Feb-2026 → 03-Mar-2026 inclusive is 9 days, matching P6's duration.
    expect(workingDaySpan('2026-02-23', '2026-03-03', calendarFromMeta(SEVEN_DAY))).toBe(9);
  });

  it('skips non-working weekdays', () => {
    // Mon 2026-02-23 → Sun 2026-03-01: 5 working days on a Mon–Fri calendar.
    expect(workingDaySpan('2026-02-23', '2026-03-01', calendarFromMeta(FIVE_DAY))).toBe(5);
  });

  it('skips holidays', () => {
    const cal = calendarFromMeta({ workingWeekdays: [0, 1, 2, 3, 4, 5, 6], holidays: ['2026-02-24'] });
    expect(workingDaySpan('2026-02-23', '2026-02-25', cal)).toBe(2);
  });

  it('returns 0 for empty or inverted ranges', () => {
    const cal = calendarFromMeta(SEVEN_DAY);
    expect(workingDaySpan('', '2026-01-01', cal)).toBe(0);
    expect(workingDaySpan('2026-03-01', '2026-01-01', cal)).toBe(0);
  });

  it('defaults to a full week when no calendar was imported', () => {
    expect(workingDaySpan('2026-02-23', '2026-03-01', calendarFromMeta(null))).toBe(7);
  });
});

describe('buildScheduleRows — WBS grouping and rollups', () => {
  const acts = [
    act({ activityId: 'A-1', wbsId: 'w11', plannedStart: '2026-01-05', plannedFinish: '2026-01-14', originalDurationDays: 10, remainingDurationDays: 10, schedulePctComplete: 0 }),
    act({ activityId: 'A-2', wbsId: 'w11', plannedStart: '2026-01-15', plannedFinish: '2026-01-24', originalDurationDays: 10, remainingDurationDays: 0, schedulePctComplete: 100, isCritical: true }),
    act({ activityId: 'B-1', wbsId: 'w2', plannedStart: '2026-02-01', plannedFinish: '2026-02-10', originalDurationDays: 10 }),
  ];

  it('interleaves WBS summary rows with their activities, in tree order', () => {
    const rows = buildScheduleRows(acts, NODES, SEVEN_DAY, new Set());
    expect(rows.map((r) => `${r.kind}:${r.code}`)).toEqual([
      'wbs:1', 'wbs:1.1', 'activity:A-1', 'activity:A-2', 'wbs:2', 'activity:B-1',
    ]);
    expect(rows[1].depth).toBe(1);
    expect(rows[2].depth).toBe(2);
  });

  it('rolls start/finish up from descendants and spans them in working days', () => {
    const rows = buildScheduleRows(acts, NODES, SEVEN_DAY, new Set());
    const construction = rows.find((r) => r.code === '1')!;
    expect(construction.start).toBe('2026-01-05');
    expect(construction.finish).toBe('2026-01-24');
    expect(construction.originalDuration).toBe(20); // inclusive span, not 10+10 by luck
  });

  it('spans a WBS window rather than summing children (milestones twelve months apart)', () => {
    const milestones = [
      act({ activityId: 'M-1', wbsId: 'w2', isMilestone: true, originalDurationDays: 0, plannedStart: '2026-01-01', plannedFinish: '2026-01-01' }),
      act({ activityId: 'M-2', wbsId: 'w2', isMilestone: true, originalDurationDays: 0, plannedStart: '2026-12-31', plannedFinish: '2026-12-31' }),
    ];
    const rows = buildScheduleRows(milestones, NODES, SEVEN_DAY, new Set());
    const prelims = rows.find((r) => r.code === '2')!;
    expect(prelims.originalDuration).toBe(365); // the whole window, not 0
  });

  it('weights schedule % complete by original duration', () => {
    const rows = buildScheduleRows(acts, NODES, SEVEN_DAY, new Set());
    // A-1 (10d, 0%) and A-2 (10d, 100%) → 50%
    expect(rows.find((r) => r.code === '1.1')!.schedulePct).toBe(50);
  });

  it('marks a WBS critical when any descendant is critical', () => {
    const rows = buildScheduleRows(acts, NODES, SEVEN_DAY, new Set());
    expect(rows.find((r) => r.code === '1')!.isCritical).toBe(true);
    expect(rows.find((r) => r.code === '2')!.isCritical).toBe(false);
  });

  it('hides branches of the WBS that contain no activities', () => {
    const rows = buildScheduleRows(acts, NODES, SEVEN_DAY, new Set());
    expect(rows.some((r) => r.code === '3')).toBe(false);
  });

  it('collapsing a WBS hides its descendants but keeps the summary row', () => {
    const rows = buildScheduleRows(acts, NODES, SEVEN_DAY, new Set(['w1']));
    expect(rows.map((r) => r.code)).toEqual(['1', '2', 'B-1']);
    expect(rows[0].collapsed).toBe(true);
    expect(rows[0].hasChildren).toBe(true);
  });

  it('falls back to a flat list when the import carried no hierarchy', () => {
    const flat = [act({ activityId: 'X-1' }), act({ activityId: 'X-2' })];
    const rows = buildScheduleRows(flat, [], null, new Set());
    expect(rows.every((r) => r.kind === 'activity' && r.depth === 0)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('keeps activities whose WBS id is unknown reachable', () => {
    const orphan = [act({ activityId: 'O-1', wbsId: 'missing' }), acts[0]];
    const rows = buildScheduleRows(orphan, NODES, SEVEN_DAY, new Set());
    expect(rows.some((r) => r.code === 'O-1')).toBe(true);
  });

  it('reads durations from the legacy field when P6 columns are absent', () => {
    const legacy = [act({ activityId: 'L-1', durationDays: 7 })];
    const rows = buildScheduleRows(legacy, [], null, new Set());
    expect(rows[0].originalDuration).toBe(7);
    expect(rows[0].remainingDuration).toBe(7);
  });
});

describe('formatP6Date', () => {
  it('renders the DD-Mon-YY form planners read', () => {
    expect(formatP6Date('2026-02-23')).toBe('23-Feb-26');
    expect(formatP6Date('2027-05-30')).toBe('30-May-27');
  });
  it('passes through blanks and unrecognised input', () => {
    expect(formatP6Date('')).toBe('');
    expect(formatP6Date('not a date')).toBe('not a date');
  });
});

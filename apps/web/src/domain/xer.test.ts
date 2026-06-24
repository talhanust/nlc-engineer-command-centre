import { describe, it, expect } from 'vitest';
import { parseXer } from './xer';

// Build a minimal but realistic .xer (tab-delimited %T/%F/%R/%E tables).
function xer(): string {
  const t = (cells: string[]) => cells.join('\t');
  return [
    t(['%T', 'PROJECT']),
    t(['%F', 'proj_id', 'proj_short_name']),
    t(['%R', '1', 'F-14 BL-4']),
    t(['%T', 'PROJWBS']),
    t(['%F', 'wbs_id', 'parent_wbs_id', 'proj_node_flag', 'wbs_short_name', 'wbs_name']),
    t(['%R', '10', '', 'Y', 'ROOT', 'Project Root']),
    t(['%R', '11', '10', 'N', 'EARTH', 'Earthworks']),
    t(['%R', '12', '11', 'N', 'EXC', 'Excavation']),
    t(['%T', 'TASK']),
    t(['%F', 'task_id', 'wbs_id', 'task_code', 'task_name', 'task_type', 'phys_complete_pct', 'target_drtn_hr_cnt', 'target_start_date', 'target_end_date']),
    t(['%R', '100', '12', 'A1000', 'Bulk Excavation', 'TT_Task', '0', '80', '2026-06-01 08:00', '2026-06-11 17:00']),
    t(['%R', '101', '11', 'M1000', 'Earthworks Complete', 'TT_Mile', '0', '0', '2026-06-11 17:00', '2026-06-11 17:00']),
    t(['%T', 'TASKPRED']),
    t(['%F', 'task_pred_id', 'task_id', 'pred_task_id']),
    t(['%R', '1', '101', '100']),
    '%E',
  ].join('\n');
}

describe('parseXer', () => {
  it('parses project name, counts and relationships', () => {
    const p = parseXer(xer());
    expect(p.error).toBeUndefined();
    expect(p.projectName).toBe('F-14 BL-4');
    expect(p.taskCount).toBe(2);
    expect(p.wbsCount).toBe(2); // proj-node row excluded
    expect(p.relationshipCount).toBe(1);
  });

  it('resolves the WBS path (root project node skipped) and duration from dates', () => {
    const a = parseXer(xer()).activities.find((x) => x.activityId === 'A1000')!;
    expect(a.wbs).toBe('EARTH / EXC');
    expect(a.name).toBe('Bulk Excavation');
    expect(a.plannedStart).toBe('2026-06-01');
    expect(a.plannedFinish).toBe('2026-06-11');
    expect(a.durationDays).toBe(10);
    expect(a.isMilestone).toBe(false);
  });

  it('flags milestones (TT_Mile / TT_FinMile) and gives them zero duration', () => {
    const m = parseXer(xer()).activities.find((x) => x.activityId === 'M1000')!;
    expect(m.isMilestone).toBe(true);
    expect(m.durationDays).toBe(0);
    expect(m.wbs).toBe('EARTH');
  });

  it('resolves TASKPRED predecessors to activity codes', () => {
    const m = parseXer(xer()).activities.find((x) => x.activityId === 'M1000')!;
    expect(m.predecessors).toEqual(['A1000']);
    const a = parseXer(xer()).activities.find((x) => x.activityId === 'A1000')!;
    expect(a.predecessors).toBeUndefined(); // no predecessors
  });

  it('rejects non-xer input', () => {
    const p = parseXer('Activity,Name\nA-1,Foo');
    expect(p.error).toBeTruthy();
    expect(p.activities).toHaveLength(0);
  });
});

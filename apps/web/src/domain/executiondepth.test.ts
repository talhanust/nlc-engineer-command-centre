import { describe, it, expect } from 'vitest';
import { lookahead } from './lookahead';
import { retentionTimeline, releaseSchedule } from './retention';
import { LocalDataProvider } from '../data/LocalDataProvider';
import type { ScheduleActivity, Ipc } from '../data/types';

function act(id: string, start: string, finish: string, milestone = false): ScheduleActivity {
  return { id, projectId: 'p', activityId: id, name: id, wbs: '1', durationDays: 1, plannedStart: start, plannedFinish: finish, isMilestone: milestone };
}

describe('rolling lookahead', () => {
  const asOf = new Date('2026-06-01');
  const acts = [
    act('done', '2026-01-01', '2026-05-15'),       // completed before asOf
    act('running', '2026-02-01', '2026-07-31'),     // spans asOf -> in_progress
    act('soon', '2026-06-20', '2026-08-01'),        // starts within 8wk -> upcoming
    act('later', '2026-10-01', '2026-12-01'),       // beyond window -> excluded
  ];

  it('includes only activities active or starting within the window', () => {
    const rows = lookahead(acts, asOf, 8);
    const ids = rows.map((r) => r.activity.id);
    expect(ids).toContain('running');
    expect(ids).toContain('soon');
    expect(ids).not.toContain('done');
    expect(ids).not.toContain('later');
  });

  it('classifies status correctly', () => {
    const rows = lookahead(acts, asOf, 8);
    expect(rows.find((r) => r.activity.id === 'running')!.status).toBe('in_progress');
    expect(rows.find((r) => r.activity.id === 'soon')!.status).toBe('upcoming');
  });
});

describe('retention timeline', () => {
  const ipcs: Ipc[] = [
    { id: '1', projectId: 'p', ipcNo: 'IPC-01', seq: 1, period: 'Jan', status: 'paid', gross: 1000, netPayable: 830, cumGross: 1000 },
    { id: '2', projectId: 'p', ipcNo: 'IPC-02', seq: 2, period: 'Feb', status: 'approved', gross: 2000, netPayable: 1660, cumGross: 3000 },
  ];
  it('accumulates retention at 10% per IPC', () => {
    const pts = retentionTimeline(ipcs);
    expect(pts[0].held).toBe(100);
    expect(pts[1].cumHeld).toBe(300);
  });
  it('splits release 50/50', () => {
    const rel = releaseSchedule(retentionTimeline(ipcs));
    expect(rel.totalHeld).toBe(300);
    expect(rel.atCompletion).toBe(150);
    expect(rel.afterDlp).toBe(150);
  });
  it('accumulates retention held across the seeded flagship IPCs', async () => {
    const p = new LocalDataProvider();
    const seeded = await p.listIpcs('proj-f14f15');
    const pts = retentionTimeline(seeded);
    expect(pts.length).toBeGreaterThan(0);
    // cumulative held is monotonic non-decreasing and ends positive
    let prev = -1;
    for (const pt of pts) { expect(pt.cumHeld).toBeGreaterThanOrEqual(prev); prev = pt.cumHeld; }
    expect(pts[pts.length - 1].cumHeld).toBeGreaterThan(0);
    // and never exceeds 10% of cumulative certified gross
    const totalGross = seeded.reduce((s, i) => s + i.gross, 0);
    expect(pts[pts.length - 1].cumHeld).toBeLessThanOrEqual(totalGross * 0.1 + 1);
  });
});

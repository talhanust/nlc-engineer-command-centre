import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const PID = 'proj-f14f15';
const rows = [
  { activityId: 'A-1', name: 'Earthworks', wbs: '1.1', durationDays: 10, plannedStart: '2026-01-01', plannedFinish: '2026-01-10', isMilestone: false },
  { activityId: 'A-2', name: 'Subbase', wbs: '1.2', durationDays: 5, plannedStart: '2026-01-11', plannedFinish: '2026-01-15', isMilestone: false },
];

// The approval chain, in order. Each stage is gated on its role.
const CHAIN = ['pm', 'manager_plan', 'pd', 'manager_plan_engrs', 'comd_engrs'];

async function approve(p: LocalDataProvider) {
  for (const role of CHAIN) await p.advanceScheduleWorkflow(PID, role);
}

beforeEach(() => setKvStore(memKv()));

describe('the baseline is an act of approval, not a side effect of import', () => {
  it('importing a programme does NOT create a baseline', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, rows);
    expect(await p.getScheduleBaseline(PID)).toBeNull();
  });

  it('re-importing repeatedly still leaves no baseline', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, rows);
    await p.replaceSchedule(PID, [{ ...rows[0], plannedFinish: '2026-02-01' }]);
    expect(await p.getScheduleBaseline(PID)).toBeNull();
  });

  it('captures the programme when the workflow reaches Approve & lock', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, rows);

    // Nothing is frozen part-way through the chain.
    await p.advanceScheduleWorkflow(PID, 'pm');
    expect(await p.getScheduleBaseline(PID)).toBeNull();

    for (const role of CHAIN.slice(1)) await p.advanceScheduleWorkflow(PID, role);

    const b = (await p.getScheduleBaseline(PID))!;
    expect(b).not.toBeNull();
    expect(b.activities).toHaveLength(2);
    expect(b.revision).toBe(0);              // revision 0 = the original approval
    expect(b.source).toBe('approved (original)');
    expect(await p.listScheduleBaselines(PID)).toHaveLength(1);
    expect(b.activities.find((a) => a.activityId === 'A-1')!.plannedFinish).toBe('2026-01-10');
  });

  it('approving an empty schedule freezes nothing', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, []);
    await approve(p);
    expect(await p.getScheduleBaseline(PID)).toBeNull();
  });

  it('a later re-approval appends a revision and leaves the original standing', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, rows);
    await approve(p);
    const original = (await p.getScheduleBaseline(PID))!;

    // Amend, import a slipped programme, and take it through approval again.
    await p.amendScheduleBaseline(PID);
    await p.replaceSchedule(PID, [{ ...rows[0], plannedFinish: '2026-03-01' }, rows[1]]);
    await approve(p);

    const set = await p.listScheduleBaselines(PID);
    expect(set).toHaveLength(2);
    // The contract baseline is untouched, so the slip stays visible as variance.
    expect(set[0].id).toBe(original.id);
    expect(set[0].source).toBe('approved (original)');
    expect(set[0].activities.find((a) => a.activityId === 'A-1')!.plannedFinish).toBe('2026-01-10');
    // The revision records the programme as re-approved.
    expect(set[1].source).toBe('approved rev 1');
    expect(set[1].revision).toBe(1);
    expect(set[1].activities.find((a) => a.activityId === 'A-1')!.plannedFinish).toBe('2026-03-01');
    // getScheduleBaseline still answers with the original.
    expect((await p.getScheduleBaseline(PID))!.id).toBe(original.id);
  });

  it('does not capture the same approved revision twice', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, rows);
    await approve(p);
    // Advancing again on a locked workflow must not append a duplicate.
    await expect(p.advanceScheduleWorkflow(PID, 'comd_engrs')).rejects.toThrow();
    expect(await p.listScheduleBaselines(PID)).toHaveLength(1);
  });

  it('an explicit re-baseline appends rather than destroying the original', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, rows);
    await approve(p);
    await p.amendScheduleBaseline(PID);
    await p.replaceSchedule(PID, [{ ...rows[0], plannedFinish: '2026-03-01' }, rows[1]]);

    const rebased = await p.setScheduleBaseline(PID);
    expect(rebased.source).toBe('manual re-baseline');
    expect(rebased.activities.find((a) => a.activityId === 'A-1')!.plannedFinish).toBe('2026-03-01');

    const set = await p.listScheduleBaselines(PID);
    expect(set).toHaveLength(2);
    expect(set[0].activities.find((a) => a.activityId === 'A-1')!.plannedFinish).toBe('2026-01-10');
    expect(set.map((b) => b.id)).toHaveLength(new Set(set.map((b) => b.id)).size); // ids are unique
  });

  it('migrates a project frozen under the older single-baseline model', async () => {
    const kv = memKv();
    setKvStore(kv);
    const legacy = { capturedAt: '2026-01-01', source: 'approved (original)', revision: 0, activities: [{ activityId: 'A-1', plannedStart: '2026-01-01', plannedFinish: '2026-01-10', durationDays: 10 }] };
    kv.setItem(`nlc-ecc.schedbaseline.${PID}`, JSON.stringify(legacy));

    const p = new LocalDataProvider();
    const set = await p.listScheduleBaselines(PID);
    expect(set).toHaveLength(1);
    expect(set[0].capturedAt).toBe('2026-01-01');
    expect(set[0].id).toBeTruthy(); // an id is minted for the migrated record
    expect((await p.getScheduleBaseline(PID))!.source).toBe('approved (original)');
  });

  it('a rejected role cannot advance the chain, so it cannot freeze a baseline', async () => {
    const p = new LocalDataProvider();
    await p.replaceSchedule(PID, rows);
    await expect(p.advanceScheduleWorkflow(PID, 'comd_engrs')).rejects.toThrow();
    expect(await p.getScheduleBaseline(PID)).toBeNull();
  });
});

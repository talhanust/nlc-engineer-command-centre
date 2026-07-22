import { describe, it, expect, beforeEach } from 'vitest';
import type { ScheduleActivity, BoqWbsLink } from '../data/types';
import { diffSchedule, detectRenames, unrescuedOrphans, similarity, type DraftActivity } from './scheduleDiff';
import { LocalDataProvider, setKvStore, type KvStore } from '../data/LocalDataProvider';

const cur = (activityId: string, name: string, over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
  id: `act-${activityId}`, projectId: 'p1', activityId, name, wbs: '1.1',
  durationDays: 10, plannedStart: '2026-01-01', plannedFinish: '2026-01-10', isMilestone: false, ...over,
});
const draft = (activityId: string, name: string, over: Partial<DraftActivity> = {}): DraftActivity => ({
  activityId, name, wbs: '1.1', durationDays: 10,
  plannedStart: '2026-01-01', plannedFinish: '2026-01-10', isMilestone: false, ...over,
});
const link = (activityId: string, boqItemId = 'i1', over: Partial<BoqWbsLink> = {}): BoqWbsLink =>
  ({ boqItemId, projectId: 'p1', activityId, confidence: 'confirmed', ...over });

describe('similarity — bigram Dice', () => {
  it('is 1 for identical strings and 0 for disjoint ones', () => {
    expect(similarity('Laying asphalt', 'Laying asphalt')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
  });
  it('survives a suffix on an activity code', () => {
    expect(similarity('MAT-ASP-MIX', 'MAT-ASP-MIX-A')).toBeGreaterThan(0.85);
  });
  it('recognises an extended name', () => {
    expect(similarity('Laying asphalt', 'Laying asphalt base course')).toBeGreaterThan(0.6);
  });
  it('ignores case and padding', () => {
    expect(similarity('  Earthwork ', 'earthwork')).toBe(1);
  });
  it('handles empty and single-character input without throwing', () => {
    expect(similarity('', 'abc')).toBe(0);
    expect(similarity('a', 'a')).toBe(1);
    expect(similarity('a', 'b')).toBe(0);
  });
});

describe('detectRenames — rescuing mappings a re-import would destroy', () => {
  it('pairs an orphan with its renamed successor', () => {
    const current = [cur('MAT-ASP-MIX', 'Asphalt mix production')];
    const incoming = [draft('MAT-ASP-MIX-A', 'Asphalt mix production')];
    const diff = diffSchedule(current, incoming, [link('MAT-ASP-MIX')]);
    const renames = detectRenames(diff, current);

    expect(renames).toHaveLength(1);
    expect(renames[0].fromActivityId).toBe('MAT-ASP-MIX');
    expect(renames[0].toActivityId).toBe('MAT-ASP-MIX-A');
    expect(renames[0].linkCount).toBe(1);
    expect(renames[0].reason).toContain('same name');
    expect(renames[0].score).toBeGreaterThan(0.9);
  });

  it('matches a renamed activity that kept its code, dates and WBS', () => {
    const current = [cur('A-100', 'Laying asphalt')];
    const incoming = [draft('A-101', 'Laying asphalt base course')];
    const diff = diffSchedule(current, incoming, [link('A-100')]);
    const renames = detectRenames(diff, current);
    expect(renames).toHaveLength(1);
    expect(renames[0].reason).toContain('same dates');
    // The name only resembles the original, so it must not be called "same".
    expect(renames[0].reason).toContain('similar name');
    expect(renames[0].reason).not.toContain('same name');
  });

  it('never proposes a remap for an orphan with no plausible successor', () => {
    const current = [cur('A-100', 'Laying asphalt')];
    const incoming = [draft('Z-900', 'Landscaping and planting', { plannedStart: '2027-05-01', plannedFinish: '2027-06-01', wbs: '9' })];
    const diff = diffSchedule(current, incoming, [link('A-100')]);
    expect(detectRenames(diff, current)).toHaveLength(0);
    expect(unrescuedOrphans(diff, []).map((o) => o.activityId)).toEqual(['A-100']);
  });

  it('ignores removals that carry no mappings — nothing to rescue', () => {
    const current = [cur('A-100', 'Laying asphalt')];
    const incoming = [draft('A-101', 'Laying asphalt')];
    const diff = diffSchedule(current, incoming, []); // no links at all
    expect(detectRenames(diff, current)).toHaveLength(0);
  });

  it('is one-to-one: two orphans cannot claim the same successor', () => {
    const current = [cur('A-100', 'Laying asphalt'), cur('A-200', 'Laying asphalt')];
    const incoming = [draft('A-101', 'Laying asphalt')];
    const diff = diffSchedule(current, incoming, [link('A-100'), link('A-200', 'i2')]);
    const renames = detectRenames(diff, current);
    expect(renames).toHaveLength(1);
    expect(unrescuedOrphans(diff, renames)).toHaveLength(1);
  });

  it('respects the threshold', () => {
    const current = [cur('A-100', 'Laying asphalt')];
    const incoming = [draft('B-500', 'Asphalt works', { plannedStart: '2026-06-01', plannedFinish: '2026-07-01', wbs: '2' })];
    const diff = diffSchedule(current, incoming, [link('A-100')]);
    expect(detectRenames(diff, current, { threshold: 0.95 })).toHaveLength(0);
    expect(detectRenames(diff, current, { threshold: 0.3 }).length).toBeGreaterThan(0);
  });

  it('reports the links each remap would carry', () => {
    const current = [cur('A-100', 'Laying asphalt')];
    const incoming = [draft('A-101', 'Laying asphalt')];
    const diff = diffSchedule(current, incoming, [link('A-100', 'i1'), link('A-100', 'i2'), link('A-100', 'i3')]);
    expect(detectRenames(diff, current)[0].linkCount).toBe(3);
  });
});

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
beforeEach(() => setKvStore(memKv()));

describe('remapBoqWbsActivity — carrying the mapping across', () => {
  const PID = 'proj-x';
  async function seed(links: BoqWbsLink[]) {
    const p = new LocalDataProvider();
    for (const l of links) await p.setBoqWbs(PID, { ...l, projectId: PID });
    return p;
  }

  it('moves every link, quantity allocation intact', async () => {
    const p = await seed([link('OLD', 'i1', { qty: 600 }), link('OLD', 'i2', { qty: 40 })]);
    const after = await p.remapBoqWbsActivity(PID, 'OLD', 'NEW');
    expect(after.every((l) => l.activityId === 'NEW')).toBe(true);
    expect(after.find((l) => l.boqItemId === 'i1')!.qty).toBe(600);
    expect(after.find((l) => l.boqItemId === 'i2')!.qty).toBe(40);
  });

  it('merges quantities when the target already maps the same BOQ item', async () => {
    const p = await seed([link('OLD', 'i1', { qty: 600 }), link('NEW', 'i1', { qty: 400 })]);
    const after = await p.remapBoqWbsActivity(PID, 'OLD', 'NEW');
    expect(after).toHaveLength(1);
    expect(after[0].activityId).toBe('NEW');
    expect(after[0].qty).toBe(1000); // both described work on the same item
  });

  it('never demotes a confirmed link to auto when merging', async () => {
    const p = await seed([link('OLD', 'i1', { confidence: 'confirmed' }), link('NEW', 'i1', { confidence: 'auto' })]);
    const after = await p.remapBoqWbsActivity(PID, 'OLD', 'NEW');
    expect(after[0].confidence).toBe('confirmed');
  });

  it('leaves other activities untouched', async () => {
    const p = await seed([link('OLD', 'i1'), link('OTHER', 'i2')]);
    const after = await p.remapBoqWbsActivity(PID, 'OLD', 'NEW');
    expect(after.map((l) => l.activityId).sort()).toEqual(['NEW', 'OTHER']);
  });

  it('is a no-op when nothing maps to the source, or source equals target', async () => {
    const p = await seed([link('KEEP', 'i1')]);
    expect(await p.remapBoqWbsActivity(PID, 'ABSENT', 'NEW')).toHaveLength(1);
    expect(await p.remapBoqWbsActivity(PID, 'KEEP', 'KEEP')).toHaveLength(1);
    expect((await p.listBoqWbs(PID))[0].activityId).toBe('KEEP');
  });
});

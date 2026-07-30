import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('attentionFor — level-wise roll-up over seeded data', () => {
  let p: LocalDataProvider;
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('a project reports only its own alerts', async () => {
    const roll = await p.attentionFor('proj-margalla-rd');
    expect(roll.projectCount).toBe(1);
    expect(roll.items.every((i) => i.projectId === 'proj-margalla-rd')).toBe(true);
  });

  it('a PD HQ equals the sum of the projects it commands', async () => {
    const nodes = await p.listNodes();
    const northProjects = nodes.filter((n) => n.parentId === 'pd-north' && n.type === 'project');
    expect(northProjects.length).toBeGreaterThan(1);

    let sum = 0;
    for (const proj of northProjects) sum += (await p.attentionFor(proj.id)).total;

    const pd = await p.attentionFor('pd-north');
    expect(pd.total).toBe(sum);
    expect(pd.projectCount).toBe(northProjects.length);
    // every item is tagged with a project that actually sits under PD North
    const ids = new Set(northProjects.map((n) => n.id));
    expect(pd.items.every((i) => ids.has(i.projectId))).toBe(true);
  });

  it('HQ NLC aggregates every project in the organisation', async () => {
    const nodes = await p.listNodes();
    const allProjects = nodes.filter((n) => n.type === 'project');
    const hq = await p.attentionFor('hq-nlc');
    expect(hq.projectCount).toBe(allProjects.length);
    // HQ total is the sum over every PD HQ.
    const pdHqs = nodes.filter((n) => n.type === 'pd_hq');
    let sum = 0;
    for (const pd of pdHqs) sum += (await p.attentionFor(pd.id)).total;
    expect(hq.total).toBe(sum);
  });

  it('orders critical first and lists affected projects worst-first', async () => {
    const hq = await p.attentionFor('hq-nlc');
    if (hq.critical > 0 && hq.warning > 0) {
      expect(hq.items[0].severity).toBe('critical');
      expect(hq.items[hq.items.length - 1].severity).toBe('warning');
    }
    // byProject only lists projects that actually have alerts
    expect(hq.byProject.every((b) => b.total > 0)).toBe(true);
    expect(hq.affectedProjects).toBe(hq.byProject.length);
  });
});

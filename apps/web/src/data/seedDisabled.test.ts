import { describe, it, expect, afterEach } from 'vitest';
import { LocalDataProvider, setKvStore, setDemoSeed, type KvStore } from './LocalDataProvider';

function memKv(): { kv: KvStore; store: Map<string, string> } {
  const m = new Map<string, string>();
  const kv: KvStore = {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
  return { kv, store: m };
}

// Every test here runs with the demo seed OFF — the delivered-app default.
// Restore the fixture afterwards so the rest of the suite keeps its data.
afterEach(() => setDemoSeed(true));

describe('clean slate — delivered app ships with the demo seed off', () => {
  it('starts with zero projects and only the structural org scaffold', async () => {
    setDemoSeed(false);
    const { kv } = memKv();
    setKvStore(kv);
    const p = new LocalDataProvider();

    expect(await p.listProjects()).toHaveLength(0);
    expect(await p.listArchivedProjects()).toHaveLength(0);

    const nodes = await p.listNodes();
    expect(nodes).toHaveLength(7); // HQ NLC + HQ Engrs + 5 PD HQs
    expect(nodes.every((n) => n.type !== 'project')).toBe(true);
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ['hq-engrs', 'hq-nlc', 'pd-bln', 'pd-centre', 'pd-kpk', 'pd-north', 'pd-sindh'],
    );
  });

  it('every commercial list is empty for any project id (no flagship bleed-through)', async () => {
    setDemoSeed(false);
    setKvStore(memKv().kv);
    const p = new LocalDataProvider();
    const lists = await Promise.all([
      p.listBoq('proj-f14f15'), p.listIpcs('proj-f14f15'), p.listRars('proj-f14f15'),
      p.listContracts('proj-f14f15'), p.listSubcontractors('proj-f14f15'),
      p.listReceipts('proj-f14f15'), p.listSuppliers('proj-f14f15'), p.listSalients('proj-f14f15'),
    ]);
    for (const list of lists) expect(list).toHaveLength(0);
  });

  it('a user-created project still works on the clean slate', async () => {
    setDemoSeed(false);
    setKvStore(memKv().kv);
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Real Project', clientName: 'CDA', contractValue: '0' });
    expect((await p.listProjects()).map((x) => x.id)).toEqual([proj.id]);
    expect(await p.listBoq(proj.id)).toHaveLength(0);
  });
});

describe('clean-slate migration — a seed-version upgrade purges the demo portfolio', () => {
  it('removes previously-seeded demo projects but keeps user-created ones', async () => {
    setDemoSeed(false);
    const { kv, store } = memKv();
    setKvStore(kv);

    // Simulate an OLD store that still carries a seeded demo project + one the
    // user created, plus a stale cached BOQ document for the demo project.
    kv.setItem('nlc-ecc.seedVersion', JSON.stringify('OLD-VERSION'));
    kv.setItem('nlc-ecc.projects', JSON.stringify([
      { id: 'proj-f14f15', pdHqId: 'pd-north', clientName: 'FGEHA', contractValue: '1', billedToDate: '0', receivedToDate: '0', plannedPct: 10, actualPct: 8 },
      { id: 'proj-mine', pdHqId: 'pd-north', clientName: 'CDA', contractValue: '5', billedToDate: '0', receivedToDate: '0', plannedPct: 0, actualPct: 0 },
    ]));
    kv.setItem('nlc-ecc.nodes', JSON.stringify([
      { id: 'hq-nlc', name: 'HQ NLC', type: 'hq', parentId: null },
      { id: 'proj-f14f15', name: 'F-14/F-15 Islamabad', type: 'project', parentId: 'pd-north' },
      { id: 'proj-mine', name: 'Real Project', type: 'project', parentId: 'pd-north' },
    ]));
    kv.setItem('nlc-ecc.boq.proj-f14f15', JSON.stringify([{ id: 'stale', projectId: 'proj-f14f15' }]));

    const p = new LocalDataProvider();
    const projects = await p.listProjects();

    // The demo project is gone; the user's project survives.
    expect(projects.map((x) => x.id)).toEqual(['proj-mine']);
    // Its org node is gone too.
    expect((await p.listNodes()).some((n) => n.id === 'proj-f14f15')).toBe(false);
    // And its stale cached entity document was purged from the store.
    expect(store.has('nlc-ecc.boq.proj-f14f15')).toBe(false);
  });
});

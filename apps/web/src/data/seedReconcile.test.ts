import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';

/** Minimal in-memory KvStore standing in for localStorage. */
function memKv(seed: Record<string, unknown> = {}): KvStore {
  const m = new Map<string, string>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('seed reconcile', () => {
  beforeEach(() => setKvStore(memKv()));

  it('serves all 20 projects from a fresh store', async () => {
    const p = new LocalDataProvider();
    expect((await p.listProjects()).length).toBe(20);
  });

  it('upgrades a stale cache (old roster) without losing user data', async () => {
    // Simulate a previously-persisted store: only 2 projects, one user-created, no seedVersion.
    setKvStore(memKv({
      'nlc-ecc.projects': [
        { id: 'proj-f14f15', pdHqId: 'pd-north', clientName: 'FGEHA', contractValue: '19284461163', billedToDate: '0', receivedToDate: '0', plannedPct: 62, actualPct: 58 },
        { id: 'proj-user-made', pdHqId: 'pd-north', clientName: 'Private', contractValue: '5000000000', billedToDate: '0', receivedToDate: '0', plannedPct: 10, actualPct: 5 },
      ],
      'nlc-ecc.nodes': [{ id: 'proj-user-made', name: 'User Project', type: 'project', parentId: 'pd-north' }],
    }));
    const p = new LocalDataProvider();
    const projects = await p.listProjects();
    // 20 seeded + 1 user-made, deduped on the shared flagship id
    expect(projects.some((x) => x.id === 'proj-user-made')).toBe(true);     // user data kept
    expect(projects.some((x) => x.id === 'proj-dha-ph8')).toBe(true);        // new seed merged in
    expect(projects.length).toBe(21);
    // flagship date fields backfilled by the reconcile
    expect(projects.find((x) => x.id === 'proj-f14f15')?.completionDate).toBeTruthy();
  });

  it('generates detailed commercial + resource/overhead data for a seeded project', async () => {
    const p = new LocalDataProvider();
    const pid = 'proj-dha-ph8';
    expect((await p.listBoq(pid)).length).toBeGreaterThan(40);
    expect((await p.listIpcs(pid)).every((i) => (i.lines?.length ?? 0) > 0)).toBe(true);
    expect((await p.listDistributions(pid)).every((d) => d.mode === 'self')).toBe(true);
    expect((await p.listResources(pid)).length).toBeGreaterThan(0);
    expect((await p.listOverheads(pid)).length).toBeGreaterThan(0);
  });

  it('generates the secondary registers (financials, procurement, stores, assets)', async () => {
    const p = new LocalDataProvider();
    const pid = 'proj-hazara-exp';
    expect((await p.listReceipts(pid)).length).toBeGreaterThan(0);
    expect((await p.listPayments(pid)).length).toBeGreaterThan(0);
    expect((await p.listLiabilities(pid)).length).toBeGreaterThan(0);
    expect((await p.listSuppliers(pid)).length).toBeGreaterThan(0);
    expect((await p.listDemands(pid)).length).toBeGreaterThan(0);
    expect((await p.listSalients(pid)).length).toBeGreaterThan(0);
    expect((await p.listProductionRuns(pid)).length).toBeGreaterThan(0);
    expect((await p.listMaterialIssues(pid)).length).toBeGreaterThan(0);
    expect((await p.listInventory(pid)).length).toBeGreaterThan(0);
    expect((await p.listPol(pid)).length).toBeGreaterThan(0);
    expect((await p.listFixedAssets(pid)).length).toBeGreaterThan(0);
    // Contracts and RARs are no longer seeded — they start empty and are created
    // through the sublet-contract and RAR flows.
    expect(await p.listContracts(pid)).toHaveLength(0);
    expect(await p.listRars(pid)).toHaveLength(0);
  });
});

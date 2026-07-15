import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';
import type { Contract, Rar, Subcontractor, Variation, Distribution } from './types';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

// Simulate a browser localStorage that predates the seed removal: a USER-CREATED
// project carrying old-seed contractors / contracts / RARs / variations, plus a
// stale seed version so reconcileSeed runs its migration on first read.
function seedStaleStore(store: KvStore, pid: string) {
  store.setItem('nlc-ecc.seedVersion', '2026-07-08.v12-clean-slate'); // pre-removal
  // A user-created project (not in SEED_PROFILES).
  store.setItem('nlc-ecc.projects', JSON.stringify([
    { id: pid, pdHqId: 'pd-north', clientName: 'NHA', name: 'My Imported Programme', contractValue: '1000', archived: false },
  ]));
  store.setItem('nlc-ecc.nodes', JSON.stringify([
    { id: pid, type: 'project', name: 'My Imported Programme', parentId: 'pd-north' },
  ]));
  const subs: Subcontractor[] = [{ id: `sub-${pid}-1`, projectId: pid, name: 'Frontier Works Org (FWO)', trade: 'Earthworks', kind: 'sublet' }];
  const contracts: Contract[] = [{ id: `ctr-${pid}-1`, projectId: pid, contractNo: 'NLC/F14F15/SC-01', title: 'Earthworks & structures package', subcontractorId: `sub-${pid}-1`, scopeBills: ['1', '2'], value: 2_100_000_000, status: 'in_progress' }];
  const rars: Rar[] = [{ id: `rar-${pid}-1`, projectId: pid, rarNo: 'RAR-01', seq: 1, period: 'M1', status: 'submitted', subcontractorId: `sub-${pid}-1`, contractId: `ctr-${pid}-1`, gross: 5_000_000, netPayable: 4_500_000, lines: [] }];
  const vos: Variation[] = [{ id: `vo-${pid}-1`, projectId: pid, voNo: 'VO-01', seq: 1, title: 'Additional culvert at km 4+200', type: 'addition', amount: 185_000_000, status: 'approved', date: '2026-03-12' }];
  const dists: Distribution[] = [{ boqItemId: 'b1', projectId: pid, mode: 'sublet', subcontractorId: `sub-${pid}-1`, allocatedQty: 100 }];
  store.setItem(`nlc-ecc.subs.${pid}`, JSON.stringify(subs));
  store.setItem(`nlc-ecc.contractsreg.${pid}`, JSON.stringify(contracts));
  store.setItem(`nlc-ecc.rars.${pid}`, JSON.stringify(rars));
  store.setItem(`nlc-ecc.variations.${pid}`, JSON.stringify(vos));
  store.setItem(`nlc-ecc.dists.${pid}`, JSON.stringify(dists));
}

describe('v14 migration — purge old-seed commercial spine from user projects', () => {
  const PID = 'proj-extension-of-margalla-ro';
  let store: KvStore;
  beforeEach(() => { store = memKv(); setKvStore(store); });

  it('clears seeded contractors, contracts, RARs and variations from a user-created project', async () => {
    seedStaleStore(store, PID);
    const p = new LocalDataProvider();
    await p.listNodes(); // triggers reconcileSeed → migration

    expect(await p.listSubcontractors(PID)).toHaveLength(0);
    expect(await p.listContracts(PID)).toHaveLength(0);
    expect(await p.listRars(PID)).toHaveLength(0);
    expect(await p.listVariations(PID)).toHaveLength(0);
  });

  it('resets stale sublet distributions to self-execution', async () => {
    seedStaleStore(store, PID);
    const p = new LocalDataProvider();
    await p.listNodes();
    const dists = await p.listDistributions(PID);
    expect(dists.every((d) => d.mode === 'self' && !d.subcontractorId)).toBe(true);
  });

  it('keeps the user-created project itself (does not delete user projects)', async () => {
    seedStaleStore(store, PID);
    const p = new LocalDataProvider();
    const projects = await p.listProjects();
    expect(projects.some((x) => x.id === PID)).toBe(true);
  });

  it('does not run again: a contract created AFTER the migration survives a reload', async () => {
    seedStaleStore(store, PID);
    const p = new LocalDataProvider();
    await p.listNodes(); // migration runs once, stamps v14

    // User now creates a real contract through the new flow.
    const boq = await p.listBoq(PID); // user project → no seeded BOQ, empty
    // Give the project a BOQ item so the contract has something to reference.
    store.setItem(`nlc-ecc.boq.${PID}`, JSON.stringify([{ id: 'b1', projectId: PID, billNo: '1', billName: 'Earthworks', section: 'Earth', code: '1-01', description: 'Excavation', unit: 'm3', qty: 1000, rate: 100, amount: 100000 }]));
    const c = await p.createSubletContract(PID, {
      title: 'Genuine user contract', kind: 'sublet',
      subcontractor: { name: 'Real Sub Co', trade: 'Earthworks' },
      lines: [{ boqItemId: 'b1', qty: 100, rate: 90 }],
    });
    expect(c.title).toBe('Genuine user contract');

    // A second provider (simulating a page reload) must NOT purge it — version is stamped.
    const p2 = new LocalDataProvider();
    await p2.listNodes();
    const contracts = await p2.listContracts(PID);
    expect(contracts).toHaveLength(1);
    expect(contracts[0].title).toBe('Genuine user contract');
    void boq;
  });
});

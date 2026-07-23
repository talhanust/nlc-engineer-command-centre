import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';
import { contractSummaries } from '../domain/allocations';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const P = 'proj-plan-sync';
const boqRows = [
  { billNo: '1', code: '101', description: 'Clearing', unit: 'SM', qty: 1000, rate: 100 },
  { billNo: '1', code: '102', description: 'Grubbing', unit: 'SM', qty: 500, rate: 200 },
  { billNo: '2', code: '201', description: 'Subbase', unit: 'CM', qty: 300, rate: 300 },
];

// An awarded contract that shows up nowhere else is the defect this guards:
// contractor scorecards, the distribution mix and margin analytics all read the
// PLAN (allocations + distributions), not the contracts register.
describe('a sublet contract propagates into the plan', () => {
  let p: LocalDataProvider;
  beforeEach(async () => { setKvStore(memKv()); p = new LocalDataProvider(); await p.replaceBoq(P, boqRows); });

  async function award(lines: Array<{ i: number; qty: number; rate: number }>) {
    const boq = await p.listBoq(P);
    return p.createSubletContract(P, {
      title: 'Package A', kind: 'sublet',
      subcontractor: { name: 'Wali Khan Contractor', trade: 'Civil' },
      lines: lines.map((l) => ({ boqItemId: boq[l.i].id, qty: l.qty, rate: l.rate })),
    });
  }

  it('creates an allocation per line, tagged to the contract', async () => {
    const c = await award([{ i: 0, qty: 1000, rate: 88 }, { i: 1, qty: 500, rate: 176 }]);
    const allocs = await p.listAllocations(P);
    expect(allocs).toHaveLength(2);
    expect(allocs.every((a) => a.contractId === c.id)).toBe(true);
    expect(allocs.every((a) => a.contractorId === c.subcontractorId)).toBe(true);
    expect(allocs.every((a) => a.executionType === 'sublet')).toBe(true);
    // The allocation carries the SUBLET rate, not the client rate.
    expect(allocs.find((a) => a.qty === 1000)!.rate).toBe(88);
  });

  it('makes the contractor scorecard show the contract and its value', async () => {
    const c = await award([{ i: 0, qty: 1000, rate: 88 }]);
    const [items, allocs] = await Promise.all([p.listBoq(P), p.listAllocations(P)]);
    const summary = contractSummaries(items, allocs).find((s) => s.contractorId === c.subcontractorId)!;
    expect(summary).toBeTruthy();
    expect(summary.value).toBe(1000 * 88);      // cost to NLC
    expect(summary.revenue).toBe(1000 * 100);   // at client rates
    expect(summary.margin).toBe(1000 * 12);
  });

  it('marks each covered BOQ item as sublet to that subcontractor', async () => {
    const c = await award([{ i: 0, qty: 1000, rate: 88 }]);
    const boq = await p.listBoq(P);
    const dists = await p.listDistributions(P);
    const d = dists.find((x) => x.boqItemId === boq[0].id)!;
    expect(d.mode).toBe('sublet');
    expect(d.subcontractorId).toBe(c.subcontractorId);
    expect(d.allocatedQty).toBe(1000);
  });

  it('leaves items outside the contract alone', async () => {
    await award([{ i: 0, qty: 1000, rate: 88 }]);
    const boq = await p.listBoq(P);
    const dists = await p.listDistributions(P);
    expect(dists.find((x) => x.boqItemId === boq[2].id)).toBeUndefined();
  });

  it('a labor contract allocates as labour, not sublet', async () => {
    const boq = await p.listBoq(P);
    await p.createSubletContract(P, {
      title: 'Labour only', kind: 'labor',
      subcontractor: { name: 'Labour Co', trade: 'Civil' },
      lines: [{ boqItemId: boq[0].id, qty: 100, rate: 10 }],
    });
    expect((await p.listAllocations(P))[0].executionType).toBe('labor');
  });

  it('rewrites the plan when the BOQ is revised, never duplicating', async () => {
    const c = await award([{ i: 0, qty: 1000, rate: 88 }, { i: 1, qty: 500, rate: 176 }]);
    const boq = await p.listBoq(P);
    await p.updateContractLines(P, c.id, [{ boqItemId: boq[0].id, qty: 600, rate: 90 }]);

    const allocs = await p.listAllocations(P);
    expect(allocs).toHaveLength(1);
    expect(allocs[0].qty).toBe(600);
    expect(allocs[0].rate).toBe(90);
  });

  it('releases the plan when the contract is deleted', async () => {
    const c = await award([{ i: 0, qty: 1000, rate: 88 }]);
    await p.deleteContract(P, c.id);
    expect(await p.listAllocations(P)).toHaveLength(0);
    const boq = await p.listBoq(P);
    const d = (await p.listDistributions(P)).find((x) => x.boqItemId === boq[0].id)!;
    expect(d.mode).toBe('unassigned');
    expect(d.subcontractorId).toBeUndefined();
  });

  it('does not disturb an allocation a planner made by hand', async () => {
    const boq = await p.listBoq(P);
    await p.upsertAllocation(P, { boqItemId: boq[2].id, executionType: 'nlc_direct', qty: 300, rate: 0 });
    const c = await award([{ i: 0, qty: 1000, rate: 88 }]);
    expect(await p.listAllocations(P)).toHaveLength(2);
    await p.deleteContract(P, c.id);
    const left = await p.listAllocations(P);
    expect(left).toHaveLength(1);
    expect(left[0].executionType).toBe('nlc_direct'); // the manual one survives
  });

  it('does not release an item another live contract still covers', async () => {
    const boq = await p.listBoq(P);
    const a = await award([{ i: 0, qty: 400, rate: 88 }]);
    await p.createSubletContract(P, {
      title: 'Package B', kind: 'sublet',
      subcontractor: { name: 'Second Co', trade: 'Civil' },
      lines: [{ boqItemId: boq[0].id, qty: 600, rate: 92 }],
    });
    await p.deleteContract(P, a.id);
    const d = (await p.listDistributions(P)).find((x) => x.boqItemId === boq[0].id)!;
    expect(d.mode).toBe('sublet'); // still held by Package B
  });
});

// A contract awarded on an earlier build carries lines but no allocations, so it
// showed a value in the register and zero on every other screen.
describe('v15 migration — an existing contract repairs its own plan', () => {
  it('derives allocations and distributions for a contract stored without them', async () => {
    const store = memKv();
    setKvStore(store);
    const PID = 'proj-legacy-contract';
    // Stored the way the app stores it (JSON), so the ledger sees this store has
    // already had the v14 purge and must not replay it.
    store.setItem('nlc-ecc.seedVersion', JSON.stringify('2026-07-14.v14-purge-user-project-contract-seeds'));
    store.setItem('nlc-ecc.projects', JSON.stringify([
      { id: PID, pdHqId: 'pd-north', clientName: 'NHA', name: 'Legacy', contractValue: '1000', archived: false },
    ]));
    store.setItem(`nlc-ecc.boq.${PID}`, JSON.stringify([
      { id: 'b1', projectId: PID, billNo: '1', billName: 'Bill 1', section: '', code: '101', description: 'Clearing', unit: 'SM', qty: 1000, rate: 100, amount: 100000 },
    ]));
    store.setItem(`nlc-ecc.contractsreg.${PID}`, JSON.stringify([
      { id: 'c-old', projectId: PID, contractNo: 'NLC/X/SC-01', title: 'Old award', subcontractorId: 's1',
        scopeBills: ['1'], value: 88_000, status: 'awarded', kind: 'sublet',
        lines: [{ boqItemId: 'b1', qty: 1000, rate: 88 }] },
    ]));
    // No allocations at all — the state the user is in.
    expect(store.getItem(`nlc-ecc.alloc.${PID}`)).toBeNull();

    const p = new LocalDataProvider();
    await p.listNodes(); // boot → reconcileSeed → v15

    const allocs = await p.listAllocations(PID);
    expect(allocs).toHaveLength(1);
    expect(allocs[0].contractId).toBe('c-old');
    expect(allocs[0].rate).toBe(88);
    const d = (await p.listDistributions(PID)).find((x) => x.boqItemId === 'b1')!;
    expect(d.mode).toBe('sublet');
  });
});

// Bumping the seed version used to replay EVERY one-time migration, including
// the v14 purge that clears the commercial spine from user projects. Shipping
// v15 would therefore have deleted contracts users created after v14. The
// migration ledger exists to make that impossible.
describe('a version bump never replays a destructive migration', () => {
  it('keeps a contract created after v14 when the store upgrades to v15', async () => {
    const store = memKv();
    setKvStore(store);
    const PID = 'proj-after-v14';
    store.setItem('nlc-ecc.seedVersion', JSON.stringify('2026-07-14.v14-purge-user-project-contract-seeds'));
    store.setItem('nlc-ecc.projects', JSON.stringify([
      { id: PID, pdHqId: 'pd-north', clientName: 'NHA', name: 'Live project', contractValue: '1', archived: false },
    ]));
    store.setItem(`nlc-ecc.boq.${PID}`, JSON.stringify([
      { id: 'b1', projectId: PID, billNo: '1', billName: 'B', section: '', code: '101', description: 'C', unit: 'SM', qty: 1000, rate: 100, amount: 100000 },
    ]));
    // A genuine, user-created contract — exactly what the v14 purge would destroy.
    store.setItem(`nlc-ecc.contractsreg.${PID}`, JSON.stringify([
      { id: 'c-real', projectId: PID, contractNo: 'NLC/LIVE/SC-01', title: 'Real award', subcontractorId: 's1',
        scopeBills: ['1'], value: 88_000, status: 'awarded', kind: 'sublet',
        lines: [{ boqItemId: 'b1', qty: 1000, rate: 88 }] },
    ]));
    store.setItem(`nlc-ecc.subs.${PID}`, JSON.stringify([
      { id: 's1', projectId: PID, name: 'Wali Khan Contractor', trade: 'Civil', kind: 'sublet' },
    ]));

    const p = new LocalDataProvider();
    await p.listNodes(); // upgrade v14 → v15

    // The contract and its subcontractor survive…
    expect(await p.listContracts(PID)).toHaveLength(1);
    expect(await p.listSubcontractors(PID)).toHaveLength(1);
    // …and it now has the plan it was missing.
    expect(await p.listAllocations(PID)).toHaveLength(1);

    // The ledger records both, so neither can run again.
    const done = JSON.parse(store.getItem('nlc-ecc.migrations')!) as string[];
    expect(done).toContain('v14-purge-user-project-contract-seeds');
    expect(done).toContain('v15-sync-contract-plans');
  });

  it('still purges old-seed residue from a store that never had v14', async () => {
    const store = memKv();
    setKvStore(store);
    const PID = 'proj-stale';
    store.setItem('nlc-ecc.seedVersion', JSON.stringify('2026-07-08.v12-clean-slate'));
    store.setItem('nlc-ecc.projects', JSON.stringify([
      { id: PID, pdHqId: 'pd-north', clientName: 'NHA', name: 'Stale', contractValue: '1', archived: false },
    ]));
    store.setItem(`nlc-ecc.contractsreg.${PID}`, JSON.stringify([
      { id: 'c-seed', projectId: PID, contractNo: 'NLC/F14F15/SC-01', title: 'Seed residue',
        subcontractorId: 'sub-x', scopeBills: ['1'], value: 1, status: 'in_progress' },
    ]));

    const p = new LocalDataProvider();
    await p.listNodes();
    expect(await p.listContracts(PID)).toHaveLength(0); // residue still cleared
  });
});

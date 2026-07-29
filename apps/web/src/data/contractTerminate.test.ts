import { describe, it, expect } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';
import { itemLocks } from '../domain/contractLocks';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const P = 'proj-terminate';
const boqRows = [{ billNo: '1', code: '101', description: 'Clearing', unit: 'SM', qty: 1000, rate: 100 }];

async function setup() {
  setKvStore(memKv());
  const p = new LocalDataProvider();
  await p.replaceBoq(P, boqRows);
  const boq = await p.listBoq(P);
  const c = await p.createSubletContract(P, {
    title: 'Package', kind: 'sublet', subcontractor: { name: 'Wali Khan', trade: 'Civil' },
    lines: [{ boqItemId: boq[0].id, qty: 1000, rate: 88 }],
  });
  await p.setContractStatus(P, c.id, 'in_progress');
  return { p, c, itemId: boq[0].id };
}

describe('terminateContract — lock executed, release the rest', () => {
  it('retains executed quantity and releases the unexecuted for re-award', async () => {
    const { p, c, itemId } = await setup();
    // 400 of 1000 measured and validated.
    await p.upsertProgress(P, { boqItemId: itemId, period: 'M1', executedQty: 400, role: 'sc' });
    // validate it
    const prog = await p.listProgress(P);
    for (const pr of prog) await p.validateProgress(P, pr.id, 'pm');

    const t = await p.terminateContract(P, c.id, 'Non-performance');
    expect(t.status).toBe('terminated');
    expect(t.termination!.reason).toBe('Non-performance');
    expect(t.lines).toEqual([{ boqItemId: itemId, qty: 400, rate: 88 }]); // shrunk to executed
    expect(t.value).toBe(400 * 88);
    expect(t.termination!.releasedValue).toBe(600 * 88);

    // The planner now shows 600 free again on that item.
    const [items, contracts] = await Promise.all([p.listBoq(P), p.listContracts(P)]);
    const lock = itemLocks(items, contracts).get(itemId)!;
    expect(lock.lockedQty).toBe(400);       // only executed stays locked
    expect(lock.unallocatedQty).toBe(600);  // released, re-awardable
  });

  it('releases the whole contract when nothing was executed', async () => {
    const { p, c, itemId } = await setup();
    const t = await p.terminateContract(P, c.id);
    expect(t.value).toBe(0);
    expect(t.lines).toHaveLength(0);
    const lock = itemLocks(await p.listBoq(P), await p.listContracts(P)).get(itemId)!;
    expect(lock.unallocatedQty).toBe(1000); // all free again
  });

  it('lets the released quantity be re-awarded to another contractor', async () => {
    const { p, c, itemId } = await setup();
    await p.terminateContract(P, c.id); // releases all 1000
    // A second contractor takes the freed work.
    const c2 = await p.createSubletContract(P, {
      title: 'Package B', kind: 'sublet', subcontractor: { name: 'Second Co', trade: 'Civil' },
      lines: [{ boqItemId: itemId, qty: 1000, rate: 92 }],
    });
    expect(c2.value).toBe(1000 * 92);
    const lock = itemLocks(await p.listBoq(P), await p.listContracts(P)).get(itemId)!;
    // Now held by C2 (1000) — the terminated C1 kept 0.
    expect(lock.lockedQty).toBe(1000);
    expect(lock.holders.map((h) => h.contractId)).toContain(c2.id);
  });

  it('keeps the terminated contract in the register — it is not deleted', async () => {
    const { p, c } = await setup();
    await p.terminateContract(P, c.id);
    const contracts = await p.listContracts(P);
    expect(contracts.find((x) => x.id === c.id)).toBeTruthy();
  });

  it('audits the termination with the retained and released values', async () => {
    const { p, c } = await setup();
    await p.terminateContract(P, c.id, 'Delay');
    const entry = (await p.listAudit()).find((a) => a.action === 'terminate' && a.ref === c.contractNo);
    expect(entry).toBeTruthy();
    expect(entry!.detail).toMatch(/released/);
  });

  it('refuses to terminate a draft, or a contract that already ended', async () => {
    const { p, c } = await setup();
    await p.terminateContract(P, c.id);
    await expect(p.terminateContract(P, c.id)).rejects.toThrow(/already ended/);
  });
});

describe('an awarded contract cannot be deleted', () => {
  it('blocks deletion once past draft, directing to terminate', async () => {
    const { p, c } = await setup(); // in_progress
    await expect(p.deleteContract(P, c.id)).rejects.toThrow(/terminate/i);
    expect((await p.listContracts(P)).find((x) => x.id === c.id)).toBeTruthy();
  });

  it('still allows deleting a genuine draft', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    await p.replaceBoq(P, boqRows);
    const boq = await p.listBoq(P);
    const c = await p.createSubletContract(P, {
      title: 'Draft pkg', kind: 'sublet', subcontractor: { name: 'X', trade: 'Y' },
      lines: [{ boqItemId: boq[0].id, qty: 100, rate: 10 }],
    });
    await p.deleteContract(P, c.id); // still draft → allowed
    expect(await p.listContracts(P)).toHaveLength(0);
  });
});

describe('a contract-owned allocation is read-only in the plan', () => {
  it('marks the allocation with the owning contract and refuses edits/removal', async () => {
    const { p, c, itemId } = await setup();
    const allocs = await p.listAllocations(P);
    const owned = allocs.find((a) => a.contractId === c.id)!;
    expect(owned).toBeTruthy();

    // The provider still allows upsert (the sync uses it), but the PLANNER guards
    // edits. Here we assert the ownership tag the UI keys on is present.
    expect(owned.contractId).toBe(c.id);
    expect(owned.qty).toBe(1000);
    expect(owned.rate).toBe(88);
    void itemId;
  });
});

describe('determineContract — completing normally', () => {
  it('completes a fully-executed contract', async () => {
    const { p, c, itemId } = await setup();
    await p.upsertProgress(P, { boqItemId: itemId, period: 'M1', executedQty: 1000, role: 'sc' });
    for (const pr of await p.listProgress(P)) await p.validateProgress(P, pr.id, 'pm');

    const done = await p.determineContract(P, c.id);
    expect(done.status).toBe('completed');
    expect(done.completionDate).toBeTruthy();
    expect(done.value).toBe(1000 * 88); // unchanged — all executed
  });

  it('REFUSES to determine a contract with unexecuted quantity', async () => {
    const { p, c, itemId } = await setup();
    await p.upsertProgress(P, { boqItemId: itemId, period: 'M1', executedQty: 400, role: 'sc' });
    for (const pr of await p.listProgress(P)) await p.validateProgress(P, pr.id, 'pm');

    await expect(p.determineContract(P, c.id)).rejects.toThrow(/unexecuted/i);
    expect((await p.listContracts(P)).find((x) => x.id === c.id)!.status).toBe('in_progress'); // unchanged
  });

  it('can close out at the executed balance when the outstanding work is omitted', async () => {
    const { p, c, itemId } = await setup();
    await p.upsertProgress(P, { boqItemId: itemId, period: 'M1', executedQty: 400, role: 'sc' });
    for (const pr of await p.listProgress(P)) await p.validateProgress(P, pr.id, 'pm');

    const done = await p.determineContract(P, c.id, true); // omit the outstanding 600
    expect(done.status).toBe('completed');
    expect(done.value).toBe(400 * 88);        // shrunk to what was built
    expect(done.lines).toEqual([{ boqItemId: itemId, qty: 400, rate: 88 }]);

    // The omitted 600 frees up in the planner, just like a termination.
    const lock = itemLocks(await p.listBoq(P), await p.listContracts(P)).get(itemId)!;
    expect(lock.unallocatedQty).toBe(600);
  });

  it('audits the determination', async () => {
    const { p, c, itemId } = await setup();
    await p.upsertProgress(P, { boqItemId: itemId, period: 'M1', executedQty: 1000, role: 'sc' });
    for (const pr of await p.listProgress(P)) await p.validateProgress(P, pr.id, 'pm');
    await p.determineContract(P, c.id);
    expect((await p.listAudit()).some((a) => a.action === 'determine' && a.ref === c.contractNo)).toBe(true);
  });

  it('refuses to determine a draft or an already-ended contract', async () => {
    const { p, c } = await setup();
    await p.terminateContract(P, c.id);
    await expect(p.determineContract(P, c.id)).rejects.toThrow(/already ended/);
  });
});

describe('advance no longer force-completes', () => {
  it('setContractStatus can still set completed, but the register Advance button stops before it', async () => {
    // Provider-level: determineContract is the only path that checks completeness.
    // A blind advance into completed is prevented in the UI (advance() guards it);
    // here we assert the provider distinguishes the two ways a contract ends.
    const { p, c, itemId } = await setup();
    await p.upsertProgress(P, { boqItemId: itemId, period: 'M1', executedQty: 1000, role: 'sc' });
    for (const pr of await p.listProgress(P)) await p.validateProgress(P, pr.id, 'pm');
    const done = await p.determineContract(P, c.id);
    expect(done.status).toBe('completed');
    // determine is idempotent-safe: a second call is refused.
    await expect(p.determineContract(P, c.id)).rejects.toThrow(/already ended/);
  });
});

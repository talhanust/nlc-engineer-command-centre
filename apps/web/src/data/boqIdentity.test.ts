import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const P = 'proj-test-boq';
const row = (bill: string, code: string, description: string, qty = 100, rate = 10) =>
  ({ billNo: bill, code, description, unit: 'CM', qty, rate });

// Re-importing a BOQ must not disturb the identity of items that are still
// there: contract lines, RARs and allocations all point at boqItemId.
describe('BOQ item identity survives a re-import', () => {
  let p: LocalDataProvider;
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('keeps ids when a NEW row is inserted in the middle', async () => {
    const before = await p.replaceBoq(P, [row('1', '101', 'Clearing'), row('6', '608', 'Marking')]);
    const idClearing = before.find((b) => b.code === '101')!.id;
    const idMarking = before.find((b) => b.code === '608')!.id;

    // Insert a provisional sum between them — the dangerous case.
    const after = await p.replaceBoq(P, [
      row('1', '101', 'Clearing'),
      row('6A', '', 'Toll Plaza', 1, 176_000_000),
      row('6', '608', 'Marking'),
    ]);
    expect(after.find((b) => b.code === '101')!.id).toBe(idClearing);
    expect(after.find((b) => b.code === '608')!.id).toBe(idMarking);
    // The new row gets a genuinely new id, not one recycled from another item.
    const ps = after.find((b) => b.description === 'Toll Plaza')!;
    expect(ps.id).not.toBe(idClearing);
    expect(ps.id).not.toBe(idMarking);
  });

  it('keeps a contract line pointing at the same item after re-import', async () => {
    const boq = await p.replaceBoq(P, [row('1', '101', 'Clearing'), row('6', '608', 'Marking')]);
    const target = boq.find((b) => b.code === '608')!;
    const c = await p.createSubletContract(P, {
      title: 'T', kind: 'sublet', subcontractor: { name: 'Sub', trade: 'X' },
      lines: [{ boqItemId: target.id, qty: 10, rate: 5 }],
    });

    await p.replaceBoq(P, [
      row('1', '101', 'Clearing'),
      row('6A', '', 'Toll Plaza', 1, 176_000_000),
      row('6', '608', 'Marking'),
    ]);

    const after = await p.listBoq(P);
    const contracts = await p.listContracts(P);
    const line = contracts.find((x) => x.id === c.id)!.lines![0];
    const pointsAt = after.find((b) => b.id === line.boqItemId)!;
    // Still the marking item — NOT the provisional sum that took its old position.
    expect(pointsAt.code).toBe('608');
    expect(pointsAt.description).toBe('Marking');
  });

  it('updates quantity and rate on a kept item without changing its id', async () => {
    const before = await p.replaceBoq(P, [row('1', '101', 'Clearing', 100, 10)]);
    const id = before[0].id;
    const after = await p.replaceBoq(P, [row('1', '101', 'Clearing', 250, 12)]);
    expect(after[0].id).toBe(id);
    expect(after[0].qty).toBe(250);
    expect(after[0].rate).toBe(12);
    expect(after[0].amount).toBe(3000);
  });

  it('gives two identical rows two different ids', async () => {
    const out = await p.replaceBoq(P, [row('1', '101', 'Clearing'), row('1', '101', 'Clearing')]);
    expect(new Set(out.map((b) => b.id)).size).toBe(2);
  });

  it('does not recycle the id of a removed item onto a new one', async () => {
    const before = await p.replaceBoq(P, [row('1', '101', 'A'), row('1', '102', 'B')]);
    const removedId = before.find((b) => b.code === '102')!.id;
    const after = await p.replaceBoq(P, [row('1', '101', 'A'), row('1', '103', 'C')]);
    expect(after.find((b) => b.code === '103')!.id).not.toBe(removedId);
  });
});

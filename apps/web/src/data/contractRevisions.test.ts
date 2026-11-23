import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const P = 'proj-rev';

describe('contract revisions as retained versions', () => {
  let p: LocalDataProvider;
  beforeEach(async () => {
    setKvStore(memKv()); p = new LocalDataProvider();
    await p.replaceBoq(P, [
      { billNo: '1', code: '101', description: 'Clearing', unit: 'SM', qty: 1000, rate: 100 },
      { billNo: '1', code: '102', description: 'Grubbing', unit: 'SM', qty: 500, rate: 200 },
    ]);
  });

  async function draft() {
    const boq = await p.listBoq(P);
    const c = await p.createSubletContract(P, { title: 'Pkg', kind: 'sublet', subcontractor: { name: 'WKC', trade: 'Civil' }, lines: [{ boqItemId: boq[0].id, qty: 1000, rate: 88 }] });
    return { c, boq };
  }

  it('snapshots R0 and appends R1 on first revision', async () => {
    const { c, boq } = await draft();
    const revised = await p.updateContractLines(P, c.id, [{ boqItemId: boq[0].id, qty: 1000, rate: 88 }, { boqItemId: boq[1].id, qty: 500, rate: 176 }], 'pm', 'Added grubbing');
    expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions![0].rev).toBe(0);
    expect(revised.revisions![0].reason).toBe('Original');
    expect(revised.revisions![0].lines).toHaveLength(1);      // original: 1 line
    expect(revised.revisions![1].rev).toBe(1);
    expect(revised.revisions![1].reason).toBe('Added grubbing');
    expect(revised.revisions![1].by).toBe('pm');
    expect(revised.revisions![1].lines).toHaveLength(2);      // revised: 2 lines
  });

  it('keeps each prior revision when revised again', async () => {
    const { c, boq } = await draft();
    await p.updateContractLines(P, c.id, [{ boqItemId: boq[0].id, qty: 1200, rate: 88 }], 'pm', 'Qty up');
    const r2 = await p.updateContractLines(P, c.id, [{ boqItemId: boq[0].id, qty: 1200, rate: 90 }], 'pm', 'Rate up');
    expect(r2.revisions!.map((r) => r.rev)).toEqual([0, 1, 2]);
    expect(r2.revisions![0].value).toBe(1000 * 88); // original retained
    expect(r2.revisions![1].value).toBe(1200 * 88); // R1 retained
    expect(r2.revisions![2].value).toBe(1200 * 90); // R2 current
    expect(r2.value).toBe(1200 * 90);
  });

  it('refuses to revise a non-draft contract (history only for drafts)', async () => {
    const { c } = await draft();
    await p.setContractStatus(P, c.id, 'awarded');
    const boq = await p.listBoq(P);
    await expect(p.updateContractLines(P, c.id, [{ boqItemId: boq[0].id, qty: 1, rate: 1 }], 'pm', 'x')).rejects.toThrow(/draft/);
  });

  it('audits each revision with its R-number', async () => {
    const { c, boq } = await draft();
    await p.updateContractLines(P, c.id, [{ boqItemId: boq[0].id, qty: 900, rate: 88 }], 'pm', 'Trim');
    expect((await p.listAudit()).some((a) => a.action === 'revise' && /R1/.test(a.detail ?? ''))).toBe(true);
  });
});

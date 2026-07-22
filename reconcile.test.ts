import { describe, it, expect } from 'vitest';
import { reconcileRarIpc } from './reconcile';
import { LocalDataProvider } from '../data/LocalDataProvider';
import type { Ipc, Rar, RarIpcLink } from '../data/types';

describe('RAR ↔ IPC reconciliation', () => {
  it('applies recovery links per IPC and per RAR', () => {
    const ipcs: Ipc[] = [
      { id: 'i1', projectId: 'p', ipcNo: 'IPC-01', seq: 1, period: 'Jan', status: 'paid', gross: 1000, netPayable: 900, cumGross: 1000 },
    ];
    const rars: Rar[] = [
      { id: 'r1', projectId: 'p', rarNo: 'RAR-01', seq: 1, subcontractorId: 's1', period: 'Jan', status: 'approved', gross: 400, netPayable: 360 },
      { id: 'r2', projectId: 'p', rarNo: 'RAR-02', seq: 2, subcontractorId: 's2', period: 'Jan', status: 'approved', gross: 300, netPayable: 270 },
    ];
    const links: RarIpcLink[] = [
      { id: 'l1', projectId: 'p', rarId: 'r1', ipcId: 'i1', amount: 250 },
    ];
    const recon = reconcileRarIpc(ipcs, rars, links);
    expect(recon.ipcRows[0].recovered).toBe(250);
    expect(recon.ipcRows[0].net).toBe(750);
    expect(recon.rarRows.find((r) => r.rarNo === 'RAR-01')!.outstanding).toBe(150);
    expect(recon.rarRows.find((r) => r.rarNo === 'RAR-02')!.outstanding).toBe(300);
    expect(recon.totals.recovered).toBe(250);
  });

  it('reconciles the seeded flagship data without error', async () => {
    const p = new LocalDataProvider();
    const [ipcs, rars, links] = await Promise.all([
      p.listIpcs('proj-f14f15'), p.listRars('proj-f14f15'), p.listRarIpcLinks('proj-f14f15'),
    ]);
    const recon = reconcileRarIpc(ipcs, rars, links);
    expect(recon.ipcRows.length).toBe(ipcs.length);
    expect(recon.totals.ipcGross).toBeGreaterThan(0);
  });
});

import { reconKpis, perContractorRows, suggestIpcsForRar } from './reconcile';
import type { Distribution, BoqItem, Subcontractor } from '../data/types';

describe('reconciliation 3-view domain', () => {
  const boq: BoqItem[] = [{ id: 'a', projectId: 'p', billNo: '1', code: 'I-1', description: 'x', unit: 'U', qty: 100, rate: 100, amount: 10000 }];
  const dists: Distribution[] = [{ boqItemId: 'a', projectId: 'p', mode: 'sublet', subcontractorId: 's1', allocatedQty: 10 }];
  const ipcs: Ipc[] = [{ id: 'i1', projectId: 'p', ipcNo: 'IPC-01', seq: 1, period: 'Jan', status: 'paid', gross: 5000, netPayable: 4150, cumGross: 5000, lines: [{ boqItemId: 'a', qty: 1, rate: 100, amount: 100 }] }];
  const rars: Rar[] = [{ id: 'r1', projectId: 'p', rarNo: 'RAR-01', seq: 1, subcontractorId: 's1', period: 'Jan', status: 'paid', gross: 2000, netPayable: 1660, lines: [{ boqItemId: 'a', qty: 5, rate: 100, amount: 500 }] }];
  const subs: Subcontractor[] = [{ id: 's1', projectId: 'p', name: 'FWO', trade: 'Earthworks', kind: 'sublet' }];

  it('computes KPIs and flags over-claimed contractors', () => {
    const k = reconKpis(ipcs, rars, dists, boq);
    expect(k.nlcRevenue).toBe(5000);
    expect(k.distributedCost).toBe(1000);   // 10 × 100
    expect(k.rarBooked).toBe(2000);
    expect(k.workingCapital).toBe(1000 - 1660);
    const rows = perContractorRows(rars, dists, boq, subs);
    expect(rows[0].code).toBe('SUB-01');
    expect(rows[0].overClaimed).toBe(true);  // 2000 > 1000
  });

  it('suggests IPCs that share BoQ items with a RAR', () => {
    const sug = suggestIpcsForRar(rars[0], ipcs);
    expect(sug).toHaveLength(1);
    expect(sug[0].ipcNo).toBe('IPC-01');
    expect(suggestIpcsForRar({ ...rars[0], lines: [] }, ipcs)).toHaveLength(0);
  });
});

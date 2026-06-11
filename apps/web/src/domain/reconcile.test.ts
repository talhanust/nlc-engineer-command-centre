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

import { describe, it, expect, beforeEach } from 'vitest';
import { CHAINS, checkAdvance, roleHasPower, isFinal, DEMAND_CHAIN } from './chains';
import { LocalDataProvider } from '../data/LocalDataProvider';

describe('approval chains — definition data', () => {
  it('encodes the six chains with the right lengths', () => {
    expect(CHAINS.proc_demand_material).toHaveLength(5);
    expect(CHAINS.proc_demand_machinery).toHaveLength(5);
    expect(CHAINS.machinery_demand).toHaveLength(4); // skips endorse
    expect(CHAINS.proc_payment_material).toHaveLength(9);
    expect(CHAINS.proc_payment_machinery).toHaveLength(6);
    expect(CHAINS.machinery_payment).toHaveLength(5);
  });

  it('machinery demand diverges by skipping the Comd Engrs endorse stage', () => {
    const roles = CHAINS.machinery_demand.map((s) => s.role);
    expect(roles).toEqual(['pic', 'pm', 'pd', 'comd_engrs']);
    // material keeps endorse THEN dir_sp approve
    expect(CHAINS.proc_demand_material.map((s) => s.role)).toContain('dir_sp');
  });

  it('maps demand types to chains', () => {
    expect(DEMAND_CHAIN.material).toBe('proc_demand_material');
    expect(DEMAND_CHAIN.machinery_hire).toBe('machinery_demand');
  });
});

describe('financial powers', () => {
  it('blocks roles below their ceiling and passes unlimited/operational roles', () => {
    expect(roleHasPower('pm', 2_000_000)).toBe(false);
    expect(roleHasPower('pd', 20_000_000)).toBe(true);
    expect(roleHasPower('dir_sp', 600_000_000)).toBe(false);
    expect(roleHasPower('dg', 9_999_999_999)).toBe(true);
    expect(roleHasPower('pic', 9_999_999_999)).toBe(true); // operational, no ceiling
  });

  it('checkAdvance enforces role order and power', () => {
    // material demand at stage 1 (validated) is awaiting pd recommend.
    expect(checkAdvance('proc_demand_material', 1, 'pm', 1000).ok).toBe(false); // wrong role
    expect(checkAdvance('proc_demand_material', 1, 'pd', 1000).ok).toBe(true);
    // at stage 3 (endorsed) it awaits dir_sp; 600M exceeds dir_sp power.
    expect(checkAdvance('proc_demand_material', 3, 'dir_sp', 600_000_000).ok).toBe(false);
  });
});

describe('procurement flow (provider)', () => {
  let p: LocalDataProvider;
  beforeEach(() => {
    localStorage.clear();
    p = new LocalDataProvider();
  });

  it('walks a demand through its chain, issues a PO, and flags over-receipt', async () => {
    const pid = 'proj-test';
    const demand = await p.createDemand(pid, {
      type: 'material',
      justification: 'test',
      items: [{ code: 'X', description: 'widget', unit: 'no', qty: 10, estimatedRate: 100 }],
    });
    expect(demand.totalEstimated).toBe(1000);

    await p.advanceDemand(pid, demand.demandNo, 'pm');
    await p.advanceDemand(pid, demand.demandNo, 'pd');
    await p.advanceDemand(pid, demand.demandNo, 'comd_engrs');
    const approved = await p.advanceDemand(pid, demand.demandNo, 'dir_sp');
    expect(isFinal(approved.chainType, approved.currentStage)).toBe(true);

    const sup = await p.addSupplier(pid, { name: 'Acme', kind: 'material' });
    const po = await p.createPurchaseOrder(pid, { demandId: demand.id, supplierId: sup.id });
    expect(po.totalValue).toBe(1000);

    const ok = await p.createCrv(pid, { poId: po.id, received: [{ code: 'X', qtyReceived: 8 }] });
    expect(ok.overReceipt).toBe(false);
    const over = await p.createCrv(pid, { poId: po.id, received: [{ code: 'X', qtyReceived: 5 }] });
    expect(over.overReceipt).toBe(true); // cumulative 13 > ordered 10
  });

  it('rejects an advance by the wrong role', async () => {
    const pid = 'proj-test2';
    const d = await p.createDemand(pid, { type: 'material', justification: 't', items: [{ code: 'A', description: 'a', unit: 'no', qty: 1, estimatedRate: 1 }] });
    await expect(p.advanceDemand(pid, d.demandNo, 'pd')).rejects.toThrow();
  });
});

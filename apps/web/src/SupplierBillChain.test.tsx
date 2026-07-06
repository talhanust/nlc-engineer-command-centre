import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { supplierBillChain, isCentralMaterial, newChain, act } from './domain/apptchain';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('supplier-bill ladders (spec §6)', () => {
  it('classifies central materials', () => {
    expect(isCentralMaterial('CEM')).toBe(true);
    expect(isCentralMaterial('bitumen')).toBe(true);
    expect(isCentralMaterial('STEEL-60')).toBe(true);
    expect(isCentralMaterial('SAND')).toBe(false);
    expect(isCentralMaterial('CRUSH-20')).toBe(false);
  });

  it('local ladder ends at SM Finance pay after PD; central ladder ends at CFO', () => {
    const local = supplierBillChain('local').map((s) => s.appointmentId);
    expect(local).toEqual(['proc_engr', 'spm', 'sm_proc_pd', 'pre_audit', 'sm_fin_pd', 'dpd', 'pd', 'sm_fin_pd']);
    const central = supplierBillChain('central').map((s) => s.appointmentId);
    expect(central.at(-1)).toBe('cfo');
    expect(central).toContain('dir_sp');
    expect(central).toContain('comd_engrs');
    // Pre-Audit sits on both
    expect(local).toContain('pre_audit');
    expect(central).toContain('pre_audit');
  });

  it('pure engine: acting the full central ladder pays', () => {
    let st = newChain(supplierBillChain('central'));
    for (let i = 0; i < st.steps.length; i += 1) st = act(st, `s${i}`);
    expect(st.status).toBe('approved');
  });
});

describe('supplier bill from CRVs (provider)', () => {
  async function seedPoCrv(p: LocalDataProvider, F: string, code: string, qty: number) {
    // demand → PO → CRV path, mirroring the procurement flow
    const suppliers = await p.listSubcontractors(F);
    const demand = await p.createDemand(F, { type: 'material', justification: 'execution plan', items: [{ code, description: code, qty, unit: 'unit', estimatedRate: 0 }] });
    // advance demand to allow PO (best-effort; PO creation may accept a demand id directly)
    const po = await p.createPurchaseOrder(F, { demandId: demand.id, supplierId: suppliers[0].id });
    await p.createCrv(F, { poId: po.id, received: [{ code, qtyReceived: qty }] });
    return po;
  }

  it('generates a central bill priced at master rates and walks to CFO', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const po = await seedPoCrv(p, F, 'CEM', 1000); // master CEM = 1350/bag
    const bill = await p.generateSupplierBillFromCrvs(F, [po.id], 'Procurement Engineer');
    expect(bill.kind).toBe('central');
    expect(bill.lines[0].materialCode).toBe('CEM');
    expect(bill.lines[0].rate).toBe(1350);
    expect(bill.amount).toBe(1_350_000);

    let b = await p.submitSupplierBill(F, bill.id, 'PE');
    expect(b.chain!.steps.at(-1)!.appointmentId).toBe('cfo');
    for (let i = 0; i < b.chain!.steps.length - 1; i += 1) b = await p.actOnSupplierBill(F, bill.id, `actor-${i}`);
    expect(b.status).toBe('in_chain');
    b = await p.actOnSupplierBill(F, bill.id, 'CFO');
    expect(b.status).toBe('paid');
  });

  it('generates a local bill for non-central materials', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const po = await seedPoCrv(p, F, 'SAND', 500); // master SAND = 90/cft
    const bill = await p.generateSupplierBillFromCrvs(F, [po.id], 'PE');
    expect(bill.kind).toBe('local');
    expect(bill.amount).toBe(45_000);
    const b = await p.submitSupplierBill(F, bill.id, 'PE');
    expect(b.chain!.steps.at(-1)!.appointmentId).toBe('sm_fin_pd');
  });
});

describe('supplier bills UI', () => {
  it('shows the tab and lists a generated bill', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/procurement');
    await screen.findByLabelText('Procurement KPIs');
    // seed a bill after boot
    const p = new LocalDataProvider();
    const suppliers = await p.listSubcontractors('proj-f14f15');
    const demand = await p.createDemand('proj-f14f15', { type: 'material', justification: 'execution plan', items: [{ code: 'CEM', description: 'Cement', qty: 200, unit: 'bag', estimatedRate: 0 }] });
    const po = await p.createPurchaseOrder('proj-f14f15', { demandId: demand.id, supplierId: suppliers[0].id });
    await p.createCrv('proj-f14f15', { poId: po.id, received: [{ code: 'CEM', qtyReceived: 200 }] });
    await p.generateSupplierBillFromCrvs('proj-f14f15', [po.id], 'PE');

    await user.click(screen.getByRole('tab', { name: 'Supplier bills' }));
    const table = await screen.findByRole('table', { name: 'Supplier bills' });
    expect(within(table).getByText('SB-01')).toBeInTheDocument();
    expect(within(table).getByText('central')).toBeInTheDocument();
  }, 30000);
});

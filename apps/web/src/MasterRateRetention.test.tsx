import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { rateAnalysis } from './domain/rateanalysis';
import type { BoqItem, BoqMaterialLink, MaterialMaster } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('material master', () => {
  it('seeds a controlled catalogue and upserts by code', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const master = await p.listMaterialMaster('proj-f14f15');
    expect(master.map((m) => m.code)).toEqual(expect.arrayContaining(['CEM', 'SAND', 'CRUSH-20', 'BITUMEN']));
    const updated = await p.upsertMaterialMaster('proj-f14f15', { code: 'CEM', name: 'Cement OPC', unit: 'bag', standardRate: 1400 });
    expect(updated.filter((m) => m.code === 'CEM')).toHaveLength(1);
    expect(updated.find((m) => m.code === 'CEM')?.standardRate).toBe(1400);
    const after = await p.deleteMaterialMaster('proj-f14f15', 'STEEL-60');
    expect(after.find((m) => m.code === 'STEEL-60')).toBeUndefined();
  });
});

describe('rate analysis from composition', () => {
  const item: BoqItem = { id: 'a', projectId: 'p', billNo: '1', billName: 'x', section: 's', code: '1-01', description: 'PCC 1:2:4', unit: 'Cu.m', qty: 100, rate: 20000, amount: 2000000 };
  const master: MaterialMaster[] = [
    { code: 'CEM', name: 'Cement', unit: 'bag', standardRate: 1350 },
    { code: 'SAND', name: 'Sand', unit: 'cft', standardRate: 90 },
  ];
  const links: BoqMaterialLink[] = [
    { boqItemId: 'a', projectId: 'p', materialRef: 'CEM', coeff: 7.2, confidence: 'confirmed' },   // 9,720
    { boqItemId: 'a', projectId: 'p', materialRef: 'SAND', coeff: 16, confidence: 'confirmed' },   // 1,440
    { boqItemId: 'a', projectId: 'p', materialRef: 'XYZ', coeff: 1, confidence: 'confirmed' },     // no master rate
  ];

  it('builds material cost per unit, share of rate, balance and missing rates', () => {
    const ra = rateAnalysis([item], links, master).get('a')!;
    expect(ra.materialCostPerUnit).toBe(11160);
    expect(ra.materialSharePct).toBe(55.8);
    expect(ra.balancePerUnit).toBe(8840);
    expect(ra.lossRate).toBe(false);
    expect(ra.missingRates).toEqual(['XYZ']);
  });

  it('flags a loss rate when material alone exceeds the BOQ rate', () => {
    const cheap = { ...item, rate: 10000 };
    expect(rateAnalysis([cheap], links, master).get('a')!.lossRate).toBe(true);
  });
});

describe('procurement material master UI', () => {
  beforeEach(() => localStorage.clear());

  it('lists the catalogue and adds a material', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/procurement');
    await screen.findByLabelText('Procurement KPIs');
    await user.click(screen.getByRole('tab', { name: 'Material master' }));
    const table = await screen.findByRole('table', { name: 'Material master' });
    expect(within(table).getByText('CEM')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Master code'), 'brick');
    await user.type(screen.getByLabelText('Master unit'), 'no');
    await user.type(screen.getByLabelText('Master rate'), '18');
    await user.click(screen.getByRole('button', { name: 'Save material' }));
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Material master' })).getAllByText('BRICK').length).toBeGreaterThan(0));
  });
});

describe('recovery retention release', () => {
  beforeEach(() => localStorage.clear());

  it('shows retention held with ½-on-TOC / ½-after-DLP release', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    await user.click(within(screen.getByRole('group', { name: 'Lifecycle totals' })).getByLabelText('Physically completed (Recovery) totals'));
    const rec = await screen.findByRole('table', { name: 'Recovery section' });
    expect(within(rec).getByText('Retention held')).toBeInTheDocument();
    expect(within(rec).getByText('Releasable now')).toBeInTheDocument();
    await waitFor(() => expect(within(rec).getAllByText(/due 20\d\d-|DLP expired/).length).toBeGreaterThan(0), { timeout: 10000 });
  });
});

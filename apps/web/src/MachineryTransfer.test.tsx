import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { machineryTransferChain, newChain, act } from './domain/apptchain';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('machinery transfer ladder (spec §6)', () => {
  it('runs SM Proc PD → DPD → PD → SM Proc HQ Engrs', () => {
    expect(machineryTransferChain().map((s) => s.appointmentId)).toEqual(['sm_proc_pd', 'dpd', 'pd', 'sm_proc_engrs']);
    expect(machineryTransferChain().at(-1)!.action).toBe('approve');
  });

  it('pure engine: acting the full ladder approves', () => {
    let st = newChain(machineryTransferChain());
    for (let i = 0; i < 4; i += 1) st = act(st, `s${i}`);
    expect(st.status).toBe('approved');
  });
});

describe('machinery transfer provider', () => {
  it('locks the asset on initiation and books it on approval', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const assets = await p.listMachineryAssets();
    const pool = assets.find((a) => a.currentProjectId === undefined)!; // BP-30 or GRD-14
    expect(pool.locked).toBe(false);

    const t = await p.initiateMachineryTransfer({ assetId: pool.id, toProjectId: 'proj-f14f15', justification: 'Concrete pours for structures bill', by: 'SM Proc PD' });
    expect(t.status).toBe('in_chain');
    expect(t.chain.steps).toHaveLength(4);
    // asset is now locked and not yet booked
    let now = (await p.listMachineryAssets()).find((a) => a.id === pool.id)!;
    expect(now.locked).toBe(true);
    expect(now.currentProjectId).toBeUndefined();

    // cannot start a second transfer while locked
    await expect(p.initiateMachineryTransfer({ assetId: pool.id, toProjectId: 'proj-attock-byp', justification: 'x'.repeat(6), by: 'x' })).rejects.toThrow(/in flight/);

    let tr = t;
    for (const who of ['SM Proc PD', 'DPD', 'PD']) tr = await p.actOnMachineryTransfer(t.id, who);
    expect(tr.status).toBe('in_chain');
    tr = await p.actOnMachineryTransfer(t.id, 'SM Proc Engrs');
    expect(tr.status).toBe('approved');
    // booked to the receiving project, unlocked
    now = (await p.listMachineryAssets()).find((a) => a.id === pool.id)!;
    expect(now.currentProjectId).toBe('proj-f14f15');
    expect(now.locked).toBe(false);
  });

  it('a returned transfer releases the lock without booking', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const asset = (await p.listMachineryAssets()).find((a) => a.currentProjectId === undefined)!;
    const t = await p.initiateMachineryTransfer({ assetId: asset.id, toProjectId: 'proj-f14f15', justification: 'Justified against BOQ', by: 'SM Proc PD' });
    await p.actOnMachineryTransfer(t.id, 'SM Proc PD');
    const ret = await p.returnMachineryTransfer(t.id, 'DPD', 'Justification insufficient vs BOQ');
    expect(ret.status).toBe('returned');
    const now = (await p.listMachineryAssets()).find((a) => a.id === asset.id)!;
    expect(now.locked).toBe(false);
    expect(now.currentProjectId).toBeUndefined();
  });
});

describe('machinery transfer UI', () => {
  it('shows the transfer tab with booked machinery and the pool to pull from', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/node/proj-f14f15/procurement']}><App /></MemoryRouter>);
    await screen.findByLabelText('Procurement KPIs');
    await user.click(screen.getByRole('tab', { name: 'Machinery transfer' }));
    // flagship has EXC-320 booked from seed
    const booked = await screen.findByRole('table', { name: 'Booked machinery' });
    expect(within(booked).getByText('EXC-320')).toBeInTheDocument();
    // sign in as SM Proc PD to see the initiate control
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'SM/Manager Procurement (HQ PD)');
    await waitFor(() => expect(screen.getByLabelText('Transfer asset')).toBeInTheDocument());
  }, 30000);
});

import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('plant production runs (spec §6)', () => {
  it('records a run, computes constituent consumption from the mix design, and accrues balance', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const run = await p.recordPlantRun(F, { dated: '2026-06-15', mixDesignId: 'C30', plantAssetId: 'ma-bp-30', outputQty: 50, destination: 'self' });
    // C30 cement coeff 8.4 × 50 = 420
    expect(run.consumption?.find((c) => c.materialCode === 'CEM')?.qty).toBe(420);
    expect(run.destination).toBe('self');
    expect(run.mixDesignId).toBe('C30');

    // second run on the same plant adds to the balance
    await p.recordPlantRun(F, { dated: '2026-06-16', mixDesignId: 'C30', plantAssetId: 'ma-bp-30', outputQty: 50, destination: 'self' });
    const bal = await p.plantMaterialBalance(F, 'ma-bp-30');
    expect(bal.find((b) => b.materialCode === 'CEM')?.consumed).toBe(840); // 420 + 420
  });

  it('supports contractor-recovery destination', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const subs = await p.listSubcontractors(F);
    const run = await p.recordPlantRun(F, { dated: '2026-06-17', mixDesignId: 'AC-WEARING', plantAssetId: 'ma-ap-120', outputQty: 100, destination: 'contractor', contractorId: subs[0].id });
    expect(run.destination).toBe('contractor');
    expect(run.contractorId).toBe(subs[0].id);
    // AC-WEARING bitumen coeff 0.045 × 100 = 4.5
    expect(run.consumption?.find((c) => c.materialCode === 'BITUMEN')?.qty).toBe(4.5);
  });

  it('rejects an unknown mix design', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    await expect(p.recordPlantRun('proj-f14f15', { dated: '2026-06-15', mixDesignId: 'NOPE', plantAssetId: 'ma-bp-30', outputQty: 10, destination: 'self' })).rejects.toThrow(/not found/);
  });
});

describe('plant production UI', () => {
  it('appears once a plant is booked and records a run through the form', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    // book the batching plant to the flagship directly (skip the transfer chain for this UI test)
    const t = await p.initiateMachineryTransfer({ assetId: 'ma-bp-30', toProjectId: F, justification: 'Concrete for structures bill', by: 'SM Proc PD' });
    for (const who of ['SM Proc PD', 'DPD', 'PD', 'SM Proc Engrs']) await p.actOnMachineryTransfer(t.id, who);

    render(<MemoryRouter initialEntries={[`/node/${F}/execution`]}><App /></MemoryRouter>);
    // Production & materials sub-tab
    await user.click(await screen.findByRole('tab', { name: 'Production & materials' }));
    const form = await screen.findByLabelText('Plant', {}, { timeout: 5000 });
    await user.selectOptions(form, 'ma-bp-30');
    await user.selectOptions(screen.getByLabelText('Mix design'), 'C20');
    await user.type(screen.getByLabelText('Output quantity'), '30');
    await waitFor(() => expect(screen.getByText(/Will consume:/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Record run' }));
    const table = await screen.findByRole('table', { name: 'Plant runs' });
    expect(within(table).getByText(/C20/)).toBeInTheDocument();
  }, 30000);
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { readyToClose } from './domain/lifecycle';
import { finalBillRecon } from './domain/finalbill';
import type { Project, BoqItem, Ipc, Variation } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('DLP defects', () => {
  it('raises, rectifies and reopens defects with the seeded register', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const seeded = await p.listDlpDefects('proj-attock-byp');
    expect(seeded).toHaveLength(2);
    expect(seeded.filter((d) => d.status === 'open')).toHaveLength(1);
    const d = await p.createDlpDefect('proj-attock-byp', { raised: '2026-07-04', description: 'Joint sealant failure at expansion joint', severity: 'minor' });
    expect(d.status).toBe('open');
    let all = await p.setDlpDefectStatus('proj-attock-byp', d.id, 'rectified');
    expect(all.find((x) => x.id === d.id)?.rectifiedDate).toBeTruthy();
    all = await p.setDlpDefectStatus('proj-attock-byp', d.id, 'open');
    expect(all.find((x) => x.id === d.id)?.status).toBe('open');
  });

  it('open defects block financial closure', () => {
    const p: Project = {
      id: 'x', pdHqId: 'pd', clientName: 'c', contractValue: '1000',
      billedToDate: '1000', receivedToDate: '1000', plannedPct: 100, actualPct: 100,
      stage: 'physically_completed',
    };
    expect(readyToClose(p, 0, 0)).toBe(true);
    expect(readyToClose(p, 0, 1)).toBe(false);
  });
});

describe('final-bill reconciliation', () => {
  const item = (id: string, code: string, qty: number, rate: number): BoqItem =>
    ({ id, projectId: 'p', billNo: '1', billName: 'b', section: 's', code, description: `Item ${code}`, unit: 'Cu.m', qty, rate, amount: qty * rate });
  const ipc = (lines: Array<[string, number]>): Ipc =>
    ({ id: 'i', projectId: 'p', ipcNo: 'IPC-1', seq: 1, period: 'Jun-26', status: 'paid', gross: 0, netPayable: 0, cumGross: 0,
      lines: lines.map(([boqItemId, qty]) => ({ boqItemId, qty, rate: 0, amount: 0 })) } as unknown as Ipc);

  it('compares authorised (BOQ + approved VO) vs claimed and totals over/under', () => {
    const items = [item('a', '1-01', 100, 500), item('b', '1-02', 50, 1000)];
    const vos: Variation[] = [{
      id: 'v1', projectId: 'p', voNo: 'VO-1', status: 'approved',
      lines: [{ kind: 'qty', boqItemId: 'a', newQty: 120 }],
    } as unknown as Variation];
    const r = finalBillRecon(items, [ipc([['a', 130], ['b', 40]])], vos);
    const a = r.rows.find((x) => x.boqItemId === 'a')!;
    expect(a.authorisedQty).toBe(120);   // 100 + VO to 120
    expect(a.claimedQty).toBe(130);
    expect(a.over).toBe(true);
    expect(a.varianceAmount).toBe(5000); // 10 × 500
    expect(r.overItems).toBe(1);
    expect(r.underItems).toBe(1);        // item b claimed 40 of 50
    expect(r.underValue).toBe(10000);    // 10 × 1000
    expect(r.clean).toBe(false);
  });

  it('is clean when claims stay within authorised quantities', () => {
    const r = finalBillRecon([item('a', '1-01', 100, 500)], [ipc([['a', 100]])]);
    expect(r.clean).toBe(true);
    expect(r.overAmount).toBe(0);
  });
});

describe('recovery detail UI', () => {
  beforeEach(() => {
    // earlier tests swapped in a memory store; restore the real one
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
  });

  it('shows the defects count, opens the modal, and rectifying unblocks the row', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    await user.click(within(screen.getByRole('group', { name: 'Lifecycle totals' })).getByLabelText('Physically completed (Recovery) totals'));
    const rec = await screen.findByRole('table', { name: 'Recovery section' });
    // Attock: 1 open defect from seed
    const btn = await within(rec).findByLabelText('DLP defects proj-attock-byp');
    await waitFor(() => expect(btn.textContent).toMatch(/1 open/));
    await user.click(btn);
    const modal = await screen.findByRole('dialog', { name: /Recovery detail/ });
    expect(within(modal).getByRole('table', { name: 'DLP defects' })).toBeInTheDocument();
    expect(await within(modal).findByRole('table', { name: 'Final bill reconciliation' })).toBeInTheDocument();
    await user.click(within(modal).getByLabelText('Rectify dlp-proj-attock-byp-1'));
    await waitFor(() => expect(within(modal).getAllByText(/rectified 20/).length).toBe(2)); // seeded + newly rectified
    // register button now reports clear
    await waitFor(() => expect(within(rec).getByLabelText('DLP defects proj-attock-byp').textContent).toMatch(/all rectified/));
  });
});

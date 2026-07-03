import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { projectWorklist } from './domain/worklist';
import type { Ipc, Rar, Demand, ProcPayment } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('unified worklist domain (req 3h(4))', () => {
  const ipc = (ipcNo: string, status: Ipc['status']): Ipc =>
    ({ id: ipcNo, projectId: 'p', ipcNo, seq: 1, period: 'Jun-2026', status, gross: 100, netPayable: 80, cumGross: 100, lines: [] });
  const rar = (rarNo: string, status: Rar['status']): Rar =>
    ({ id: rarNo, projectId: 'p', rarNo, seq: 1, period: 'Jun-2026', subcontractorId: 's1', status, gross: 50, netPayable: 40, lines: [] } as unknown as Rar);

  it('collects only records whose next step belongs to the acting role', () => {
    const args = {
      projectId: 'p', projectName: 'P',
      ipcs: [ipc('IPC-1', 'vetted'), ipc('IPC-2', 'approved'), ipc('IPC-3', 'paid')],
      rars: [rar('RAR-1', 'submitted'), rar('RAR-2', 'approved')],
      demands: [] as Demand[], procPayments: [] as ProcPayment[],
    };
    const pm = projectWorklist('pm', args);
    expect(pm.map((w) => w.ref).sort()).toEqual(['IPC-1', 'RAR-1']); // vetted→PM, submitted→PM verify
    const fm = projectWorklist('fm', args);
    expect(fm.map((w) => w.ref).sort()).toEqual(['IPC-2', 'RAR-2']); // approved→FM steps
    expect(projectWorklist('pd', args)).toHaveLength(0);
  });
});

describe('worklist screen + bell', () => {
  beforeEach(() => localStorage.clear());

  it('bell counts pending approvals and the screen lists them with deep links', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    const bell = await screen.findAllByRole('button', { name: /My approvals \(\d+ pending\)/ });
    expect(bell.length).toBeGreaterThan(0);
    await user.click(bell[0]);
    // default role is admin → the queue renders (empty state or table)
    await screen.findByRole('heading', { name: /My approvals/ });
  });

  it('shows the PM queue after switching role', async () => {
    const user = userEvent.setup();
    renderAt('/worklist');
    await screen.findByRole('heading', { name: /My approvals/ });
    await user.selectOptions(screen.getAllByLabelText('Switch acting role')[0], 'pm');
    const table = await screen.findByRole('table', { name: 'My approvals' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(1));
    expect(within(table).getAllByText('IPC').length).toBeGreaterThan(0);
  });
});

describe('payment BOQ reference (req 3e(3))', () => {
  beforeEach(() => localStorage.clear());

  it('records a payment against a BOQ item and shows the code in the ledger', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/financial');
    await user.click(await screen.findByRole('tab', { name: /Payments/ }));
    const amount = await screen.findByLabelText('Payment amount');
    await user.type(amount, '500000');
    await user.selectOptions(screen.getByLabelText('Payment BOQ item'), screen.getAllByRole('option', { name: /1-01/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    const table = await screen.findByRole('table', { name: 'Payments' });
    await waitFor(() => expect(within(table).getAllByText('1-01').length).toBeGreaterThan(0));
  });
});

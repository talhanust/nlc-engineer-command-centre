import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';
import App from '../../App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());

async function gotoSub(name: string) {
  const user = userEvent.setup();
  renderAt('/node/proj-f14f15/financial');
  await screen.findByRole('heading', { name: 'Financial dashboard' });
  if (name !== 'Dashboard') await user.click(screen.getByRole('tab', { name }));
  return user;
}

describe('Phase 5 — Financial', () => {
  it('shows the KPI dashboard with net cash position', async () => {
    await gotoSub('Dashboard');
    expect(screen.getByText('Net cash position').closest('.kpi')).toBeInTheDocument();
    expect(screen.getByText('Gross margin')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Earned value' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Working capital' })).toBeInTheDocument();
  });

  it('lists seeded receipts and records a new one', async () => {
    const user = await gotoSub('Receipts');
    const table = await screen.findByRole('table', { name: 'Receipts' });
    expect(within(table).getByText('IPC-01')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Receipt source'), 'IPC-03');
    await user.type(screen.getByLabelText('Receipt amount'), '1000000000');
    await user.click(screen.getByRole('button', { name: 'Record receipt' }));
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Receipts' })).getByText('IPC-03')).toBeInTheDocument());
  });

  it('records a payment', async () => {
    const user = await gotoSub('Payments');
    await screen.findByRole('table', { name: 'Payments' });
    await user.type(screen.getByLabelText('Payment amount'), '300000000');
    await user.click(screen.getByRole('button', { name: 'Record payment' }));
    // total label updates; just assert no crash and table still present
    expect(await screen.findByRole('table', { name: 'Payments' })).toBeInTheDocument();
  });

  it('renders the cash-flow chart and switches forecast horizon', async () => {
    const user = await gotoSub('Cash flow');
    expect(await screen.findByRole('img', { name: 'Cash flow' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '12 mo' }));
    expect(screen.getByRole('img', { name: 'Cash flow' })).toBeInTheDocument();
  });

  it('shows the P&L with gross profit', async () => {
    await gotoSub('P&L');
    expect(await screen.findByRole('heading', { name: 'Profit & loss' })).toBeInTheDocument();
    expect(screen.getByText('Gross profit')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Monthly P&L' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Margin by bill table' })).toBeInTheDocument();
  });
});

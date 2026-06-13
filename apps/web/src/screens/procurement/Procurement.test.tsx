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

async function open() {
  const user = userEvent.setup();
  renderAt('/node/proj-f14f15/procurement');
  await screen.findByRole('heading', { name: /Approval inbox/ });
  return user;
}

describe('Phase 6 — procurement', () => {
  it('opens the demand detail modal with items + history', async () => {
    const user = await open();
    await user.click(screen.getByRole('tab', { name: 'Demands' }));
    await user.click(await screen.findByRole('button', { name: 'Details for DMD-01' }));
    const dialog = await screen.findByRole('dialog', { name: 'Demand DMD-01 detail' });
    expect(within(dialog).getByRole('table', { name: 'Demand items' })).toBeInTheDocument();
  });

  it('shows inventory, POL and fixed-asset registers', async () => {
    const user = await open();
    await user.click(screen.getByRole('tab', { name: 'Inventory' }));
    expect(await screen.findByRole('table', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.getByText('Excavator CAT 320')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'POL' }));
    expect(await screen.findByRole('table', { name: 'POL' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Fixed assets' }));
    expect(await screen.findByRole('table', { name: 'Fixed assets' })).toBeInTheDocument();
  });

  it('raises and advances a maintenance request through its chain', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Acting role'), 'pm');
    await user.click(screen.getByRole('tab', { name: 'Maintenance' }));
    await user.type(screen.getByLabelText('Maintenance asset'), 'Excavator CAT 320');
    await user.type(screen.getByLabelText('Maintenance cost'), '250000');
    await user.click(screen.getByRole('button', { name: 'Raise request' }));
    await user.click(await screen.findByRole('button', { name: 'Advance MNT-01' }));
    // PM validated → now awaiting Manager Procurement; switch role and approve
    await user.selectOptions(screen.getByLabelText('Acting role'), 'manager_procurement');
    await user.click(await screen.findByRole('button', { name: 'Advance MNT-01' }));
    await user.selectOptions(screen.getByLabelText('Acting role'), 'fm');
    await user.click(await screen.findByRole('button', { name: 'Advance MNT-01' }));
    expect(await screen.findByText('Completed & paid.')).toBeInTheDocument();
  });

  it('shows the seeded demand in the PD inbox and advances it', async () => {
    const user = await open();
    const inbox = await screen.findByRole('table', { name: 'Approval inbox' });
    expect(within(inbox).getByText('DMD-01 (demand)')).toBeInTheDocument();
    // default role is PD → action is "Recommend"
    await user.click(within(inbox).getByRole('button', { name: 'Recommend' }));
    // after recommending, it moves to Comd Engrs, so PD's inbox empties
    await waitFor(() =>
      expect(screen.getByText(/Nothing awaiting/)).toBeInTheDocument(),
    );
  });

  it('gates advancement by financial power', async () => {
    const user = await open();
    // Create a 5,000,000 demand (exceeds PM power of 1,000,000)
    await user.click(screen.getByRole('tab', { name: 'Demands' }));
    await user.type(screen.getByLabelText('Item description'), 'Big ticket');
    await user.type(screen.getByLabelText('Item qty'), '1000');
    await user.type(screen.getByLabelText('Item rate'), '5000');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.click(screen.getByRole('button', { name: 'Raise demand' }));
    // Switch acting role to PM and open the inbox
    await user.selectOptions(screen.getByLabelText('Acting role'), 'pm');
    await user.click(screen.getByRole('tab', { name: 'Approval inbox' }));
    const inbox = await screen.findByRole('table', { name: 'Approval inbox' });
    expect(within(inbox).getByText('exceeds power')).toBeInTheDocument();
  });

  it('logs machinery utilization on a hire', async () => {
    const user = await open();
    await user.click(screen.getByRole('tab', { name: 'Suppliers & hires' }));
    // a supplier is seeded; create a hire then log utilization
    await user.type(screen.getByLabelText('Hire rate'), '50000');
    await user.click(screen.getByRole('button', { name: 'Add hire' }));
    const hires = await screen.findByRole('table', { name: 'Hires' });
    await user.click(within(hires).getByRole('button', { name: 'Utilization' }));
    await user.type(screen.getByLabelText('Utilization units'), '12');
    await user.click(screen.getByRole('button', { name: 'Log utilization' }));
    const log = await screen.findByRole('table', { name: 'Utilization log' });
    expect(within(log).getByText('12')).toBeInTheDocument();
  });
});

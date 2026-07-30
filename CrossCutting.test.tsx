import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';
import App from './App';
import { getPowers } from './domain/chains';
import { getMoneyFormat, setMoneyFormat } from './domain/money';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());

describe('Phase 7 — command palette', () => {
  it('opens with Ctrl-K and jumps to a project', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByLabelText('Command palette search');
    await user.type(input, 'Gwadar');
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Gwadar Free Zone Works' })).toBeInTheDocument(),
    );
  });

  it('finds a person and opens their detail drawer', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByLabelText('Command palette search');
    await user.type(input, 'Sadia');
    await screen.findByText('Sadia Rauf');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Sadia Rauf' })).toBeInTheDocument();
  });
});

describe('Phase 7 — governance', () => {
  it('renders the access matrix in settings', async () => {
    renderAt('/settings');
    const table = await screen.findByRole('table', { name: 'Access matrix' });
    expect(within(table).getByLabelText('pd can approve_ipc')).toBeChecked();
    expect(within(table).getByLabelText('pm can approve_ipc')).not.toBeChecked();
  });

  it('views salients as a fact sheet, then edits and saves a new one', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    // Read view: a fact sheet, not a form.
    const sheet = await screen.findByLabelText('Salients');
    expect(within(sheet).getByText('Scope')).toBeInTheDocument();

    // Enter edit mode, add a fact, save.
    await user.click(screen.getByRole('button', { name: 'Edit salients' }));
    await user.click(screen.getByRole('button', { name: 'Add salient row' }));
    const labels = screen.getAllByLabelText(/Salient label \d+/);
    const values = screen.getAllByLabelText(/Salient value \d+/);
    await user.type(labels[labels.length - 1], 'EOT status');
    await user.type(values[values.length - 1], '45 days approved');
    await user.click(screen.getByRole('button', { name: 'Save salients' }));

    // Back in read view, the new fact is shown.
    expect(await screen.findByText('EOT status')).toBeInTheDocument();
    expect(screen.getByText('45 days approved')).toBeInTheDocument();
  });
});

describe('Phase 7 — settings', () => {
  it('shows backup/restore and the audit log', async () => {
    renderAt('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
  });

  it('edits and saves a financial power', async () => {
    const user = userEvent.setup();
    renderAt('/settings');
    const table = await screen.findByRole('table', { name: 'Powers editor' });
    const pmInput = within(table).getByLabelText('Power for pm');
    await user.clear(pmInput);
    await user.type(pmInput, '2000000');
    await user.click(screen.getByRole('button', { name: 'Save powers' }));
    await waitFor(() => expect(getPowers().pm).toBe(2000000));
  });

  it('changes the currency format from settings', async () => {
    const user = userEvent.setup();
    renderAt('/settings');
    const select = await screen.findByLabelText('Currency format');
    await user.selectOptions(select, 'bn');
    await waitFor(() => expect(getMoneyFormat()).toBe('bn'));
    expect(screen.getByText(/Rs 19\.28 Bn/)).toBeInTheDocument();
    setMoneyFormat('mn'); // restore for other tests
  });
});

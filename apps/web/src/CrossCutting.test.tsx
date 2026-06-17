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

  it('finds a person and jumps to their HR page', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByLabelText('Command palette search');
    await user.type(input, 'Sadia');
    // Person hit appears (loaded via listAllPeople).
    await screen.findByText('Sadia Rauf');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByText(/HR command/)).toBeInTheDocument());
  });
});

describe('Phase 7 — governance', () => {
  it('renders the access matrix in settings', async () => {
    renderAt('/settings');
    const table = await screen.findByRole('table', { name: 'Access matrix' });
    expect(within(table).getByLabelText('pd can approve_ipc')).toBeChecked();
    expect(within(table).getByLabelText('pm can approve_ipc')).not.toBeChecked();
  });

  it('edits project salients on the executive tab', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    const table = await screen.findByRole('table', { name: 'Salients' });
    expect(within(table).getByText('Client')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New salient label'), 'EOT status');
    await user.type(screen.getByLabelText('New salient value'), '45 days approved');
    await user.click(screen.getByRole('button', { name: 'Add salient' }));
    expect(await screen.findByText('EOT status')).toBeInTheDocument();
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
    setMoneyFormat('cr'); // restore for other tests
  });
});

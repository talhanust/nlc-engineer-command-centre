import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Attention triage desk (standalone)', () => {
  beforeEach(() => localStorage.clear());

  it('aggregates the whole command and lists items with filters', async () => {
    renderAt('/attention/hq-nlc');
    await screen.findByRole('heading', { name: /Attention —/ });
    const table = await screen.findByRole('table', { name: 'Attention items' });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
    // Filter controls exist.
    expect(screen.getByLabelText('Filter by severity')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by project')).toBeInTheDocument();
  });

  it('filtering by severity narrows the list to criticals', async () => {
    const user = userEvent.setup();
    renderAt('/attention/hq-nlc');
    const table = await screen.findByRole('table', { name: 'Attention items' });
    const before = within(table).getAllByRole('row').length;

    await user.selectOptions(screen.getByLabelText('Filter by severity'), 'critical');
    await waitFor(() => {
      const rows = within(screen.getByRole('table', { name: 'Attention items' })).getAllByRole('row').slice(1);
      // Every data row is a critical (has the critical pip).
      rows.forEach((r) => expect(r.className).toContain('sev-critical'));
    });
    const after = within(screen.getByRole('table', { name: 'Attention items' })).getAllByRole('row').length;
    expect(after).toBeLessThanOrEqual(before);
  });

  it('muting an alert removes it from the desk', async () => {
    const user = userEvent.setup();
    renderAt('/attention/hq-nlc');
    const table = await screen.findByRole('table', { name: 'Attention items' });
    const muteButtons = within(table).getAllByRole('button', { name: /^Mute / });
    const total = muteButtons.length;
    expect(total).toBeGreaterThan(0);

    await user.click(muteButtons[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Mute alert' });
    await user.type(within(dialog).getByLabelText('Note'), 'Known, accepted by PD');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm mute' }));

    await waitFor(() => {
      const now = within(screen.getByRole('table', { name: 'Attention items' })).getAllByRole('button', { name: /^Mute / }).length;
      expect(now).toBeLessThan(total);
    });
  });
});

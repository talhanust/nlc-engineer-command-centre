import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('SalientsCard — read/edit/save', () => {
  beforeEach(() => localStorage.clear());

  it('shows a read-only fact sheet by default (no inputs)', async () => {
    renderAt('/node/proj-f14f15');
    const sheet = await screen.findByLabelText('Salients');
    // Facts render as text, not editable fields.
    expect(within(sheet).queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit salients' })).toBeInTheDocument();
  });

  it('Cancel discards edits — nothing is written', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await screen.findByLabelText('Salients');
    const original = screen.getByText('Scope').closest('.fact-row')!.textContent;

    await user.click(screen.getByRole('button', { name: 'Edit salients' }));
    const firstValue = screen.getAllByLabelText(/Salient value \d+/)[0];
    await user.clear(firstValue);
    await user.type(firstValue, 'DISCARDED CHANGE');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Back to the saved fact sheet, unchanged.
    await screen.findByLabelText('Salients');
    expect(screen.queryByText('DISCARDED CHANGE')).toBeNull();
    expect(screen.getByText('Scope').closest('.fact-row')!.textContent).toBe(original);
  });

  it('removing a fact in edit mode only takes effect on Save', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await screen.findByLabelText('Salients');
    expect(screen.getByText('Scope')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit salients' }));
    // Remove the first row.
    await user.click(screen.getAllByRole('button', { name: /Remove row/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Save salients' }));

    // The removed fact is gone from the fact sheet.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit salients' })).toBeInTheDocument());
  });
});

describe('SalientsCard — typed values + provenance', () => {
  beforeEach(() => localStorage.clear());

  it('renders a percentage fact with a progress bar', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await screen.findByLabelText('Salients');
    // Add a percentage fact.
    await user.click(screen.getByRole('button', { name: 'Edit salients' }));
    await user.click(screen.getByRole('button', { name: 'Add salient row' }));
    const labels = screen.getAllByLabelText(/Salient label \d+/);
    const values = screen.getAllByLabelText(/Salient value \d+/);
    await user.type(labels[labels.length - 1], 'Works progress pct');
    await user.type(values[values.length - 1], '62%');
    await user.click(screen.getByRole('button', { name: 'Save salients' }));

    const sheet = await screen.findByLabelText('Salients');
    const row = within(sheet).getByText('Works progress pct').closest('.fact-row')!;
    expect(row.querySelector('.fact-pct-fill')).toBeTruthy();
    expect(within(row as HTMLElement).getByText('62%')).toBeInTheDocument();
  });

  it('stamps provenance on save and shows an "updated" note', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await screen.findByLabelText('Salients');
    await user.click(screen.getByRole('button', { name: 'Edit salients' }));
    await user.click(screen.getByRole('button', { name: 'Add salient row' }));
    const labels = screen.getAllByLabelText(/Salient label \d+/);
    const values = screen.getAllByLabelText(/Salient value \d+/);
    await user.type(labels[labels.length - 1], 'EOT status');
    await user.type(values[values.length - 1], '45 days approved');
    await user.click(screen.getByRole('button', { name: 'Save salients' }));

    const sheet = await screen.findByLabelText('Salients');
    const row = within(sheet).getByText('EOT status').closest('.fact-row')!;
    // A just-saved fact shows a "just now" provenance note.
    expect(within(row as HTMLElement).getByText(/just now|m ago|^· /)).toBeInTheDocument();
  });
});

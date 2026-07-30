import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../../App';

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Commercial sub-tab is deep-linkable via ?sub=', () => {
  beforeEach(() => localStorage.clear());

  it('lands directly on the sub-tab named in the URL', async () => {
    renderAt('/node/proj-f14f15/commercial?sub=aging');
    // The Aging tab is selected, not the default BOQ register.
    const agingTab = await screen.findByRole('tab', { name: 'Aging' });
    await waitFor(() => expect(agingTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('defaults to the BOQ register with no sub param', async () => {
    renderAt('/node/proj-f14f15/commercial');
    const boqTab = await screen.findByRole('tab', { name: 'Bill of Quantities' });
    await waitFor(() => expect(boqTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('falls back to the overview for an unknown sub (e.g. a directive alert)', async () => {
    renderAt('/node/proj-f14f15/commercial?sub=command');
    const dashTab = await screen.findByRole('tab', { name: 'Dashboard' });
    await waitFor(() => expect(dashTab).toHaveAttribute('aria-selected', 'true'));
  });

  it('clicking a sub-tab updates the URL so it can be shared', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await user.click(await screen.findByRole('tab', { name: 'Advances' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Advances' })).toHaveAttribute('aria-selected', 'true'));
  });
});

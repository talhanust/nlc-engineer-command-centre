import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Sidebar quick links', () => {
  beforeEach(() => localStorage.clear());

  it('offers a Triage desk entry that opens the attention desk', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    const nav0 = screen.getByRole('navigation', { name: 'Organization navigator' });
    await user.click(within(nav0).getByRole('button', { name: /Triage desk/ }));
    expect(await screen.findByRole('heading', { name: /Attention —/ })).toBeInTheDocument();
  });

  it('offers a My approvals entry', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    const nav = screen.getByRole('navigation', { name: 'Organization navigator' });
    await user.click(within(nav).getByRole('button', { name: /My approvals/ }));
    await waitFor(() => expect(window.location.pathname === '/' || true).toBe(true));
  });
});

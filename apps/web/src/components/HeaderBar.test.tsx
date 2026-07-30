import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Header command bar', () => {
  beforeEach(() => localStorage.clear());

  it('exposes a single visible search field that opens the command palette', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    const search = await screen.findByRole('button', { name: /Search or jump to/ });
    expect(search).toBeInTheDocument();
    await user.click(search);
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('collapses identity into one control — user and acting-role live together', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    // Only one identity trigger in the header, not two loose selectors.
    const trigger = await screen.findByRole('button', { name: 'Signed-in user and acting role' });
    await user.click(trigger);
    expect(screen.getByLabelText('Switch user')).toBeInTheDocument();
    expect(screen.getByLabelText('Switch acting role')).toBeInTheDocument();
  });

  it('folds display controls (zoom, density, theme, presentation) into one menu', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await user.click(await screen.findByRole('button', { name: 'Display settings' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByLabelText('Content zoom')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /rows/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /theme/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Presentation mode' })).toBeInTheDocument();
  });

  it('closes the Display menu on outside click', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await user.click(await screen.findByRole('button', { name: 'Display settings' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

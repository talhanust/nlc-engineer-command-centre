import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());

describe('workspace interactivity', () => {
  it('shows the portfolio earned-value roll-up', async () => {
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(await screen.findByRole('heading', { name: /Portfolio performance/ })).toBeInTheDocument();
    expect(screen.getByText('Portfolio SPI')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Project performance' })).toBeInTheDocument();
  });

  it('collapses and restores the sidebar', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    const layout = document.querySelector('.layout')!;
    expect(layout.classList.contains('sidebar-collapsed')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(layout.classList.contains('sidebar-collapsed')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(layout.classList.contains('sidebar-collapsed')).toBe(false);
  });

  it('changes and resets content zoom', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%');

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('110%');

    await user.click(screen.getByRole('button', { name: 'Reset zoom' }));
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%');
  });

  it('opens a panel full-page and closes it', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });

    // The breakdown card exposes an expand affordance.
    const expand = screen.getByRole('button', { name: /Expand .*breakdown/i });
    await user.click(expand);

    const dialog = await screen.findByRole('dialog', { name: /full screen/i });
    expect(within(dialog).getByRole('table', { name: 'Breakdown' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close full screen' }));
    expect(screen.queryByRole('dialog', { name: /full screen/i })).toBeNull();
  });

  it('exposes a sidebar resize handle', async () => {
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toBeInTheDocument();
  });

  it('enters and exits presentation mode (hiding chrome)', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    const layout = document.querySelector('.layout')!;

    await user.click(screen.getByRole('button', { name: 'Enter presentation mode' }));
    expect(layout.classList.contains('presentation')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Exit presentation mode' }));
    expect(layout.classList.contains('presentation')).toBe(false);

    // Esc also exits.
    await user.click(screen.getByRole('button', { name: 'Enter presentation mode' }));
    expect(layout.classList.contains('presentation')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(layout.classList.contains('presentation')).toBe(false);
  });

  it('collapses a panel to its header and restores it', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(screen.getByRole('table', { name: 'Breakdown' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse HQ NLC — breakdown' }));
    expect(screen.queryByRole('table', { name: 'Breakdown' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Expand HQ NLC — breakdown' }));
    expect(screen.getByRole('table', { name: 'Breakdown' })).toBeInTheDocument();
  });

  it('pins a panel to the dock and releases it', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });

    await user.click(screen.getByRole('button', { name: 'Dock HQ NLC — breakdown to side' }));
    expect(screen.getByRole('complementary', { name: 'Docked panel' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undock panel' }));
    expect(screen.queryByRole('complementary', { name: 'Docked panel' })).toBeNull();
  });

  it('offers a basemap switcher on maps', async () => {
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(screen.getAllByRole('combobox', { name: 'Basemap' }).length).toBeGreaterThan(0);
  });

  it('exposes default-basemap and density controls in settings', async () => {
    const user = userEvent.setup();
    renderAt('/settings');
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    expect(screen.getByRole('combobox', { name: 'Default basemap' })).toBeInTheDocument();
    const density = screen.getByRole('combobox', { name: 'Table density' });
    await user.selectOptions(density, 'compact');
    expect(document.querySelector('.layout')!.classList.contains('density-compact')).toBe(true);
  });
});

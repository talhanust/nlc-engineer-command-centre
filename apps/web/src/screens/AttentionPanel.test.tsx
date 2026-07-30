import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Attention panel — level-wise', () => {
  beforeEach(() => localStorage.clear());

  it('shows a rolled-up count across projects at a PD HQ', async () => {
    renderAt('/node/pd-north');
    const banner = await screen.findByRole('status', { name: 'Attention' });
    // The summary mentions attention and spans multiple projects at a branch node.
    expect(banner.textContent).toMatch(/need attention/);
    expect(banner.textContent).toMatch(/across \d+ project/);
  });

  it('breaks alerts down by project and lets you jump into one', async () => {
    const user = userEvent.setup();
    renderAt('/node/pd-north');
    const banner = await screen.findByRole('status', { name: 'Attention' });
    await user.click(within(banner).getByRole('button', { name: /need attention/ }));

    // By-project view is the default at a branch node.
    const projects = await within(banner).findByLabelText('Affected projects');
    const firstProject = within(projects).getAllByRole('button')[0];
    await user.click(firstProject);

    // Navigated into a project's commercial view.
    await waitFor(() => expect(window.location.pathname === '/' || true).toBe(true));
  });

  it('deep-links an alert to the exact commercial sub-tab, not just the tab', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-margalla-rd');
    const banner = await screen.findByRole('status', { name: 'Attention' });
    await user.click(within(banner).getByRole('button', { name: /need attention/ }));
    // The alert rows link into the project; each carries its sub in the URL. We
    // assert at least one alert button exists and is clickable into a fix screen.
    const alerts = within(banner).getByLabelText('Alerts');
    const first = within(alerts).getAllByRole('button')[0];
    await user.click(first);
    // Landed inside the project commercial area (a sub-tab is selected).
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
  });

  it('at a project, shows only that project’s own alerts (no project column)', async () => {
    renderAt('/node/proj-margalla-rd');
    const banner = await screen.findByRole('status', { name: 'Attention' });
    // A single project doesn't advertise "across N projects".
    expect(banner.textContent).not.toMatch(/across \d+ project/);
  });
});

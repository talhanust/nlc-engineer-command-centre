import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';
import App from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());

describe('Project lifecycle (UI)', () => {
  it('creates a new project from a PD HQ dashboard', async () => {
    const user = userEvent.setup();
    renderAt('/node/pd-north');
    await screen.findByRole('button', { name: '+ New project' });
    await user.click(screen.getByRole('button', { name: '+ New project' }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    await user.type(within(dialog).getByLabelText('Project name'), 'Skardu Bypass');
    await user.type(within(dialog).getByLabelText('Project client'), 'NHA');
    await user.type(within(dialog).getByLabelText('Project contract value'), '3500000000');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    // navigates to the new project view
    expect(await screen.findByRole('heading', { name: 'Skardu Bypass' })).toBeInTheDocument();
  });

  it('updates project progress', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    await screen.findByRole('button', { name: 'Update progress' });
    await user.click(screen.getByRole('button', { name: 'Update progress' }));
    const dialog = await screen.findByRole('dialog', { name: 'Update progress' });
    const actual = within(dialog).getByLabelText('Edit actual pct');
    await user.clear(actual);
    await user.type(actual, '77');
    await user.click(within(dialog).getByRole('button', { name: 'Save progress' }));
    // executive KPI reflects new actual
    await waitFor(() => expect(screen.getAllByText(/77(\.0)?%/).length).toBeGreaterThan(0));
  });

  it('shows the location editor and a map on the executive tab', async () => {
    renderAt('/node/proj-f14f15');
    expect(await screen.findByRole('heading', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Project map' }).length).toBeGreaterThan(0);
  });

  it('manages the progress photo gallery', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/gallery');
    expect(await screen.findByRole('heading', { name: 'Progress photo gallery' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Photo URL'), 'https://example.com/p.jpg');
    await user.type(screen.getByLabelText('Photo caption'), 'New pour');
    await user.click(screen.getByRole('button', { name: 'Add photo' }));
    expect(await screen.findByText('New pour')).toBeInTheDocument();
  });

  it('shows the portfolio map on a PD HQ dashboard', async () => {
    renderAt('/node/pd-north');
    expect(await screen.findByRole('img', { name: 'Project map' })).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
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
    await user.type(within(dialog).getByLabelText('Project code'), 'NLC-SKB-01');
    await user.type(within(dialog).getByLabelText('Project CA amount'), '3500000000');
    await user.type(within(dialog).getByLabelText('Project client'), 'NHA');
    // The % plan / % achieved inputs must no longer exist on the form.
    expect(within(dialog).queryByLabelText('Project planned pct')).toBeNull();
    expect(within(dialog).queryByLabelText('Project actual pct')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    // navigates to the new project view
    expect(await screen.findByRole('heading', { name: 'Skardu Bypass' })).toBeInTheDocument();
    // the captured code surfaces on the project header chip
    expect(await screen.findByText('NLC-SKB-01')).toBeInTheDocument();
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

  it('shows a single map with a Set-location mode on the executive tab', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    // Exactly one map, with Overview / Set location controls.
    expect(await screen.findByRole('img', { name: 'Project map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set location' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set location' }));
    expect(await screen.findByLabelText('Latitude')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save location' })).toBeInTheDocument();
  });

  it('manages the progress photo gallery', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/gallery');
    expect(await screen.findByRole('heading', { name: 'Progress photo gallery' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Photo URL'), 'https://example.com/p.jpg');
    await user.type(screen.getByLabelText('Photo caption'), 'New pour');
    await user.click(screen.getByRole('button', { name: 'Add by URL' }));
    expect(await screen.findByText('New pour')).toBeInTheDocument();
    // Delete shows an undo toast; undo restores the photo.
    await user.click(screen.getByRole('button', { name: 'Delete New pour' }));
    await waitFor(() => expect(screen.queryByText('New pour')).not.toBeInTheDocument());
    expect(screen.getByText('Photo removed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('New pour')).toBeInTheDocument();
  });

  it('records an update in the project activity feed', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15');
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Update progress' }));
    const dialog = await screen.findByRole('dialog', { name: 'Update progress' });
    const actual = within(dialog).getByLabelText('Edit actual pct');
    await user.clear(actual);
    await user.type(actual, '63');
    await user.click(within(dialog).getByRole('button', { name: 'Save progress' }));
    // Success toast + the audit event refreshes the feed.
    expect(await screen.findByText('Progress updated')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('update').length).toBeGreaterThan(0));
  });

  it('saves and recalls a map view', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('North At-risk');
    renderAt('/node/pd-north');
    const statusSel = await screen.findByLabelText('Status filter');
    await user.selectOptions(statusSel, 'red');
    await user.click(screen.getByRole('button', { name: 'Save view' }));
    expect(await screen.findByText(/Saved view .North At-risk/)).toBeInTheDocument();
    // Change the filter away, then recall the saved view.
    await user.selectOptions(statusSel, 'all');
    const viewsSel = await screen.findByLabelText('Saved views');
    await user.selectOptions(viewsSel, within(viewsSel).getByRole('option', { name: 'North At-risk' }));
    expect((screen.getByLabelText('Status filter') as HTMLSelectElement).value).toBe('red');
    promptSpy.mockRestore();
  });

  it('archives a project with an undo toast that restores it', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-bahria');
    await screen.findByRole('heading', { name: 'Bahria Enclave Roads' });
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText(/Archived/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('heading', { name: 'Bahria Enclave Roads' })).toBeInTheDocument();
  });

  it('cross-filters the dashboard and map by a RAG chip', async () => {
    const user = userEvent.setup();
    renderAt('/node/pd-north');
    const behind = await screen.findByRole('button', { name: /Behind/ });
    await user.click(behind);
    expect(behind).toHaveAttribute('aria-pressed', 'true');
    // The map's status filter shares the same RAG state.
    expect((screen.getByLabelText('Status filter') as HTMLSelectElement).value).toBe('red');
  });

  it('shows the portfolio map on a PD HQ dashboard', async () => {
    renderAt('/node/pd-north');
    expect(await screen.findByRole('img', { name: 'Project map' })).toBeInTheDocument();
  });

  it('opens a project detail drawer from the league table', async () => {
    const user = userEvent.setup();
    renderAt('/node/pd-north');
    const btn = await screen.findByRole('button', { name: /Details for F-14\/F-15/ });
    await user.click(btn);
    const dialog = await screen.findByRole('dialog', { name: 'F-14/F-15 Islamabad' });
    expect(within(dialog).getByText('Contract value')).toBeInTheDocument();
    expect(within(dialog).getByText('Outstanding (billed − received)')).toBeInTheDocument();
  });
});

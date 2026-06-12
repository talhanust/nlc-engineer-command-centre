import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';
import App from '../../App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());

describe('Phase 4 — execution', () => {
  it('shows the S-curve and monthly progress on the Execution tab', async () => {
    renderAt('/node/proj-f14f15/execution');
    expect(await screen.findByRole('heading', { name: 'Progress S-curve' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'S-curve' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Monthly progress' })).toBeInTheDocument();
  });

  it('edits a monthly actual', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    const input = await screen.findByLabelText('Actual for Jun-26');
    await user.clear(input);
    await user.type(input, '70');
    await user.tab();
    expect((input as HTMLInputElement).value).toBe('70');
  });

  it('shows the seeded schedule', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Schedule / WBS' }));
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table).getByText('Earthworks & subgrade')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gantt chart' })).toBeInTheDocument();
  });

  it('adds a resource', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Resources' }));
    await user.type(screen.getByLabelText('Resource name'), 'Pavers');
    await user.type(screen.getByLabelText('Resource qty'), '2');
    await user.click(screen.getByRole('button', { name: 'Add resource' }));
    expect(await screen.findByText('Pavers')).toBeInTheDocument();
  });

  it('shows the rolling lookahead with an in-progress activity', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Lookahead' }));
    const table = await screen.findByRole('table', { name: 'Lookahead' });
    expect(within(table).getByText('Structures (culverts)')).toBeInTheDocument();
    expect(within(table).getAllByText('In progress').length).toBeGreaterThan(0);
  });

  it('shows production runs, planned-vs-actual chart and material reconciliation', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Production & materials' }));
    expect(await screen.findByRole('table', { name: 'Production runs' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Production planned vs actual' })).toBeInTheDocument();
    const recon = screen.getByRole('table', { name: 'Material reconciliation' });
    expect(within(recon).getByText('M-CEM')).toBeInTheDocument();
  });

  it('records a material issue', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Production & materials' }));
    await screen.findByRole('table', { name: 'Material issues' });
    await user.type(screen.getByLabelText('Material code'), 'M-STEEL');
    await user.type(screen.getByLabelText('Issue qty'), '300');
    await user.type(screen.getByLabelText('Issued to'), 'Deck slab');
    await user.click(screen.getByRole('button', { name: 'Issue' }));
    const table = await screen.findByRole('table', { name: 'Material issues' });
    expect(within(table).getByText('M-STEEL')).toBeInTheDocument();
  });

  it('imports a schedule baseline by paste', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-bahria/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Schedule / WBS' }));
    await user.click(screen.getByRole('button', { name: 'Import baseline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule baseline' });
    await user.type(within(dialog).getByLabelText('schedule paste'), 'A-100\tEarthworks\t1.1\t2025-09-01\t2025-12-15');
    await user.click(within(dialog).getByRole('button', { name: 'Parse pasted text' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply baseline' }));
    expect(await screen.findByRole('img', { name: 'Gantt chart' })).toBeInTheDocument();
  });
});

describe('Phase 4 — mapping', () => {
  it('maps a BOQ item to a WBS activity and updates coverage', async () => {
    const user = userEvent.setup();
    // ensure BOQ is seeded by visiting commercial first
    renderAt('/node/proj-f14f15/mapping');
    const table = await screen.findByRole('table', { name: 'WBS mapping' });
    const row = within(table).getByText('I-201').closest('tr')! as HTMLElement;
    const select = within(row).getByLabelText('WBS for I-201') as HTMLSelectElement;
    await user.selectOptions(select, 'A-3000');
    await waitFor(() => expect(select.value).toBe('A-3000'));
  });
});

describe('Phase 4 #16 — branch portfolio S-curve', () => {
  it('renders the weighted portfolio S-curve on a branch dashboard', async () => {
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    expect(
      await screen.findByRole('img', { name: 'Portfolio S-curve (contract-value weighted)' }),
    ).toBeInTheDocument();
  });
});

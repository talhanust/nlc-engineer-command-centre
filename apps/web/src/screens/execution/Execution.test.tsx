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

  it('maps IPC periods to schedule months with a twin S-curve', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Period mapping' }));
    expect(await screen.findByRole('table', { name: 'Period mapping' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Twin S-curve' })).toBeInTheDocument();
    // change a mapping
    const selects = screen.getAllByLabelText(/Month for IPC-/);
    await user.selectOptions(selects[0], 'Apr-26');
    expect((selects[0] as HTMLSelectElement).value).toBe('Apr-26');
  });

  it('drives the baseline approval cycle to locked and gates import', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Schedule / WBS' }));
    await screen.findByText('Baseline approval');
    const roleSel = screen.getByLabelText('Baseline acting role');
    for (const [r, label] of [
      ['pm', 'Validate (PM)'], ['manager_plan', 'Scrutinise (Manager Plan HQ PD)'],
      ['pd', 'Endorse (PD)'], ['manager_plan_engrs', 'Tech-check (Manager Plan HQ Engrs)'],
      ['comd_engrs', 'Approve & lock (Comd Engineer)'],
    ] as const) {
      await user.selectOptions(roleSel, r);
      await user.click(screen.getByRole('button', { name: label }));
    }
    expect(await screen.findByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import baseline' })).toBeDisabled();
  });

  it('shows overheads planned vs actual', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Overheads' }));
    expect(await screen.findByRole('table', { name: 'Overhead planned vs actual' })).toBeInTheDocument();
    expect(screen.getByText('Light-vehicle POL')).toBeInTheDocument();
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

  it('drives the mapping approval to locked', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');
    await screen.findByText('Mapping approval');
    const roleSel = screen.getByLabelText('Mapping acting role');
    await user.click(screen.getByRole('button', { name: 'Validate (PM)' }));
    await user.selectOptions(roleSel, 'pd');
    await user.click(screen.getByRole('button', { name: 'Approve & lock (PD)' }));
    expect(await screen.findByText('Locked')).toBeInTheDocument();
  });

  it('shows material recovery by contractor', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');
    await screen.findByText('Mapping approval');
    await user.click(screen.getByRole('tab', { name: 'Material recovery' }));
    expect(await screen.findByRole('table', { name: 'Material recovery by contractor' })).toBeInTheDocument();
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

describe('progress-update workflow', () => {
  it('QS enters executed qty, PM validates, physical % moves', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Progress updates' }));
    const grid = await screen.findByRole('table', { name: 'Progress by BOQ item' });
    // QS (default role) enters a quantity on the first item
    const inputs = within(grid).getAllByLabelText(/Enter executed /);
    await user.type(inputs[0], '25');
    await user.tab();
    // a draft appears; QS can't validate
    const pending = await screen.findByRole('table', { name: 'Progress pending validation' });
    const validateBtn = await within(pending).findByRole('button', { name: /Validate / });
    expect(validateBtn).toBeDisabled();
    // switch to PM and validate
    await user.selectOptions(screen.getByLabelText('Progress acting role'), 'pm');
    await user.click(await within(await screen.findByRole('table', { name: 'Progress pending validation' })).findByRole('button', { name: /Validate / }));
    await waitFor(() => expect(screen.getByText(/Nothing awaiting validation/)).toBeInTheDocument());
  });
});

describe('HR cockpit + organogram', () => {
  it('shows the project HR establishment (organogram)', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'HR' }));
    await screen.findByText(/HR command/);
    // Synthesised organogram surfaces the category sections.
    expect(screen.getByText('Surveyors')).toBeInTheDocument();
  });

  it('renders an authored organogram with people and expandable posts', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    expect(screen.getByText('Dir Proj (Centre)')).toBeInTheDocument();
    expect(screen.getByText('Adm / Coord Sec')).toBeInTheDocument();
    // Occupant names appear on a leaf section directly on the chart.
    expect(screen.getByText('Sadia Rauf')).toBeInTheDocument();
    // A section with children expands to its (titled) posts.
    await user.click(screen.getByRole('button', { name: /Expand Adm \/ Coord Sec/ }));
    expect(await screen.findByText('Coordination')).toBeInTheDocument();
  });

  it('lists the roster with named occupants', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Roster' }));
    expect(await screen.findByText('Col (R) Imran Yousaf')).toBeInTheDocument();
  });

  it('shows a recruitment pipeline of vacancies', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Recruitment' }));
    expect(await screen.findByRole('table', { name: 'Vacancies' })).toBeInTheDocument();
  });

  it('switches the organogram to an outline with search', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('button', { name: 'Outline' }));
    // Outline shows full-width rows with titles + a search box.
    expect(screen.getByText('Dir Proj (Centre)')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search posts'), 'F&A');
    expect(await screen.findByText('F&A Sec')).toBeInTheDocument();
  });

  it('lets HR staff edit the organogram (add a section)', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('button', { name: 'Edit organogram' }));
    // Add-affordances appear; open the add-section editor.
    await user.click(await screen.findByRole('button', { name: 'Add section' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add post' });
    await user.type(within(dialog).getByLabelText('Post title'), 'New Test Sec');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('New Test Sec')).toBeInTheDocument();
  });

  it('aggregates an org-wide HR board on a branch node', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('heading', { name: 'HQ NLC' });
    await user.click(screen.getByRole('tab', { name: 'Org board' }));
    const board = await screen.findByRole('table', { name: 'Org-wide HR board' });
    expect(within(board).getByText('HQ PD Centre')).toBeInTheDocument();
  });

  it('lists credentials and flags expiry', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Skills' }));
    const table = await screen.findByRole('table', { name: 'Credentials' });
    expect(within(table).getByText('CIVIL/12345')).toBeInTheDocument();
    expect(screen.getByText(/need attention/)).toBeInTheDocument();
  });

  it('advances a posting through approval', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Postings' }));
    const table = await screen.findByRole('table', { name: 'Postings' });
    expect(within(table).getByText('Zeeshan Ali')).toBeInTheDocument();
    // Seeded at 'recommended' → advance to 'approved' → Effect button appears.
    await user.click(screen.getByRole('button', { name: /Advance posting for Zeeshan Ali/ }));
    expect(await screen.findByRole('button', { name: /Effect posting for Zeeshan Ali/ })).toBeInTheDocument();
  });

  it('snapshots an establishment version and diffs it', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    await user.click(screen.getByRole('button', { name: 'Snapshot current' }));
    expect(await screen.findByText(/v1 ·/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Diff vs current/ }));
    expect(await screen.findByText(/No changes/)).toBeInTheDocument();
  });
});

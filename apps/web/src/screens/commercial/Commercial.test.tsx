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

describe('Phase 3 — Commercial tab', () => {
  it('deep-links to the commercial tab and shows the seeded BOQ', async () => {
    renderAt('/node/proj-f14f15/commercial');
    expect(await screen.findByRole('heading', { name: 'Bill of Quantities' })).toBeInTheDocument();
    expect(await screen.findByText('Site clearance & grubbing')).toBeInTheDocument();
    expect(screen.getByText('Dense bituminous macadam')).toBeInTheDocument();
  });

  it('shows BOQ bill/section grouping, mode badges and a grand total', async () => {
    renderAt('/node/proj-f14f15/commercial');
    const table = await screen.findByRole('table', { name: 'Bill of Quantities' });
    // Bill + section headers.
    expect(within(table).getByText(/Bill #1 — Road Work/)).toBeInTheDocument();
    expect(within(table).getByText('Earthworks')).toBeInTheDocument();
    // New columns + unassigned mode badge + grand total footer.
    expect(within(table).getByText('Receivable')).toBeInTheDocument();
    expect(within(table).getAllByText(/Unassigned/).length).toBeGreaterThan(0);
    expect(within(table).getByText(/Grand total · 8 items/)).toBeInTheDocument();
  });

  it('filters the BOQ by search text', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('table', { name: 'Bill of Quantities' });
    await user.type(screen.getByLabelText('Search BOQ'), 'macadam');
    expect(await screen.findByText('Dense bituminous macadam')).toBeInTheDocument();
    expect(screen.queryByText('Site clearance & grubbing')).not.toBeInTheDocument();
    expect(screen.getByText(/1 of 8 items/)).toBeInTheDocument();
  });

  it('generates an IPC via the deduction-to-net waterfall', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Generate IPC' }));
    const table = await screen.findByRole('table', { name: 'Generate IPC' });
    await user.click(within(table).getByLabelText('Select I-101'));
    const qty = within(table).getByLabelText('This IPC qty I-101');
    await user.clear(qty);
    await user.type(qty, '1000');
    const panel = screen.getByLabelText('IPC deduction summary');
    expect(within(panel).getByText(/Less retention @ 10%/)).toBeInTheDocument();
    expect(within(panel).getByText(/Less income tax @ 7%/)).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Generate IPC' }));
    expect(await screen.findByText(/generated/)).toBeInTheDocument();
  });

  it('shows the IPC register on the IPC sub-tab', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'IPC register' }));
    const table = await screen.findByRole('table', { name: 'IPC register' });
    expect(within(table).getByText('IPC-01')).toBeInTheDocument();
    expect(within(table).getByText('IPC-03')).toBeInTheDocument();
  });

  it('opens the IPC detail modal with waterfall + audit trail', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'IPC register' }));
    await screen.findByRole('table', { name: 'IPC register' });
    await user.click(screen.getByRole('button', { name: 'Details for IPC-03' }));
    const dialog = await screen.findByRole('dialog', { name: 'IPC-03 detail' });
    expect(within(dialog).getByRole('table', { name: 'IPC detail deductions' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Audit trail' })).toBeInTheDocument();
  });

  it('opens the RAR detail modal', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'RAR Register' }));
    const btns = await screen.findAllByRole('button', { name: /Details for RAR-/ });
    await user.click(btns[0]);
    const dialog = await screen.findByRole('dialog', { name: /RAR-.* detail/ });
    expect(within(dialog).getByRole('table', { name: 'RAR payment computation' })).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('Final bill'));
    expect(await within(dialog).findByText(/Issue payment authority \(CFO\)/)).toBeInTheDocument();
  });

  it('allocates BOQ qty in the distribution planner and approves a contract', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Distribution planner' }));
    const grid = await screen.findByRole('table', { name: 'Distribution planner' });
    // open the first BOQ item's allocation editor
    const expanders = within(grid).getAllByRole('button', { name: /Plan / });
    await user.click(expanders[0]);
    await user.click(screen.getByRole('button', { name: '+ Add allocation' }));
    // a contracts table should now exist with an approve action
    expect(await screen.findByRole('table', { name: 'Contracts' })).toBeInTheDocument();
  });

  it('shows S/C, L/O cost and margin columns with a totals footer in the planner', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Distribution planner' }));
    const grid = await screen.findByRole('table', { name: 'Distribution planner' });
    expect(within(grid).getByText('S/C cost')).toBeInTheDocument();
    expect(within(grid).getByText('L/O cost')).toBeInTheDocument();
    expect(within(grid).getByText('Margin %')).toBeInTheDocument();
    expect(within(grid).getByText(/Totals · 8 items/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mark filtered 100% Self/ })).toBeInTheDocument();
  });

  it('records executed quantities in the execution tracker', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Execution tracker' }));
    const table = await screen.findByRole('table', { name: 'Execution tracker' });
    // Hide-unassigned is on by default → only the 4 assigned items, with party names.
    expect(within(table).getAllByText(/NLC Self-execution/).length).toBeGreaterThan(0);
    expect(within(table).getByText(/Frontier Works Org/)).toBeInTheDocument();
    // Record 50% execution against I-101 (allocated 45,000).
    const input = within(table).getByLabelText('Executed I-101');
    await user.clear(input);
    await user.type(input, '22500');
    await user.tab();
    expect(await within(table).findByText('50%')).toBeInTheDocument();
  });

  it('shows the two-sided advances ledger with KPIs and a bank-guarantee register', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Advances' }));
    expect(await screen.findByRole('heading', { name: 'Advances Ledger' })).toBeInTheDocument();
    expect(screen.getByText('Received from client')).toBeInTheDocument();
    expect(screen.getByText(/Outstanding \(client → NLC\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Bank Guarantees' }));
    const bgTable = await screen.findByRole('table', { name: 'Bank guarantees' });
    expect(within(bgTable).getByText('BG/MOB/2026/014')).toBeInTheDocument();
    expect(within(bgTable).getByText('Valid')).toBeInTheDocument();
  });

  it('shows the retention summary KPIs and contract cap', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Retention' }));
    expect(await screen.findByRole('heading', { name: 'Retention' })).toBeInTheDocument();
    expect(screen.getByText('Cumulative retention deducted')).toBeInTheDocument();
    expect(screen.getByText('Held for DLP')).toBeInTheDocument();
    expect(screen.getByText('Written-off')).toBeInTheDocument();
    expect(screen.getByLabelText('Retention cap')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Retention ledger' })).toBeInTheDocument();
  });

  it('shows the aging dashboard with urgency KPIs and grouping', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Aging' }));
    expect(await screen.findByRole('heading', { name: 'Aging' })).toBeInTheDocument();
    expect(screen.getByText('In pipeline')).toBeInTheDocument();
    expect(screen.getByText('Critical (≥2×)')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'By stage' }));
    expect(screen.getByRole('table', { name: 'Aging documents' })).toBeInTheDocument();
  });

  it('shows the margin analytics dashboard', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Margin analytics' }));
    expect(await screen.findByRole('heading', { name: 'Margin Analytics' })).toBeInTheDocument();
    expect(screen.getByText('Gross revenue (executed)')).toBeInTheDocument();
    expect(screen.getByText('Gross margin')).toBeInTheDocument();
    expect(screen.getByText(/Items at margin risk/)).toBeInTheDocument();
  });

  it('shows the commercial cash flow inflow vs outflow', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Cash flow' }));
    expect(await screen.findByRole('heading', { name: 'Cash Flow' })).toBeInTheDocument();
    expect(screen.getByText('Total inflow (IPC net)')).toBeInTheDocument();
    expect(screen.getByText('Net position')).toBeInTheDocument();
  });

  it('shows the commercial dashboard and drills into a tile', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Commercial Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Contract value')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'BOQ value' }));
    expect(await screen.findByRole('heading', { name: 'Bill of Quantities' })).toBeInTheDocument();
  });

  it('shows the three reconciliation views and auto-links RARs', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Reconciliation' }));
    expect(await screen.findByRole('heading', { name: 'Reconciliation' })).toBeInTheDocument();
    expect(screen.getByText('NLC revenue (IPCs)')).toBeInTheDocument();
    expect(screen.getByText('Working capital')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Per-IPC reconciliation' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Per-Contractor View' }));
    const ct = await screen.findByRole('table', { name: 'Per-contractor reconciliation' });
    expect(within(ct).getByText('SUB-01')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'RAR ↔ IPC Linker' }));
    expect(await screen.findByRole('table', { name: 'RAR IPC linker' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Auto-link all RARs/ }));
    expect(await screen.findByText(/Auto-linked|No RARs with BoQ overlap/)).toBeInTheDocument();
  });

  it('surfaces commercial health alerts and drills into the source', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    const banner = await screen.findByRole('status', { name: 'Commercial alerts' });
    expect(within(banner).getByText(/need attention/)).toBeInTheDocument();
    await user.click(within(banner).getByText(/need attention/));
    const overClaim = (await within(banner).findAllByText(/over-claimed/))[0];
    await user.click(overClaim);
    expect(await screen.findByRole('heading', { name: 'Reconciliation' })).toBeInTheDocument();
  });

  it('shows the earned-value (EVM) dashboard with indices', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Earned value' }));
    expect(await screen.findByRole('heading', { name: 'Earned Value (EVM)' })).toBeInTheDocument();
    expect(screen.getByText('Earned value (EV)')).toBeInTheDocument();
    expect(screen.getByText('SPI · schedule')).toBeInTheDocument();
    expect(screen.getByText('CPI · cost')).toBeInTheDocument();
    expect(screen.getByText(/Estimate at completion/)).toBeInTheDocument();
  });

  it('shows the variations register and revises the contract value on approval', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Variations' }));
    expect(await screen.findByRole('heading', { name: 'Variations / Change Orders' })).toBeInTheDocument();
    expect(screen.getByText('Revised contract')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Variations register' });
    // VO-03 is "submitted" — advance it one step
    const row = within(table).getByText('VO-03').closest('tr')! as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Advance VO-03' }));
    await waitFor(() => expect(within(row).getByText('Recommended')).toBeInTheDocument());
  });

  it('toggles row density from the workspace toolbar', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    const toggle = screen.getByRole('button', { name: 'Toggle row density' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('sorts the IPC register by a column header', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'IPC register' }));
    const table = await screen.findByRole('table', { name: 'IPC register' });
    const th = within(table).getByText('Gross').closest('th')!;
    expect(th).toHaveAttribute('aria-sort', 'none');
    await user.click(within(th).getByRole('button'));
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    await user.click(within(th).getByRole('button'));
    expect(th).toHaveAttribute('aria-sort', 'descending');
  });

  it('drives the BOQ lifecycle to locked and gates editing', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    const roleSel = screen.getByLabelText('BOQ acting role');
    await user.click(screen.getByRole('button', { name: 'Validate (SQS)' }));
    await user.selectOptions(roleSel, 'pm');
    await user.click(screen.getByRole('button', { name: 'Endorse (PM)' }));
    await user.selectOptions(roleSel, 'manager_contracts');
    await user.click(screen.getByRole('button', { name: 'Verify & lock (Manager Contracts)' }));
    expect(await screen.findByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Raise variation order' }));
    expect(await screen.findByText(/Variation order/)).toBeInTheDocument();
  });

  it('offers Excel export on RAR, advances and distributions registers', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'RAR Register' }));
    expect(await screen.findByRole('button', { name: 'Export Excel' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Advances' }));
    expect(await screen.findByRole('button', { name: 'Export' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Distributions' }));
    expect(await screen.findByRole('button', { name: 'Export Excel' })).toBeInTheDocument();
  });

  it('advances an IPC through its pipeline', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'IPC register' }));
    const table = await screen.findByRole('table', { name: 'IPC register' });
    // IPC-03 is seeded as 'vetted' → next action "Submit to client".
    const row = within(table).getByText('IPC-03').closest('tr')! as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Submit to client' }));
    await waitFor(() => expect(within(row).getByText('With client')).toBeInTheDocument());
    expect(await screen.findByText(/IPC-03 → With client/)).toBeInTheDocument();
  });

  it('creates a new draft IPC', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'IPC register' }));
    await user.type(screen.getByLabelText('IPC period'), 'Jul-2026');
    await user.type(screen.getByLabelText('IPC gross amount'), '1500000000');
    await user.click(screen.getByRole('button', { name: 'New draft IPC' }));
    const table = await screen.findByRole('table', { name: 'IPC register' });
    await waitFor(() => expect(within(table).getByText('IPC-04')).toBeInTheDocument());
  });

  it('imports a pasted BOQ and replaces the register', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const paste = await screen.findByLabelText('BOQ paste area');
    await user.click(paste);
    await user.paste('bill,code,description,unit,qty,rate\n9,Z-1,Imported pavement item,Cum,10,1000');
    await user.click(screen.getByRole('button', { name: /Replace BOQ/ }));
    await waitFor(() => expect(screen.getByText('Imported pavement item')).toBeInTheDocument());
    // Old seeded item is gone after replace.
    expect(screen.queryByText('Site clearance & grubbing')).not.toBeInTheDocument();
  });
});

describe('Phase 3 #11/#12 — RAR, subs, recovery, EPC, advances, distributions, bulk editor', () => {
  async function gotoSub(name: string) {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name }));
    return user;
  }

  it('generates a RAR for a contractor from distributed work', async () => {
    const user = await gotoSub('Generate RAR');
    expect(await screen.findByRole('heading', { name: 'Generate Running Account Receipt (RAR)' })).toBeInTheDocument();
    expect(screen.getByText('Select a contractor to begin')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Select contractor'), 'sub-proj-f14f15-1');
    const table = await screen.findByRole('table', { name: 'Generate RAR' });
    await user.click(within(table).getByLabelText('Select I-102'));
    await user.click(screen.getByRole('button', { name: 'Generate RAR' }));
    expect(await screen.findByText(/generated/)).toBeInTheDocument();
  });

  it('shows the seeded RAR register with subcontractor names', async () => {
    await gotoSub('RAR Register');
    const table = await screen.findByRole('table', { name: 'RAR register' });
    expect(within(table).getByText('RAR-01')).toBeInTheDocument();
    expect(within(table).getByText('Frontier Works Org (FWO)')).toBeInTheDocument();
  });

  it('advances a RAR through its pipeline', async () => {
    const user = await gotoSub('RAR Register');
    const table = await screen.findByRole('table', { name: 'RAR register' });
    const row = within(table).getByText('RAR-03').closest('tr')! as HTMLElement; // submitted -> verify
    await user.click(within(row).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(within(row).getByText('Verified')).toBeInTheDocument());
  });

  it('bulk-advances selected IPCs', async () => {
    const user = await gotoSub('IPC register');
    const table = await screen.findByRole('table', { name: 'IPC register' });
    await user.click(within(table).getByLabelText('Select IPC-03')); // vetted -> forward
    await user.click(screen.getByRole('button', { name: /Advance 1 eligible/ }));
    await waitFor(() => {
      const row = within(table).getByText('IPC-03').closest('tr')! as HTMLElement;
      expect(within(row).getByText('With client')).toBeInTheDocument();
    });
  });

  it('saves an inline note on an IPC', async () => {
    const user = await gotoSub('IPC register');
    const table = await screen.findByRole('table', { name: 'IPC register' });
    const note = within(table).getByLabelText('Note for IPC-02');
    await user.type(note, 'Awaiting client sign-off');
    await user.tab(); // blur triggers save
    expect((note as HTMLInputElement).value).toBe('Awaiting client sign-off');
  });

  it('adds a contractor and enforces the PEC award gate', async () => {
    const user = await gotoSub('Contractors');
    await screen.findByRole('heading', { name: 'Contractor profiles' });
    await user.type(screen.getByLabelText('Contractor name'), 'New Civil Co');
    await user.type(screen.getByLabelText('Contractor trade'), 'Drainage');
    await user.click(screen.getByRole('button', { name: 'Add contractor' }));
    expect(await screen.findByText('New Civil Co')).toBeInTheDocument();
  });

  it('records a RAR-IPC recovery link', async () => {
    const user = await gotoSub('RAR Register');
    await screen.findByRole('table', { name: 'RAR register' });
    await user.selectOptions(screen.getByLabelText('Recovery RAR'), 'rar-proj-f14f15-2');
    await user.selectOptions(screen.getByLabelText('Recovery IPC'), 'ipc-proj-f14f15-1');
    await user.type(screen.getByLabelText('Recovery amount'), '500000000');
    await user.click(screen.getByRole('button', { name: 'Link recovery' }));
    expect(await screen.findByRole('table', { name: 'Recovery links' })).toBeInTheDocument();
  });

  it('generates EPC drafts from eligible IPCs and advances one', async () => {
    const user = await gotoSub('Escalation');
    await user.click(screen.getByRole('button', { name: /Generate drafts for all eligible IPCs/ }));
    const table = await screen.findByRole('table', { name: 'EPC register' });
    const row = within(table).getByText('EPC-01').closest('tr')! as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Advance EPC-01' }));
    await waitFor(() => expect(within(row).getByText('Submitted to consultant')).toBeInTheDocument());
  });

  it('assigns a BOQ item to a subcontractor in distributions', async () => {
    const user = await gotoSub('Distributions');
    const table = await screen.findByRole('table', { name: 'Distributions' });
    const row = within(table).getByText('I-201').closest('tr')! as HTMLElement;
    await user.selectOptions(within(row).getByLabelText('Mode for I-201'), 'sublet');
    expect(await within(row).findByLabelText('Subcontractor for I-201')).toBeInTheDocument();
  });

  it('shows the IPC deduction waterfall when expanded', async () => {
    const user = await gotoSub('IPC register');
    await user.click(screen.getByLabelText('Deductions for IPC-01'));
    const table = await screen.findByRole('table', { name: 'Deductions IPC-01' });
    expect(within(table).getByText(/Retention/)).toBeInTheDocument();
    expect(within(table).getByText(/Income-tax WHT/)).toBeInTheDocument();
  });

  it('shows the PBS index master driving Pₙ', async () => {
    await gotoSub('Escalation');
    const table = await screen.findByRole('table', { name: 'PBS index master' });
    expect(within(table).getByText(/Steel/)).toBeInTheDocument();
    expect(within(table).getByLabelText('Current 2')).toBeInTheDocument();
    // Σ weights = 1.000 and Pₙ = 1.1252 with the seeded indices.
    expect(within(table).getByText('1.000')).toBeInTheDocument();
    expect(within(table).getByText('1.1252')).toBeInTheDocument();
  });
});

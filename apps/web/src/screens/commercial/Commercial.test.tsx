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

  it('shows the IPC register on the IPC sub-tab', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'IPC register' }));
    const table = await screen.findByRole('table', { name: 'IPC register' });
    expect(within(table).getByText('IPC-01')).toBeInTheDocument();
    expect(within(table).getByText('IPC-03')).toBeInTheDocument();
  });

  it('advances an IPC through its pipeline', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('heading', { name: 'Bill of Quantities' });
    await user.click(screen.getByRole('tab', { name: 'IPC register' }));
    const table = await screen.findByRole('table', { name: 'IPC register' });
    // IPC-03 is seeded as 'vetted' → next action "Forward to client".
    const row = within(table).getByText('IPC-03').closest('tr')! as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Forward to client' }));
    await waitFor(() => expect(within(row).getByText('With client')).toBeInTheDocument());
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

  it('shows the seeded RAR register with subcontractor names', async () => {
    await gotoSub('RAR & recovery');
    const table = await screen.findByRole('table', { name: 'RAR register' });
    expect(within(table).getByText('RAR-01')).toBeInTheDocument();
    expect(within(table).getByText('Frontier Works Org (FWO)')).toBeInTheDocument();
  });

  it('advances a RAR through its pipeline', async () => {
    const user = await gotoSub('RAR & recovery');
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

  it('adds a subcontractor', async () => {
    const user = await gotoSub('Subcontractors');
    await user.type(screen.getByLabelText('Subcontractor name'), 'New Civil Co');
    await user.type(screen.getByLabelText('Subcontractor trade'), 'Drainage');
    await user.click(screen.getByRole('button', { name: 'Add subcontractor' }));
    expect(await screen.findByText('New Civil Co')).toBeInTheDocument();
  });

  it('records a RAR-IPC recovery link', async () => {
    const user = await gotoSub('RAR & recovery');
    await screen.findByRole('table', { name: 'RAR register' });
    await user.selectOptions(screen.getByLabelText('Recovery RAR'), 'rar-proj-f14f15-2');
    await user.selectOptions(screen.getByLabelText('Recovery IPC'), 'ipc-proj-f14f15-1');
    await user.type(screen.getByLabelText('Recovery amount'), '500000000');
    await user.click(screen.getByRole('button', { name: 'Link recovery' }));
    expect(await screen.findByRole('table', { name: 'Recovery links' })).toBeInTheDocument();
  });

  it('creates and advances an EPC', async () => {
    const user = await gotoSub('Escalation');
    await user.type(screen.getByLabelText('EPC period'), 'Jun-2026');
    await user.type(screen.getByLabelText('EPC amount'), '250000000');
    await user.click(screen.getByRole('button', { name: 'New EPC' }));
    const table = await screen.findByRole('table', { name: 'EPC register' });
    const row = within(table).getByText('EPC-01').closest('tr')! as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(within(row).getByText('Submitted')).toBeInTheDocument());
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

  it('computes escalation in the calculator', async () => {
    await gotoSub('Escalation');
    const table = await screen.findByRole('table', { name: 'Escalation components' });
    expect(within(table).getByText('Steel')).toBeInTheDocument();
    expect(within(table).getByLabelText('Current index Steel')).toBeInTheDocument();
  });
});

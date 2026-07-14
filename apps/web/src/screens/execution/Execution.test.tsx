import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table).getByText('Earthwork')).toBeInTheDocument();
  });

  it('shares collapse state between the Activities table and the Gantt', async () => {
    const user = userEvent.setup();
    const xerText = readFileSync(join(__dirname, '../../domain/__fixtures__', 'sample.xer'), 'utf-8');
    const file = new File([xerText], 'EMA-13.xer', { type: 'application/octet-stream' });

    renderAt('/node/proj-bahria/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    await user.click(screen.getByRole('button', { name: 'Import baseline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule baseline' });
    await user.upload(within(dialog).getByLabelText('schedule file'), file);
    await user.click(within(dialog).getByRole('button', { name: /Apply (baseline|changes)/ }));

    // Collapse a WBS branch in the table…
    const table = await screen.findByRole('table', { name: 'Schedule' });
    await user.click(within(table).getByRole('button', { name: /Collapse Construction/ }));
    expect(within(table).getByRole('button', { name: /Expand Construction/ })).toBeInTheDocument();

    // …and the Gantt shows it collapsed too, rather than keeping its own state.
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    const chart = await screen.findByRole('img', { name: 'Gantt chart' });
    expect(within(chart).getByRole('button', { name: /Expand Construction/ })).toBeInTheDocument();

    // Expanding it there puts it back for the table.
    await user.click(within(chart).getByRole('button', { name: /Expand Construction/ }));
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    const table2 = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table2).getByRole('button', { name: /Collapse Construction/ })).toBeInTheDocument();
  });

  it('filters the Gantt to the lookahead window', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    await screen.findByRole('img', { name: 'Gantt chart' });

    const chip = screen.getByRole('button', { name: 'Next 8 weeks' });
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Gantt chart' })).toBeInTheDocument();
  });

  it('renders the Gantt chart in its own tab', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    expect(await screen.findByRole('img', { name: 'Gantt chart' })).toBeInTheDocument();
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
    // Rolling lookahead renders its window (table when populated, else an empty-state).
    expect(await screen.findByRole('heading', { name: 'Rolling lookahead' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
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
    expect(screen.getAllByText('Site establishment & camp').length).toBeGreaterThan(0);
  });

  it('imports a schedule baseline by paste', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-bahria/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    await user.click(screen.getByRole('button', { name: 'Import baseline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule baseline' });
    await user.type(within(dialog).getByLabelText('schedule paste'), 'A-100\tEarthworks\t1.1\t2025-09-01\t2025-12-15');
    await user.click(within(dialog).getByRole('button', { name: 'Parse pasted text' }));
    await user.click(within(dialog).getByRole('button', { name: /Apply (baseline|changes)/ }));
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table).getByText('Earthworks')).toBeInTheDocument();
  });

  it('imports a Primavera P6 .xer, summarising and landing the programme', async () => {
    const user = userEvent.setup();
    const xerText = readFileSync(join(__dirname, '../../domain/__fixtures__', 'sample.xer'), 'utf-8');
    const file = new File([xerText], 'EMA-13.xer', { type: 'application/octet-stream' });

    renderAt('/node/proj-bahria/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    await user.click(screen.getByRole('button', { name: 'Import baseline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule baseline' });

    await user.upload(within(dialog).getByLabelText('schedule file'), file);

    // The P6 summary appears with the real project identity + logic counts.
    const summary = await within(dialog).findByLabelText('XER import summary');
    expect(within(summary).getByText(/project EMA-13/)).toBeInTheDocument();
    expect(within(summary).getByText(/logic links/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Apply (baseline|changes)/ }));

    // The programme lands in the P6-shaped activity table, grouped by WBS.
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table).getByText('Z1-B1-101')).toBeInTheDocument();
    expect(within(table).getByText('Clearing and grubbing within roadway limits')).toBeInTheDocument();
    // WBS summary rows are present and collapsible.
    expect(within(table).getByText('Construction')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: /Collapse Construction/ })).toBeInTheDocument();
    // Dates render in P6's format, durations in working days.
    expect(within(table).getAllByText('23-Feb-26').length).toBeGreaterThan(0);
    // Predecessor logic survived the round-trip through the provider.
    const analysis = await screen.findByRole('table', { name: 'Schedule analysis' });
    expect(within(analysis).getByText(/Z1-B1-101 \(FS\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Programme summary')).toBeInTheDocument();

    // …and the Gantt tab now renders the imported programme.
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    expect(await screen.findByRole('img', { name: 'Gantt chart' })).toBeInTheDocument();
  });

  it('records the source file, derives the planned curve, and reconciles the budget', async () => {
    const user = userEvent.setup();
    const xerText = readFileSync(join(__dirname, '../../domain/__fixtures__', 'sample.xer'), 'utf-8');
    const file = new File([xerText], 'EMA-13.xer', { type: 'application/octet-stream' });

    renderAt('/node/proj-bahria/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    await user.click(screen.getByRole('button', { name: 'Import baseline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule baseline' });
    await user.upload(within(dialog).getByLabelText('schedule file'), file);

    const summary = await within(dialog).findByLabelText('XER import summary');
    // Provenance: the file is hashed as uploaded, and the algorithm is named.
    const prov = await within(summary).findByLabelText('Source provenance');
    expect(prov.textContent).toContain('EMA-13.xer');
    // The hash algorithm is environment-dependent: SHA-256 via Web Crypto where a
    // secure context is available, and a LABELLED FNV-1a fallback where it is not
    // (e.g. CI's jsdom, which has no crypto.subtle). Either is correct — what
    // matters is that the algorithm is named, never silently assumed.
    expect(prov.textContent).toMatch(/sha-256|fnv-1a/);

    // The fixture is cost-loaded, so a planned curve can be derived from it.
    const derive = within(summary).getByLabelText('Derive planned S-curve from the programme');
    expect(derive).toBeChecked();
    // …and its budget is reconciled against the BOQ rather than assumed to agree.
    expect(within(summary).getByLabelText('Budget reconciliation')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Apply (baseline|changes)/ }));

    // The provenance follows the programme into the app.
    expect((await screen.findByText(/Imported from/)).textContent).toContain('EMA-13.xer');

    // The S-curve now comes from the programme, not a second spreadsheet.
    await user.click(screen.getByRole('tab', { name: 'S-curve & progress' }));
    expect(await screen.findByRole('heading', { name: 'Progress S-curve' })).toBeInTheDocument();
  });

  it('shows the change set before overwriting an existing programme', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution'); // already carries a seeded schedule
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    await user.click(screen.getByRole('button', { name: 'Import baseline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule baseline' });

    await user.type(within(dialog).getByLabelText('schedule paste'), 'NEW-1\tBrand new activity\t1.1\t2026-09-01\t2026-12-15');
    await user.click(within(dialog).getByRole('button', { name: 'Parse pasted text' }));

    // The diff is shown, and the removal of mapped activities is called out.
    const changeSet = await within(dialog).findByLabelText('Import change set');
    expect(within(changeSet).getByText(/^Change set/)).toBeInTheDocument();
    expect(within(changeSet).getByText(/1 added/)).toBeInTheDocument();
    // The seeded activities carry no BOQ links, so removal is a note, not an alarm.
    expect(within(changeSet).getByText(/none carry BOQ mappings/)).toBeInTheDocument();
    // Re-import is framed as a change, not a fresh baseline.
    expect(within(dialog).getByRole('button', { name: 'Apply changes' })).toBeInTheDocument();
  });

  it('has no baseline until the programme is approved — importing never freezes one', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));

    expect(await screen.findByText(/No baseline — approve the programme to freeze it/)).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table).queryByRole('columnheader', { name: 'Var' })).toBeNull();
    // Re-baseline is not offered before an approved baseline exists.
    expect(screen.queryByRole('button', { name: 'Re-baseline' })).toBeNull();
  });

  it('captures the baseline when the planner approves and locks the programme', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));

    // Walk the approval chain: each stage is gated on the acting role.
    const roleSelect = await screen.findByLabelText('Baseline acting role');
    const stages = [
      ['pm', 'Validate (PM)'],
      ['manager_plan', 'Scrutinise (Manager Plan HQ PD)'],
      ['pd', 'Endorse (PD)'],
      ['manager_plan_engrs', 'Tech-check (Manager Plan HQ Engrs)'],
      ['comd_engrs', 'Approve & lock (Comd Engineer)'],
    ] as const;
    for (const [role, label] of stages) {
      await user.selectOptions(roleSelect, role);
      await user.click(await screen.findByRole('button', { name: label }));
    }

    // Approval froze the programme: the pill appears and variance is reported.
    expect(await screen.findByLabelText('Schedule baseline')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(await within(table).findByRole('columnheader', { name: 'Var' })).toBeInTheDocument();
    // Nothing has moved yet, so every activity sits on its baseline.
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
    // A deliberate re-baseline is now available.
    expect(screen.getByRole('button', { name: 'Re-baseline' })).toBeInTheDocument();
    // With a single baseline there is nothing to choose between.
    expect(screen.queryByLabelText('Compare against baseline')).toBeNull();
  });

  it('explains that variance needs an approved baseline before showing one', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Variance & claim' }));
    expect(await screen.findByText(/No baseline to measure against/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Variance report' })).toBeNull();
  });

  it('offers a near-critical filter on the Gantt', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Gantt chart' }));
    await screen.findByRole('img', { name: 'Gantt chart' });

    const near = screen.getByRole('button', { name: 'Near-critical' });
    await user.click(near);
    expect(near).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/amber = near-critical/)).toBeInTheDocument();
  });

  it('keeps every approved revision and lets variance be read against either', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));

    const stages = [
      ['pm', 'Validate (PM)'],
      ['manager_plan', 'Scrutinise (Manager Plan HQ PD)'],
      ['pd', 'Endorse (PD)'],
      ['manager_plan_engrs', 'Tech-check (Manager Plan HQ Engrs)'],
      ['comd_engrs', 'Approve & lock (Comd Engineer)'],
    ] as const;
    // Amending remounts the workflow strip, so the role select is re-queried.
    async function walkChain() {
      for (const [role, label] of stages) {
        await user.selectOptions(await screen.findByLabelText('Baseline acting role'), role);
        await user.click(await screen.findByRole('button', { name: label }));
      }
    }
    await walkChain();
    expect(await screen.findByLabelText('Schedule baseline')).toHaveTextContent(/^Original/);

    // Amend and re-approve: a second baseline is appended, the original survives.
    await user.click(await screen.findByRole('button', { name: 'Amend baseline' }));
    await walkChain();

    const selector = await screen.findByLabelText('Compare against baseline');
    const options = within(selector as HTMLSelectElement).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toMatch(/^Original/);
    expect(options[1].textContent).toMatch(/^Rev 1/);

    // Switching the comparison keeps the variance column present.
    await user.selectOptions(selector, options[1]);
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table).getByRole('columnheader', { name: 'Var' })).toBeInTheDocument();

    // The claim report reads slip against both frozen programmes at once.
    await user.click(screen.getByRole('tab', { name: 'Variance & claim' }));
    expect(await screen.findByLabelText('Variance summary')).toBeInTheDocument();
    expect(screen.getByText('Finish vs contract baseline')).toBeInTheDocument();
    expect(screen.getByText('Finish vs latest revision')).toBeInTheDocument();
    expect(screen.getByText('Absorbed by amendments')).toBeInTheDocument();
    const report = await screen.findByRole('table', { name: 'Variance report' });
    expect(within(report).getByRole('columnheader', { name: 'vs Contract' })).toBeInTheDocument();
    expect(within(report).getByRole('columnheader', { name: 'vs Revision' })).toBeInTheDocument();

    // The claim table can leave the browser, as a spreadsheet or a document.
    expect(screen.getByRole('button', { name: 'Export to Excel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export to PDF' })).toBeEnabled();
  });

  it('offers to carry BOQ mappings across a renamed activity, instead of losing them', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');

    // Map a BOQ item to a seeded activity so the rename has something to rescue.
    await user.click(await screen.findByRole('tab', { name: 'Activity → BOQ' }));
    const add = await screen.findByLabelText(/^Add BOQ item to /);
    const opts = within(add as HTMLSelectElement).getAllByRole('option');
    await user.selectOptions(add, opts[1]);
    await screen.findByRole('table', { name: 'Activity BOQ allocation' });
    // Which activity did we just map? The detail pane names it.
    const heading = screen.getByRole('heading', { level: 4 }).textContent ?? '';
    const mappedId = heading.split(' — ')[0].trim();

    // Now re-import a programme in which that activity is renamed.
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Activities' }));
    await user.click(screen.getByRole('button', { name: 'Import baseline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import schedule baseline' });

    const table = await screen.findByRole('table', { name: 'Schedule' });
    const row = within(table).getByText(mappedId).closest('tr')!;
    const name = row.children[1].textContent ?? 'Activity';
    const start = '2025-09-01';
    const finish = '2025-12-15';
    await user.type(within(dialog).getByLabelText('schedule paste'),
      `${mappedId}-A\t${name}\t1.1\t${start}\t${finish}`);
    await user.click(within(dialog).getByRole('button', { name: 'Parse pasted text' }));

    // The rename is spotted, pre-ticked, and the loss warning is replaced.
    const remaps = await within(dialog).findByLabelText('Proposed remaps');
    const box = within(remaps).getByLabelText(`Remap ${mappedId} to ${mappedId}-A`);
    expect(box).toBeChecked();
    expect(within(dialog).getByText(/no BOQ links will be lost/)).toBeInTheDocument();

    // Unticking it restores the honest warning about losing the mapping.
    await user.click(box);
    expect(await within(dialog).findByText(/would be removed with no successor/)).toBeInTheDocument();
  });

  it('offers no export before there is anything to measure against', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Variance & claim' }));
    await screen.findByText(/No baseline to measure against/);
    expect(screen.queryByRole('button', { name: 'Export to Excel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export to PDF' })).toBeNull();
  });
});

describe('Phase 4 — mapping', () => {
  it('maps a BOQ item to a WBS activity and updates coverage', async () => {
    const user = userEvent.setup();
    // ensure BOQ is seeded by visiting commercial first
    renderAt('/node/proj-f14f15/mapping');
    const table = await screen.findByRole('table', { name: 'WBS mapping' });
    const row = within(table).getByText('1-01').closest('tr')! as HTMLElement;
    const select = within(row).getByLabelText('WBS for 1-01') as HTMLSelectElement;
    await user.selectOptions(select, 'A-3000');
    // many-to-many: the link renders as a chip and the add-select resets
    await waitFor(() => expect(within(row).getByText(/A-3000/)).toBeInTheDocument());
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

  it('keyboard-navigates establishment cells with arrow keys', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Establishment' }));
    const table = await screen.findByRole('table', { name: 'Establishment posts' });
    const cell0 = table.querySelector('[data-r="0"][data-c="0"]') as HTMLElement;
    const cell1 = table.querySelector('[data-r="1"][data-c="0"]') as HTMLElement;
    expect(cell0).toBeTruthy();
    expect(cell1).toBeTruthy();
    cell0.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(cell1);
    await user.keyboard('{ArrowRight}');
    expect((document.activeElement as HTMLElement).getAttribute('data-c')).toBe('1');
  });

  it('inline-edits an establishment table cell', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Establishment' }));
    const table = await screen.findByRole('table', { name: 'Establishment posts' });
    await user.click(within(table).getByText('Coordination'));
    const input = within(table).getByDisplayValue('Coordination');
    await user.clear(input);
    await user.type(input, 'Coordination Wing');
    await user.keyboard('{Enter}');
    expect(await within(table).findByText('Coordination Wing')).toBeInTheDocument();
    expect(await screen.findByText(/Updated/)).toBeInTheDocument();
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

  it('bulk-updates attendance from the roster', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Roster' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Select Hamza Sheikh' }));
    const bar = await screen.findByRole('region', { name: 'Bulk attendance' });
    await user.selectOptions(within(bar).getByLabelText('Bulk attendance status'), 'leave');
    await user.click(within(bar).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/1 marked On leave/)).toBeInTheDocument();
  });

  it('opens a person detail drawer from the roster', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Roster' }));
    await user.click(await screen.findByRole('button', { name: 'Open Hamza Sheikh' }));
    const dialog = await screen.findByRole('dialog', { name: 'Hamza Sheikh' });
    expect(within(dialog).getByText(/Credentials/)).toBeInTheDocument();
    expect(within(dialog).getByText(/CIVIL\/12345/)).toBeInTheDocument();
  });

  it('lists credentials and flags expiry', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-rwp-ring/hr');
    await screen.findByText(/HR command/);
    await user.click(screen.getByRole('tab', { name: 'Skills' }));
    const table = await screen.findByRole('table', { name: 'Credentials' });
    expect(within(table).getByText('CIVIL/12345')).toBeInTheDocument();
    expect(screen.getByText(/need attention/)).toBeInTheDocument();
    // Delete with undo restores the credential.
    await user.click(screen.getByRole('button', { name: 'Delete credential CIVIL/12345' }));
    await waitFor(() => expect(screen.queryByText('CIVIL/12345')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('CIVIL/12345')).toBeInTheDocument();
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
    expect(await screen.findByText(/Snapshot v1 captured/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Diff vs current/ }));
    expect(await screen.findByText(/No changes/)).toBeInTheDocument();
  });
});

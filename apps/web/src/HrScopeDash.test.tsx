import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { hrCostRollup, nodeOwnHrMonthly, unitMonthly } from './domain/hrrollup';
import { nodeInScope } from './domain/access';
import { DEFAULT_DASH_PREFS, setDashPrefs } from './state/dashPrefs';
import type { HrUnit, OrgNode } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

const nodes: OrgNode[] = [
  { id: 'hq', name: 'HQ', type: 'hq', parentId: null },
  { id: 'engrs', name: 'Engrs', type: 'hq_engrs', parentId: 'hq' },
  { id: 'pd1', name: 'PD1', type: 'pd_hq', parentId: 'engrs' },
  { id: 'p1', name: 'P1', type: 'project', parentId: 'pd1' },
];
const unit = (nodeId: string, held: number): HrUnit =>
  ({ id: `${nodeId}-u${held}`, nodeId, parentId: null, title: 't', scale: 'NLC-10', auth: held, held, order: 0 });

describe('four-level HR cost roll-up (req 3d(2))', () => {
  it('project=own; PD and Engrs include own; top HQ excludes its own HR', () => {
    // NLC-10 band = 85,000/seat
    const units = [unit('hq', 4), unit('engrs', 3), unit('pd1', 2), unit('p1', 1)];
    expect(unitMonthly(units[3])).toBe(85_000);
    const roll = hrCostRollup(nodes, units);
    expect(roll.get('p1')!.total).toBe(85_000);                    // own only
    expect(roll.get('pd1')!.total).toBe(2 * 85_000 + 85_000);      // own + project
    expect(roll.get('engrs')!.total).toBe(3 * 85_000 + roll.get('pd1')!.total); // own + below
    // top HQ: children only — its own 4 seats are shown but excluded
    expect(roll.get('hq')!.own).toBe(4 * 85_000);
    expect(roll.get('hq')!.total).toBe(roll.get('engrs')!.total);
  });

  it('books project manpower automatically into overheads', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    // proj-rwp-ring carries a seeded establishment (~96 held seats)
    renderAt('/node/proj-rwp-ring/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Overheads' }));
    const post = await screen.findByLabelText('HR manpower posting');
    expect(post.textContent).toMatch(/booked automatically/);
    expect(post.textContent).toMatch(/no re-entry/);
  });

  it('sums a node\'s own establishment', () => {
    expect(nodeOwnHrMonthly([unit('p1', 2), unit('pd1', 1)], 'p1')).toBe(170_000);
  });
});

describe('organisational scoping (req 3j(3))', () => {
  it('scope covers the node and its descendants only', () => {
    expect(nodeInScope(nodes, 'pd1', 'p1')).toBe(true);
    expect(nodeInScope(nodes, 'pd1', 'pd1')).toBe(true);
    expect(nodeInScope(nodes, 'pd1', 'engrs')).toBe(false);
    expect(nodeInScope(nodes, 'hq', 'p1')).toBe(true);   // HQ sees the roll-up
    expect(nodeInScope(nodes, null, 'p1')).toBe(true);   // unscoped dev mode
  });

  it('signing in as a PD blocks nodes outside the scope', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    // sign in as Project Director — North (scope pd-north)
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'Project Director — North');
    const notice = await screen.findByRole('alert', { name: 'Out of scope' });
    expect(within(notice).getByText(/Outside your scope/)).toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'Go to my dashboard' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Breakdown' })).toBeInTheDocument());
  });
});

describe('configurable dashboard (req 3g(4))', () => {
  beforeEach(() => localStorage.clear());

  it('hiding a metric removes its column for the current role only', async () => {
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    const table = await screen.findByRole('table', { name: 'Breakdown' });
    expect(within(table).getByText('Billed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Customize dashboard' }));
    const dialog = await screen.findByRole('dialog', { name: 'Dashboard metrics' });
    await user.click(within(dialog).getByLabelText(/Billed/));
    await waitFor(() => {
      const t = screen.getByRole('table', { name: 'Breakdown' });
      expect(within(t).queryByText('Billed')).not.toBeInTheDocument();
    });
    // prefs are per role: another role's defaults are untouched
    setDashPrefs('fm', DEFAULT_DASH_PREFS);
    expect(JSON.parse(localStorage.getItem('nlc-ecc.ui.dashprefs.fm')!).billed).toBe(true);
  });
});

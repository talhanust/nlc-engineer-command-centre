import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function openSections() {
  renderAt('/node/hq-nlc');
  await screen.findByRole('table', { name: 'Breakdown' });
  // the staff-sections card is collapsible; find the section selector
  return screen.findByRole('group', { name: 'Section selector' });
}

describe('staff-section dashboards — Recovery & HR', () => {
  beforeEach(() => localStorage.clear());

  it('offers Recovery Sec and HR Sec alongside the original five', async () => {
    const selector = await openSections();
    for (const label of ['Monitoring Sec', 'Planning Sec', 'Procurement Sec', 'Finance Sec', 'Contracts Sec', 'Recovery Sec', 'HR Sec']) {
      expect(within(selector).getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('Recovery Sec lists physically-completed projects with receivable/DLP columns', async () => {
    const user = userEvent.setup();
    const selector = await openSections();
    await user.click(within(selector).getByRole('button', { name: 'Recovery Sec' }));
    const table = await screen.findByRole('table', { name: 'recovery section' });
    // Attock Bypass is physically completed in seed
    await waitFor(() => expect(within(table).getByText('Attock Bypass')).toBeInTheDocument());
    expect(within(table).getByText('Collected')).toBeInTheDocument();
    expect(within(table).getByText('DLP defects')).toBeInTheDocument();
  });

  it('HR Sec shows authorisation status per project', async () => {
    const user = userEvent.setup();
    const selector = await openSections();
    await user.click(within(selector).getByRole('button', { name: 'HR Sec' }));
    const table = await screen.findByRole('table', { name: 'hr section' });
    expect(within(table).getByText('HR status')).toBeInTheDocument();
    expect(within(table).getByText('Key appts')).toBeInTheDocument();
  });

  it('the Alarms-only filter narrows to projects with alarms', async () => {
    const user = userEvent.setup();
    const selector = await openSections();
    await user.click(within(selector).getByRole('button', { name: 'Monitoring Sec' }));
    const table = await screen.findByRole('table', { name: 'monitoring section' });
    const before = within(table).getAllByRole('row').filter((r) => r.classList.contains('row-link')).length;
    const toggle = screen.getByLabelText('Alarms only');
    await user.click(toggle);
    await waitFor(() => {
      const tbl = screen.getByRole('table', { name: 'monitoring section' });
      const rows = within(tbl).getAllByRole('row').filter((r) => r.classList.contains('row-link'));
      expect(rows.length).toBeLessThanOrEqual(before);
      for (const r of rows) expect(r.classList.contains('row-flag')).toBe(true);
    });
  });
});

describe('per-section map pane', () => {
  it('toggles from table to map and plots the section projects', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const selector = await openSections();
    await user.click(within(selector).getByRole('button', { name: 'Monitoring Sec' }));
    await screen.findByRole('table', { name: 'monitoring section' });
    // switch to the map view
    const viewGroup = screen.getByRole('group', { name: 'Section view' });
    await user.click(within(viewGroup).getByRole('button', { name: 'Map' }));
    // the section map renders (MapView exposes an aria-labelled region)
    await waitFor(() => expect(screen.getByLabelText(/Monitoring Sec map/)).toBeInTheDocument());
    // and the table is gone
    expect(screen.queryByRole('table', { name: 'monitoring section' })).not.toBeInTheDocument();
  });
});

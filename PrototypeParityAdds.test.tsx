import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('procurement dashboard (prototype parity)', () => {
  beforeEach(() => localStorage.clear());

  it('shows the pipeline KPIs and drills into a sub-tab on click', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/procurement');
    const kpis = await screen.findByLabelText('Procurement KPIs');
    expect(within(kpis).getByText('Committed (POs)')).toBeInTheDocument();
    expect(within(kpis).getByText('Material to recover')).toBeInTheDocument();
    expect(within(kpis).getByText('Lead times at risk')).toBeInTheDocument();
    await user.click(within(kpis).getByText('Material to recover'));
    expect(await screen.findByRole('table', { name: 'Material issues' })).toBeInTheDocument();
  });

  it('shows pending-count badges on the sub-tabs', async () => {
    renderAt('/node/proj-f14f15/procurement');
    await screen.findByLabelText('Procurement KPIs');
    const inboxTab = screen.getByRole('tab', { name: /Approval inbox/ });
    await waitFor(() => expect(within(inboxTab).getByLabelText(/pending/)).toBeInTheDocument());
  });
});

describe('material issues register (prototype parity)', () => {
  beforeEach(() => localStorage.clear());

  it('records an issue against a contractor and shows its recovery balance', async () => {
    const { LocalDataProvider } = await import('./data/LocalDataProvider');
    const seedP = new LocalDataProvider();
    await seedP.listNodes();
    await seedP.addSubcontractor('proj-f14f15', { name: 'Issue Receiver Co', trade: 'Civil' });
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/procurement');
    await screen.findByLabelText('Procurement KPIs');
    await user.click(screen.getByRole('tab', { name: 'Material issues' }));
    await screen.findByRole('table', { name: 'Material issues' });
    await user.type(screen.getByLabelText('Issue material code'), 'CEM');
    await user.type(screen.getByLabelText('Issue qty'), '100');
    await user.type(screen.getByLabelText('Issue rate'), '1000');
    const contractor = screen.getByLabelText('Issue contractor') as HTMLSelectElement;
    await user.selectOptions(contractor, contractor.options[1].value); // first contractor
    await user.click(screen.getByRole('button', { name: 'Issue material' }));
    const table = await screen.findByRole('table', { name: 'Material issues' });
    await waitFor(() => expect(within(table).getAllByText('CEM').length).toBeGreaterThan(0));
    expect(screen.getByRole('table', { name: 'Material recovery by contractor' })).toBeInTheDocument();
  });
});

describe('mapping smart filtering (prototype parity)', () => {
  beforeEach(() => localStorage.clear());

  it('filters by search text, bill and status pills', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');
    const table = await screen.findByRole('table', { name: 'WBS mapping' });
    const before = within(table).getAllByRole('row').length;
    await user.type(screen.getByLabelText('Search BOQ items'), 'grubbing');
    await waitFor(() => {
      const t = screen.getByRole('table', { name: 'WBS mapping' });
      expect(within(t).getAllByRole('row').length).toBeLessThan(before);
      expect(within(t).getByText(/grubbing/i)).toBeInTheDocument();
    });
    await user.clear(screen.getByLabelText('Search BOQ items'));
    await user.click(screen.getByRole('button', { name: 'Show unmapped' }));
    await waitFor(() => expect(screen.getByText(/of \d+ items/)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Filter by bill'), 'all');
  });
});

describe('financial planned vs actual (prototype parity)', () => {
  beforeEach(() => localStorage.clear());

  it('shows monthly planned/actual/variance with cumulative', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/financial');
    await user.click(await screen.findByRole('tab', { name: 'Planned vs Actual' }));
    const table = await screen.findByRole('table', { name: 'Planned vs actual' });
    expect(within(table).getByText('Planned')).toBeInTheDocument();
    expect(within(table).getByText('Cum. variance')).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(6); // 12 timeline months + header
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { machineryRecovery, usageValue } from './domain/machineryRecovery';
import { contractCoverage } from './domain/allocations';
import type { MachineryUsage, BoqItem } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('machinery recovery domain', () => {
  it('aggregates usage value − recovered per contractor', () => {
    const usage: MachineryUsage[] = [
      { id: 'm1', projectId: 'p', dated: '2026-01-01', machineryCode: 'EXC', description: '', hours: 100, rate: 5000, contractorId: 'c1', recovered: 200000 },
      { id: 'm2', projectId: 'p', dated: '2026-02-01', machineryCode: 'RLR', description: '', hours: 50, rate: 4000, contractorId: 'c1' },
    ];
    expect(usageValue(usage[0])).toBe(500000);
    const rows = machineryRecovery(usage);
    expect(rows).toHaveLength(1);
    expect(rows[0].usageValue).toBe(700000);
    expect(rows[0].recovered).toBe(200000);
    expect(rows[0].balance).toBe(500000);
  });
});

describe('contract coverage domain', () => {
  const items: BoqItem[] = [
    { id: 'a', projectId: 'p', billNo: '1', billName: 'Road', section: 'x', code: '1-01', description: 'a', unit: 'C', qty: 100, rate: 10, amount: 1000 },
    { id: 'b', projectId: 'p', billNo: '2', billName: 'Culvert', section: 'x', code: '2-01', description: 'b', unit: 'C', qty: 50, rate: 20, amount: 1000 },
  ];
  it('computes scope vs allocated and unawarded per contract', () => {
    const cov = contractCoverage(
      [{ id: 'k1', contractNo: 'NLC/1', subcontractorId: 's1', scopeBills: ['1'] }],
      items,
      [{ id: 'al1', projectId: 'p', boqItemId: 'a', executionType: 'sublet', contractorId: 's1', qty: 40, rate: 9 }],
    );
    expect(cov[0].scopeValue).toBe(1000);       // bill 1 only
    expect(cov[0].allocatedValue).toBe(400);    // 40 × BOQ rate 10
    expect(cov[0].unawarded).toBe(600);
    expect(Math.round(cov[0].pct * 100)).toBe(40);
  });
});

describe('planner views', () => {
  beforeEach(() => localStorage.clear());
  it('shows the per-contract scope coverage panel', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Distribution planner' }));
    const cov = await screen.findByRole('table', { name: 'Contract scope coverage' });
    expect(within(cov).getByText('Scope value')).toBeInTheDocument();
    expect(within(cov).getByText('Unawarded')).toBeInTheDocument();
  });
});

describe('machinery procurement register', () => {
  beforeEach(() => localStorage.clear());
  it('lists seeded machinery hire with recovery balances', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/procurement');
    await user.click(await screen.findByRole('tab', { name: 'Machinery hire' }));
    const table = await screen.findByRole('table', { name: 'Machinery usage' });
    expect(within(table).getAllByText(/EXC-320|RLR-12T/).length).toBeGreaterThan(0);
    expect(screen.getByRole('table', { name: 'Machinery recovery by contractor' })).toBeInTheDocument();
  });
});

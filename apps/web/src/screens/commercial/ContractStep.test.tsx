import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect } from 'vitest';
import App from '../../App';
import { LocalDataProvider } from '../../data/LocalDataProvider';

const renderAt = (p: string) => render(<MemoryRouter initialEntries={[p]}><App /></MemoryRouter>);

async function seedTwoContracts() {
  const p = new LocalDataProvider();
  await p.listNodes();
  const boq = await p.listBoq('proj-f14f15');
  await p.createSubletContract('proj-f14f15', {
    title: 'Package A', kind: 'sublet', subcontractor: { name: 'Alpha Co', trade: 'Civil', pecCategory: 'C-3' },
    lines: [{ boqItemId: boq[0].id, qty: 100, rate: Math.round(boq[0].rate * 0.88) }],
  });
  await p.createSubletContract('proj-f14f15', {
    title: 'Package B', kind: 'sublet', subcontractor: { name: 'Beta Co', trade: 'Civil', pecCategory: 'C-3' },
    lines: [{ boqItemId: boq[1].id, qty: 50, rate: Math.round(boq[1].rate * 0.88) }],
  });
}

describe('Stepping through contracts in the drawer', () => {
  beforeEach(() => localStorage.clear());

  it('opens one contract and steps to the next without closing', async () => {
    const user = userEvent.setup();
    await seedTwoContracts();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Contracts' }));
    const table = await screen.findByRole('table', { name: 'Contracts register' });

    // Open the first contract's detail.
    const firstView = within(table).getAllByRole('button', { name: /^View / })[0];
    const firstNo = firstView.getAttribute('aria-label')!.replace('View ', '');
    await user.click(firstView);
    const dialog = await screen.findByRole('dialog', { name: firstNo });

    // A position indicator and a Next control are present.
    expect(within(dialog).getByText(/\d+ \/ \d+/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Next record (J)' }));

    // The drawer now shows a DIFFERENT contract (dialog name changed), still open.
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: firstNo })).toBeNull();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('J key advances to the next contract', async () => {
    const user = userEvent.setup();
    await seedTwoContracts();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Contracts' }));
    const table = await screen.findByRole('table', { name: 'Contracts register' });
    const firstView = within(table).getAllByRole('button', { name: /^View / })[0];
    const firstNo = firstView.getAttribute('aria-label')!.replace('View ', '');
    await user.click(firstView);
    await screen.findByRole('dialog', { name: firstNo });

    await user.keyboard('j');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: firstNo })).toBeNull());
  });
});

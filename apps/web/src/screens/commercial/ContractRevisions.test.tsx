import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../../App';
import { LocalDataProvider } from '../../data/LocalDataProvider';

const renderAt = (p: string) => render(<MemoryRouter initialEntries={[p]}><App /></MemoryRouter>);

async function seedRevisedContract(): Promise<string> {
  const p = new LocalDataProvider();
  const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Rev Test', clientName: 'CDA', contractValue: '0' });
  await p.replaceBoq(proj.id, [
    { billNo: '1', code: '101', description: 'Clearing', unit: 'SM', qty: 1000, rate: 100 },
    { billNo: '1', code: '102', description: 'Grubbing', unit: 'SM', qty: 500, rate: 200 },
  ]);
  const boq = await p.listBoq(proj.id);
  const c = await p.createSubletContract(proj.id, { title: 'Pkg', kind: 'sublet', subcontractor: { name: 'WKC', trade: 'Civil' }, lines: [{ boqItemId: boq[0].id, qty: 1000, rate: 88 }] });
  await p.updateContractLines(proj.id, c.id, [{ boqItemId: boq[0].id, qty: 1000, rate: 88 }, { boqItemId: boq[1].id, qty: 500, rate: 176 }], 'pm', 'Added grubbing');
  return proj.id;
}

describe('Contract revisions in the detail drawer', () => {
  beforeEach(() => localStorage.clear());

  it('shows a Revisions tab listing R0 and R1 with the reason', async () => {
    const user = userEvent.setup();
    const id = await seedRevisedContract();
    renderAt(`/node/${id}/commercial?sub=contracts`);

    const table = await screen.findByRole('table', { name: 'Contracts register' });
    await user.click(within(table).getAllByRole('button', { name: /^View / })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('tab', { name: /Revisions/ }));
    const revTable = await screen.findByRole('table', { name: 'Contract revisions' });
    expect(within(revTable).getByText('R0')).toBeInTheDocument();
    expect(within(revTable).getByText('R1')).toBeInTheDocument();
    expect(within(revTable).getByText('Added grubbing')).toBeInTheDocument();
  });
});

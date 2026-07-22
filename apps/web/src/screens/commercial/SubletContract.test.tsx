import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect } from 'vitest';
import App from '../../App';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
beforeEach(() => localStorage.clear());

async function openNewSublet(user: ReturnType<typeof userEvent.setup>) {
  renderAt('/node/proj-f14f15/commercial');
  await screen.findByRole('tab', { name: 'New sublet contract' });
  await user.click(screen.getByRole('tab', { name: 'New sublet contract' }));
  return screen.findByRole('heading', { name: 'New sublet / labor contract' });
}

describe('Sublet contract creation', () => {
  it('creates a contract from a hand-entered BOQ and locks the quantity in the planner', async () => {
    const user = userEvent.setup();
    await openNewSublet(user);

    // New contractor + title.
    await user.type(screen.getByLabelText('Contractor name'), 'Frontier Works Ltd');
    await user.type(screen.getByLabelText('Trade'), 'Earthworks');
    await user.type(screen.getByLabelText('Contract title'), 'Earthworks — Zone 1');

    // Add one BOQ line.
    await user.click(screen.getByRole('button', { name: '+ add line' }));
    const table = await screen.findByRole('table', { name: 'Contract BOQ' });
    const itemSelect = within(table).getByLabelText('Item 0') as HTMLSelectElement;
    const opt = within(itemSelect).getAllByRole('option')[1];
    await user.selectOptions(itemSelect, opt);
    const itemCode = (opt.textContent ?? '').split(' — ')[0];

    // A modest quantity every seeded BOQ item comfortably holds.
    const qty = 100;
    await user.type(within(table).getByLabelText('Qty 0'), String(qty));

    await user.click(screen.getByRole('button', { name: /Create contract/ }));

    // Lands on the contracts register with the new contract.
    await screen.findByRole('table', { name: 'Contracts register' });
    expect(screen.getByText('Earthworks — Zone 1')).toBeInTheDocument();

    // The planner shows that quantity locked, and the remainder unallocated.
    await user.click(screen.getByRole('tab', { name: 'Distribution planner' }));
    const planner = await screen.findByRole('table', { name: 'Distribution planner' });
    const row = within(planner).getByText(itemCode).closest('tr')!;
    // Locked column carries the committed quantity (locale-formatted).
    expect(row.textContent).toContain(qty.toLocaleString('en-PK'));
  });

  it('warns when a BOQ item is over-committed across contracts, but allows it once acknowledged', async () => {
    const user = userEvent.setup();
    await openNewSublet(user);
    await user.type(screen.getByLabelText('Contractor name'), 'Over Co');
    await user.type(screen.getByLabelText('Contract title'), 'Over-commit test');
    await user.click(screen.getByRole('button', { name: '+ add line' }));
    const table = await screen.findByRole('table', { name: 'Contract BOQ' });
    const sel = within(table).getByLabelText('Item 0') as HTMLSelectElement;
    await user.selectOptions(sel, within(sel).getAllByRole('option')[1]);
    const boqQty = Number((within(table).getAllByRole('cell')[2].textContent ?? '').replace(/[^\d]/g, ''));

    // Commit more than the BOQ holds.
    await user.type(within(table).getByLabelText('Qty 0'), String(boqQty + 1000));

    const warning = await screen.findByLabelText('Overlap warning');
    expect(warning).toBeInTheDocument();
    // Blocked until acknowledged.
    expect(screen.getByRole('button', { name: /Create contract/ })).toBeDisabled();
    await user.click(screen.getByLabelText('Acknowledge overlap'));
    expect(screen.getByRole('button', { name: /Create contract/ })).toBeEnabled();
  });
});

describe('Sublet contract margin — against the original BOQ', () => {
  it('shows revenue at BOQ rates, the contract value, and the margin between them', async () => {
    const user = userEvent.setup();
    await openNewSublet(user);
    await user.type(screen.getByLabelText('Contractor name'), 'Margin Co');
    await user.type(screen.getByLabelText('Contract title'), 'Margin test');
    await user.click(screen.getByRole('button', { name: '+ add line' }));
    const table = await screen.findByRole('table', { name: 'Contract BOQ' });
    const sel = within(table).getByLabelText('Item 0') as HTMLSelectElement;
    await user.selectOptions(sel, within(sel).getAllByRole('option')[1]);

    // Rate defaults to the BOQ rate → zero margin, and that is flagged.
    await user.type(within(table).getByLabelText('Qty 0'), '100');
    const panel = await screen.findByLabelText('Contract margin');
    expect(within(panel).getByText(/priced at or above the BOQ rate/)).toBeInTheDocument();

    // Drop the sublet rate to 50% of the BOQ rate → 50% margin, warning clears.
    const boqRate = Number((within(table).getAllByRole('cell')[4].textContent ?? '0').replace(/,/g, ''));
    const rate = within(table).getByLabelText('Rate 0');
    await user.clear(rate);
    await user.type(rate, String(boqRate / 2));

    await waitFor(() => expect(within(panel).queryByText(/priced at or above the BOQ rate/)).toBeNull());
    expect(within(panel).getByText(/50\.00% of revenue/)).toBeInTheDocument();
  });
});

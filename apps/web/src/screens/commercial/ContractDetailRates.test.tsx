import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect } from 'vitest';
import App from '../../App';
import { seedCommercial } from '../../testSeed';
import { formatMoney } from '../../domain/money';

const renderAt = (p: string) => render(<MemoryRouter initialEntries={[p]}><App /></MemoryRouter>);
beforeEach(() => localStorage.clear());

async function openContract(contractNo: string) {
  const user = userEvent.setup();
  renderAt('/node/proj-f14f15/commercial');
  await screen.findByText('BOQ lifecycle');
  await user.click(screen.getByRole('tab', { name: 'Contracts' }));
  await screen.findByRole('table', { name: 'Contracts register' });
  await user.click(screen.getByRole('button', { name: `View ${contractNo}` }));
  await screen.findByRole('dialog', { name: `${contractNo} detail` });
  return user;
}

describe('Contract detail shows SUBLET rates, not client rates', () => {
  it('prices the contractor BOQ at the sublet rate and lists only the sublet lines', async () => {
    // seedCommercial awards 3 lines at 88% of the BOQ rate.
    const { contractNo, itemIds, provider } = await seedCommercial('proj-f14f15', { lines: 3 });
    const boq = await provider.listBoq('proj-f14f15');
    const first = boq.find((b) => b.id === itemIds[0])!;
    const subletRate = Math.round(first.rate * 0.88);

    await openContract(contractNo);
    const table = await screen.findByRole('table', { name: 'Contractor BOQ' });

    // Only the 3 awarded lines, not every item in the scope bills.
    expect(within(table).getAllByRole('row').length).toBe(1 + 3 + 1); // head + lines + foot

    const row = within(table).getByText(first.code).closest('tr')!;
    // The sublet rate is what prices the line…
    expect(row.textContent).toContain(subletRate.toLocaleString('en-PK'));
    // …and the client rate appears too, but only as the reference column.
    expect(row.textContent).toContain(first.rate.toLocaleString('en-PK', { maximumFractionDigits: 2 }));
  });

  it('totals the contract at sublet rates and reports the margin', async () => {
    const { contractNo, provider, contractId } = await seedCommercial('proj-f14f15', { lines: 2 });
    const contracts = await provider.listContracts('proj-f14f15');
    const boqItems = await provider.listBoq('proj-f14f15');
    const c = contracts.find((x) => x.id === contractId)!;
    const derived = (c.lines ?? []).reduce((s, l) => s + l.qty * l.rate, 0);

    await openContract(contractNo);
    const dialog = screen.getByRole('dialog', { name: `${contractNo} detail` });
    // Contract value equals the sum of the sublet lines (same formatter as the UI).
    const clientTotal = (c.lines ?? []).reduce((s, l) => {
      const it = boqItems.find((b) => b.id === l.boqItemId)!;
      return s + l.qty * it.rate;
    }, 0);
    expect(within(dialog).getByText('Contract value').parentElement!.textContent).toContain(formatMoney(derived));
    // …and is NOT the client-rate total, which is what the old view showed.
    expect(formatMoney(derived)).not.toBe(formatMoney(clientTotal));
    // Margin is reported against the client rates.
    expect(within(dialog).getByText('Revenue at client rates')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Margin').length).toBeGreaterThan(0);
  });

  it('flags a stored value that disagrees with the lines — the old-build symptom', async () => {
    const { contractNo, contractId } = await seedCommercial('proj-f14f15', { lines: 2 });
    // Simulate a contract written by the build that priced lines at the client rate.
    const key = 'nlc-ecc.contractsreg.proj-f14f15';
    const all = JSON.parse(localStorage.getItem(key)!);
    const c = all.find((x: { id: string }) => x.id === contractId);
    c.value = c.value * 1.5; // stored value no longer matches the lines
    localStorage.setItem(key, JSON.stringify(all));

    await openContract(contractNo);
    const warn = await screen.findByLabelText('Contract value mismatch');
    expect(warn.textContent).toMatch(/does not match its lines/);
  });
});

describe('Revising a draft contract BOQ instead of deleting it', () => {
  it('offers Revise BOQ on a draft and corrects the value in place', async () => {
    const { contractNo, contractId, provider, itemIds } = await seedCommercial('proj-f14f15', { lines: 2 });
    const before = (await provider.listContracts('proj-f14f15')).find((c) => c.id === contractId)!;

    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Contracts' }));
    await screen.findByRole('table', { name: 'Contracts register' });
    expect(screen.getByRole('button', { name: `Revise BOQ ${contractNo}` })).toBeInTheDocument();

    // Apply a correction through the same provider call the modal uses.
    await provider.updateContractLines('proj-f14f15', contractId, [
      { boqItemId: itemIds[0], qty: 500, rate: 10 },
    ]);
    const after = (await provider.listContracts('proj-f14f15')).find((c) => c.id === contractId)!;
    expect(after.value).toBe(5000);
    expect(after.value).not.toBe(before.value);
    expect(after.contractNo).toBe(before.contractNo); // number and history preserved
  });

  it('does not offer Revise BOQ once the contract is awarded', async () => {
    const { contractNo, contractId, provider } = await seedCommercial('proj-f14f15', { lines: 1 });
    await provider.setContractStatus('proj-f14f15', contractId, 'awarded');

    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Contracts' }));
    await screen.findByRole('table', { name: 'Contracts register' });
    await waitFor(() => expect(screen.queryByRole('button', { name: `Revise BOQ ${contractNo}` })).toBeNull());
    // And the provider refuses even if called directly.
    await expect(provider.updateContractLines('proj-f14f15', contractId, [])).rejects.toThrow(/draft/i);
  });
});

import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect } from 'vitest';
import App from '../../App';
import { seedCommercial } from '../../testSeed';

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
beforeEach(() => localStorage.clear());

async function openRegister() {
  const user = userEvent.setup();
  renderAt('/node/proj-f14f15/commercial');
  await screen.findByText('BOQ lifecycle');
  await user.click(screen.getByRole('tab', { name: 'Contracts' }));
  await screen.findByRole('table', { name: 'Contracts register' });
  return user;
}

describe('Deleting a contract from the register', () => {
  it('deletes a draft contract and releases its locked BOQ quantity', async () => {
    const { contractNo, itemIds } = await seedCommercial('proj-f14f15', { lines: 2 });
    const user = await openRegister();
    expect(screen.getByText(contractNo)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Delete ${contractNo}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete contract' });
    // The consequence is stated before the user commits.
    expect(within(dialog).getByLabelText('Deletion consequences').textContent).toMatch(/released/);
    await user.click(within(dialog).getByRole('button', { name: `Confirm delete ${contractNo}` }));

    // Gone from the register.
    await waitFor(() => expect(screen.queryByText(contractNo)).toBeNull());

    // And the quantity it held is unallocated again in the planner.
    await user.click(screen.getByRole('tab', { name: 'Distribution planner' }));
    const planner = await screen.findByRole('table', { name: 'Distribution planner' });
    const { LocalDataProvider } = await import('../../data/LocalDataProvider');
    const boq = await new LocalDataProvider().listBoq('proj-f14f15');
    const item = boq.find((b) => b.id === itemIds[0])!;
    const row = within(planner).getByText(item.code).closest('tr')!;
    // Locked column reads em-dash once nothing holds it.
    expect(row.textContent).toContain('—');
  });

  it('REFUSES to delete a contract that has a RAR billed against it', async () => {
    const { contractNo, rarNos } = await seedCommercial('proj-f14f15', { lines: 1, rarStatuses: ['submitted'] });
    const user = await openRegister();

    await user.click(screen.getByRole('button', { name: `Delete ${contractNo}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete contract' });
    const blocked = within(dialog).getByLabelText('Deletion blocked');
    expect(blocked.textContent).toContain(rarNos[0]);
    // No way to force it through — the confirm button is not offered at all.
    expect(within(dialog).queryByRole('button', { name: `Confirm delete ${contractNo}` })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(contractNo)).toBeInTheDocument(); // still there
  });

  it('warns that an awarded contract records a real commitment, but still allows it', async () => {
    const { provider, contractId, contractNo } = await seedCommercial('proj-f14f15', { lines: 1 });
    await provider.setContractStatus('proj-f14f15', contractId, 'awarded');
    const user = await openRegister();

    await user.click(screen.getByRole('button', { name: `Delete ${contractNo}` }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete contract' });
    expect(within(dialog).getByLabelText('Deletion consequences').textContent).toMatch(/awarded/);
    expect(within(dialog).getByRole('button', { name: `Confirm delete ${contractNo}` })).toBeEnabled();
  });
});

describe('the provider enforces the rule itself, not just the dialog', () => {
  it('refuses a direct delete call when a RAR is billed against the contract', async () => {
    const { provider, contractId } = await seedCommercial('proj-f14f15', { lines: 1, rarStatuses: ['paid'] });
    await expect(provider.deleteContract('proj-f14f15', contractId)).rejects.toThrow(/RAR/);
    // Still in the register.
    expect(await provider.listContracts('proj-f14f15')).toHaveLength(1);
  });

  it('records the deletion in the audit trail', async () => {
    const { provider, contractId, contractNo } = await seedCommercial('proj-f14f15', { lines: 2 });
    await provider.deleteContract('proj-f14f15', contractId);
    const audit = await provider.listAudit();
    const entry = audit.find((a) => a.action === 'delete' && a.ref === contractNo);
    expect(entry).toBeTruthy();
    expect(entry!.detail).toMatch(/released 2 BOQ line/);
  });

  it('throws a clear error for a contract that does not exist', async () => {
    const { provider } = await seedCommercial('proj-f14f15');
    await expect(provider.deleteContract('proj-f14f15', 'nope')).rejects.toThrow(/not found/i);
  });
});

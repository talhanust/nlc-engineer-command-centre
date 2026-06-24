import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('distribution planner — split across labour/sublet', () => {
  beforeEach(() => localStorage.clear());

  it('shows the contract per allocation, an unassigned remainder, and supports a partial split', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Distribution planner' }));
    const table = await screen.findByRole('table', { name: 'Distribution planner' });

    // open the first item's allocation editor
    const planBtns = within(table).getAllByRole('button', { name: /^Plan / });
    await user.click(planBtns[0]);
    const editor = await screen.findByRole('table', { name: /Allocations for/ });

    // contract column + explicit unassigned remainder are shown
    expect(within(editor).getByText('Contract')).toBeInTheDocument();
    expect(within(editor).getByText('Unassigned')).toBeInTheDocument();

    // add two allocations and split across sublet + labour on one BOQ item
    await user.click(screen.getByRole('button', { name: '+ Add allocation' }));
    await user.click(screen.getByRole('button', { name: '+ Add allocation' }));
    const editor2 = await screen.findByRole('table', { name: /Allocations for/ });
    const typeSelects = within(editor2).getAllByLabelText(/^Type /);
    expect(typeSelects.length).toBeGreaterThanOrEqual(2);
    await user.selectOptions(typeSelects[0], 'sublet');
    await user.selectOptions(typeSelects[1], 'labor');
    expect((typeSelects[0] as HTMLSelectElement).value).toBe('sublet');
    expect((typeSelects[1] as HTMLSelectElement).value).toBe('labor');
  });
});

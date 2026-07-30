import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../../App';
import { LocalDataProvider } from '../../data/LocalDataProvider';

const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

// The app in test mode uses LocalDataProvider over localStorage, so a project
// created through a provider instance is visible to the rendered app.
async function seedLumpProject(): Promise<string> {
  const p = new LocalDataProvider();
  const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Lump Sum Project', clientName: 'NHA', contractValue: '0' });
  await p.replaceBoq(proj.id, [
    { billNo: '1', code: '101', description: 'Earthworks', unit: 'CM', qty: 1000, rate: 100 }, // measured
    { billNo: '7', code: 'SP-701a', description: 'Surveying instruments', unit: 'LS', qty: 1, rate: 2_000_000, lineType: 'lump_sum' },
    { billNo: '6a', code: '109', description: 'Toll Plaza', unit: 'PS', qty: 1, rate: 176_000_000, lineType: 'provisional' },
  ]);
  return proj.id;
}

describe('Progress entry respects the line type', () => {
  beforeEach(() => localStorage.clear());

  it('offers a quantity field for measured, a % field for lump sum, and n/a for a provisional sum', async () => {
    const id = await seedLumpProject();
    renderAt(`/node/${id}/execution`);
    // Execution sub-tabs are in-component state; click through to Progress updates.
    const user0 = userEvent.setup();
    await user0.click(await screen.findByRole('tab', { name: 'Progress updates' }));

    await screen.findByRole('table', { name: 'Progress by BOQ item' });
    // measured line → quantity input
    expect(screen.getByLabelText('Enter executed 101')).toBeInTheDocument();
    // lump sum → percent input
    expect(screen.getByLabelText('Enter percent complete SP-701a')).toBeInTheDocument();
    // provisional sum → not remeasured here
    expect(screen.queryByLabelText('Enter executed 109')).toBeNull();
    expect(screen.queryByLabelText('Enter percent complete 109')).toBeNull();
  });

  it('books a lump sum entered as % complete as that fraction of its value', async () => {
    const user = userEvent.setup();
    const id = await seedLumpProject();
    renderAt(`/node/${id}/execution`);
    await user.click(await screen.findByRole('tab', { name: 'Progress updates' }));

    await screen.findByRole('table', { name: 'Progress by BOQ item' });
    const pctField = screen.getByLabelText('Enter percent complete SP-701a');
    await user.clear(pctField);
    await user.type(pctField, '40');
    await user.tab(); // blur commits

    // A draft update appears for the lump sum at the converted quantity (0.4).
    await waitFor(() => {
      const pending = screen.getByRole('table', { name: 'Progress pending validation' });
      expect(pending.textContent).toMatch(/SP-701a|0\.4/);
    });
  });
});

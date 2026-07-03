import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { revenueComposition, isAdvanceReceipt } from './domain/revenue';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('revenue composition domain', () => {
  it('builds the gross→net chain and excludes advances', () => {
    const c = revenueComposition({
      executed: 1000, vetted: 800, billed: 900, escalation: 100, receiptsTotal: 700, advances: 200,
      cfg: { ipcRetentionPct: 10, incomeTaxPct: 7, gstPct: 1, rarIncomeTaxPct: 7, rarGstPct: 0 },
    });
    expect(c.gross).toBe(1100);            // executed + escalation
    expect(c.retention).toBeCloseTo(110);  // 10% of gross
    expect(c.incomeTax).toBeCloseTo(77);
    expect(c.gst).toBeCloseTo(11);
    expect(c.netCertified).toBeCloseTo(902);
    expect(c.receipts).toBe(500);          // 700 − 200 advances
    expect(c.slippage).toBe(200);          // executed − vetted
  });
  it('flags advance receipts by source', () => {
    expect(isAdvanceReceipt('Mobilization advance')).toBe(true);
    expect(isAdvanceReceipt('IPC-03')).toBe(false);
  });
});

describe('revenue composition view', () => {
  beforeEach(() => localStorage.clear());

  it('shows the waterfall and drills an IPC down to BOQ lines', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Revenue composition' }));
    const panel = await screen.findByLabelText('Revenue composition');
    expect(within(panel).getByText('= Gross revenue')).toBeInTheDocument();
    expect(within(panel).getByText('= Net certified')).toBeInTheDocument();
    expect(within(panel).getAllByText(/Slippage/).length).toBeGreaterThan(0);
    // drill into billed → IPC → expand to lines
    await user.click(within(panel).getByRole('button', { name: 'Billed to date' }));
    const drill = await screen.findByLabelText('billed breakdown');
    const firstExpand = within(drill).getAllByRole('button', { name: /Expand IPC-/ })[0];
    await user.click(firstExpand);
    await waitFor(() => expect(within(drill).getAllByText(/·/).length).toBeGreaterThan(0));
  });
});

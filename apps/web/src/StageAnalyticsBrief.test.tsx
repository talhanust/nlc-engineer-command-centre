import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { portfolioEvm } from './domain/portfolio';
import type { Project } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
const proj = (id: string, over: Partial<Project> = {}): Project => ({
  id, pdHqId: 'pd', clientName: 'c', contractValue: '1000', billedToDate: '500', receivedToDate: '400',
  plannedPct: 60, actualPct: 50, ...over,
});

describe('stage-aware portfolio EVM', () => {
  it('scores ongoing works only — completed projects no longer flatter SPI', () => {
    const ongoingOnly = portfolioEvm([proj('a')]);
    const withCompleted = portfolioEvm([
      proj('a'),
      proj('b', { stage: 'physically_completed', plannedPct: 100, actualPct: 100 }),
      proj('c', { stage: 'financially_closed', plannedPct: 100, actualPct: 100 }),
    ]);
    expect(withCompleted.projects).toHaveLength(1);
    expect(withCompleted.spi).toBeCloseTo(ongoingOnly.spi, 5); // unchanged by staged projects
    expect(withCompleted.spi).toBeCloseTo(50 / 60, 3);
  });
});

describe('stage-aware dashboard scoring', () => {
  beforeEach(() => localStorage.clear());

  it('shows the recovery position instead of a health score after TOC', async () => {
    renderAt('/node/pd-centre');
    const table = await screen.findByRole('table', { name: 'Breakdown' });
    // Attock Bypass: billed 10.8bn, received 9.2bn → recv 85%
    const chip = await within(table).findByLabelText('Recovery Attock Bypass');
    expect(chip.textContent).toBe('recv 85%');
  });

  it('marks financially closed projects as closed', async () => {
    renderAt('/node/pd-north');
    const table = await screen.findByRole('table', { name: 'Breakdown' });
    const chip = await within(table).findByLabelText('Closed I-11 Sector Infrastructure');
    expect(chip.textContent).toBe('closed');
  });
});

describe('command brief header', () => {
  beforeEach(() => localStorage.clear());

  it('renders the print-only brief header with node and project count', async () => {
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    const head = document.querySelector('.brief-head')!;
    expect(head.textContent).toContain('MONTHLY COMMAND BRIEF — HQ NLC');
    expect(head.textContent).toMatch(/projects under command/);
    expect(screen.getByRole('button', { name: 'Print command brief' })).toBeInTheDocument();
  });
});

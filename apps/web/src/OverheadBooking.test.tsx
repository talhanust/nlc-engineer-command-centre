import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { deriveOverheadSubheads, plannedBySubhead, subheadTotal } from './domain/overheadBooking';
import type { MachineryUsage, PolRecord, OverheadLine } from './data/types';

const mu = (code: string, description: string, hours: number, rate: number): MachineryUsage =>
  ({ id: code, projectId: 'p', dated: '2026-06-01', machineryCode: code, description, hours, rate, recovered: 0 });

describe('overhead sub-head derivation (spec §6)', () => {
  it('splits vehicle vs generator running and derives maintenance + POL', () => {
    const machinery = [
      mu('VEH-PK01', 'Project pickup', 100, 300),      // 30,000 vehicle running
      mu('GEN-100', '100 kVA site generator', 200, 200), // 40,000 generator running
      mu('EXC-320', 'Excavator (works plant)', 500, 6500), // NOT overhead — works plant
    ];
    const pol: PolRecord[] = [{ id: 'pol1', projectId: 'p', month: 'Jun-26', fuel: 'diesel', procured: 1000, issued: 800, idealConsumption: 0, actualConsumption: 0 }];
    const subs = deriveOverheadSubheads(machinery, pol, { maintenancePct: 0.1 });
    const by = Object.fromEntries(subs.map((s) => [s.subhead, s.amount]));
    expect(by['Vehicle running']).toBe(30000);
    expect(by['Generator running']).toBe(40000);
    expect(by['Vehicle & plant maintenance']).toBe(7000); // (30k+40k) × 0.1
    expect(by['POL']).toBe(800 * 285);                     // diesel rate
    // works plant excavator must not appear
    expect(subheadTotal(subs)).toBe(30000 + 40000 + 7000 + 800 * 285);
  });

  it('excludes works plant entirely when there are no overhead vehicles', () => {
    const subs = deriveOverheadSubheads([mu('EXC-320', 'Excavator', 500, 6500), mu('RLR-12T', 'Roller', 260, 4200)], []);
    expect(subs).toHaveLength(0);
  });

  it('classifies planned overhead lines into sub-heads', () => {
    const lines: OverheadLine[] = [
      { id: '1', projectId: 'p', category: 'Salaries', month: 'Jun-26', plannedCost: 500000 },
      { id: '2', projectId: 'p', category: 'Light-vehicle POL', month: 'Jun-26', plannedCost: 80000 },
      { id: '3', projectId: 'p', category: 'Generator maintenance', month: 'Jun-26', plannedCost: 25000 },
      { id: '4', projectId: 'p', category: 'Camp utilities', month: 'Jun-26', plannedCost: 60000 },
    ];
    const map = plannedBySubhead(lines);
    expect(map.get('HR / establishment')).toBe(500000);
    expect(map.get('Vehicle running')).toBe(80000);
    expect(map.get('Vehicle & plant maintenance')).toBe(25000);
    expect(map.get('Camp & utilities')).toBe(60000);
  });
});

describe('overhead auto-booking UI', () => {
  it('shows the auto-booked sub-head table from seeded overhead vehicles', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    // ensure seed regenerates with the overhead vehicles
    const p = new LocalDataProvider();
    const machinery = await p.listMachineryUsage('proj-f14f15');
    expect(machinery.some((m) => m.machineryCode.startsWith('VEH') || m.machineryCode.startsWith('GEN'))).toBe(true);

    render(<MemoryRouter initialEntries={['/node/proj-f14f15/execution']}><App /></MemoryRouter>);
    await user.click(await screen.findByRole('tab', { name: 'Overheads' }));
    const card = await screen.findByLabelText('Overhead sub-head auto-booking');
    const table = within(card).getByRole('table', { name: 'Derived overhead subheads' });
    await waitFor(() => expect(within(table).getByText('Vehicle running')).toBeInTheDocument());
    expect(within(table).getByText('Generator running')).toBeInTheDocument();
  }, 30000);
});

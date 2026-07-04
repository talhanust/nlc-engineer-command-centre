import { describe, it, expect } from 'vitest';
import { portfolioEvm } from './portfolio';
import type { Project } from '../data/types';

const proj = (id: string, cv: string, planned: number, actual: number, billed: string, received: string): Project => ({
  id, pdHqId: 'pd', clientName: 'NHA', contractValue: cv, billedToDate: billed, receivedToDate: received,
  plannedPct: planned, actualPct: actual,
});

describe('portfolio earned value', () => {
  it('aggregates value-weighted performance and sorts worst-schedule first', () => {
    const r = portfolioEvm([
      proj('a', '1000', 50, 60, '500', '400'), // SPI 1.2 (ahead)
      proj('b', '2000', 80, 40, '900', '300'), // SPI 0.5 (behind)
    ]);
    expect(r.bac).toBe(3000);
    expect(r.pv).toBe(0.5 * 1000 + 0.8 * 2000);   // 2100
    expect(r.ev).toBe(0.6 * 1000 + 0.4 * 2000);   // 1400
    expect(r.spi).toBeCloseTo(1400 / 2100, 5);
    expect(r.projects[0].id).toBe('b');           // worst first
    expect(r.behind).toBe(1);
    expect(r.outstanding).toBe(1400 - 700);
  });
});

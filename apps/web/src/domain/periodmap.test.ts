import { describe, it, expect } from 'vitest';
import { parsePeriodToMonth, withAutoDefaults, coverage, financialCurve, twinSeries } from './periodmap';
import type { Ipc } from '../data/types';

function ipc(ipcNo: string, period: string, gross: number): Ipc {
  return { id: ipcNo, projectId: 'p', ipcNo, period, status: 'paid', gross, netPayable: gross, cumGross: gross } as Ipc;
}

describe('parsePeriodToMonth', () => {
  it('parses common formats to a timeline label', () => {
    expect(parsePeriodToMonth('May-2026')).toBe('May-26');
    expect(parsePeriodToMonth('Jul-26')).toBe('Jul-26');
    expect(parsePeriodToMonth('2026-05')).toBe('May-26');
    expect(parsePeriodToMonth('august 2026')).toBe('Aug-26');
  });
  it('returns null for out-of-range or empty', () => {
    expect(parsePeriodToMonth('Jan-2030')).toBeNull();
    expect(parsePeriodToMonth('')).toBeNull();
  });
});

describe('mapping coverage + auto defaults', () => {
  const ipcs = [ipc('IPC-01', 'Apr-2026', 100), ipc('IPC-02', 'weird', 50)];
  it('auto-maps parseable periods only', () => {
    const m = withAutoDefaults(ipcs, {});
    expect(m['IPC-01']).toBe('Apr-26');
    expect(m['IPC-02']).toBeUndefined();
    expect(coverage(ipcs, m)).toBe(50);
  });
});

describe('financial curve', () => {
  it('accumulates billed as % of contract by month', () => {
    const ipcs = [ipc('IPC-01', 'Apr-2026', 200), ipc('IPC-02', 'May-2026', 300)];
    const map = withAutoDefaults(ipcs, {});
    const curve = financialCurve(ipcs, map, 1000);
    const apr = curve.find((c) => c.month === 'Apr-26')!;
    const may = curve.find((c) => c.month === 'May-26')!;
    const aug = curve.find((c) => c.month === 'Aug-26')!;
    expect(apr.billedPct).toBe(20);   // 200/1000
    expect(may.billedPct).toBe(50);   // (200+300)/1000 cumulative
    expect(aug.billedPct).toBe(50);   // stays flat after last bill
  });
});

describe('twinSeries', () => {
  it('merges physical actual with financial billed by month', () => {
    const physical = [{ month: 'Apr-26', planned: 30, actual: 25 }, { month: 'May-26', planned: 40, actual: null }];
    const financial = [{ month: 'Apr-26', billedPct: 20 }, { month: 'May-26', billedPct: 50 }];
    const twin = twinSeries(physical, financial);
    expect(twin[0]).toEqual({ month: 'Apr-26', physical: 25, financial: 20 });
    expect(twin[1]).toEqual({ month: 'May-26', physical: null, financial: 50 });
  });
});

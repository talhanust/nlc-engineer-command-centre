import { describe, it, expect } from 'vitest';
import type { DayworkSheet } from '../data/types';
import { sheetTotal, sheetCategoryTotals, validatedDayworkValue, dayworkValueByItem, dayworkSummary, dayworkBilling } from './dayworks';

const sheet = (id: string, boqItemId: string, status: 'draft' | 'validated', res: Array<[DayworkSheet['resources'][0]['kind'], number, number]>): DayworkSheet => ({
  id, projectId: 'p', boqItemId, date: '2026-07-01', description: id, status,
  resources: res.map(([kind, qty, rate]) => ({ kind, description: kind, unit: 'hr', qty, rate })),
});

describe('sheet arithmetic', () => {
  it('totals a sheet across resources', () => {
    const s = sheet('d1', 'i1', 'draft', [['labour', 10, 500], ['plant', 4, 2000], ['material', 1, 3000]]);
    expect(sheetTotal(s)).toBe(10 * 500 + 4 * 2000 + 3000); // 16000
  });
  it('splits by category', () => {
    const s = sheet('d1', 'i1', 'draft', [['labour', 10, 500], ['labour', 2, 500], ['plant', 1, 1000]]);
    const c = sheetCategoryTotals(s);
    expect(c.labour).toBe(6000); expect(c.plant).toBe(1000); expect(c.material).toBe(0);
  });
});

describe('validated value per line', () => {
  const sheets: DayworkSheet[] = [
    sheet('d1', 'i1', 'validated', [['labour', 10, 500]]),  // 5000
    sheet('d2', 'i1', 'draft', [['labour', 20, 500]]),      // 10000, NOT counted
    sheet('d3', 'i1', 'validated', [['plant', 2, 1500]]),   // 3000
    sheet('d4', 'i2', 'validated', [['material', 1, 9000]]),// 9000
  ];
  it('counts only validated sheets for a line', () => {
    expect(validatedDayworkValue(sheets, 'i1')).toBe(8000); // 5000 + 3000, draft excluded
    expect(validatedDayworkValue(sheets, 'i2')).toBe(9000);
    expect(validatedDayworkValue(sheets, 'none')).toBe(0);
  });
  it('maps validated value by item', () => {
    const m = dayworkValueByItem(sheets);
    expect(m.get('i1')).toBe(8000);
    expect(m.get('i2')).toBe(9000);
  });
});

describe('project summary', () => {
  it('reports booked vs validated and category split', () => {
    const sheets: DayworkSheet[] = [
      sheet('d1', 'i1', 'validated', [['labour', 10, 500], ['plant', 2, 1500]]), // 8000 val
      sheet('d2', 'i1', 'draft', [['labour', 4, 500]]),                           // 2000 draft
    ];
    const sum = dayworkSummary(sheets);
    expect(sum.booked).toBe(10000);
    expect(sum.validated).toBe(8000);
    expect(sum.draft).toBe(2000);
    expect(sum.byCategory.labour).toBe(5000);
    expect(sum.byCategory.plant).toBe(3000);
    expect(sum.validatedCount).toBe(1);
  });
});

describe('dayworkBilling — pending dayworks for an IPC', () => {
  const sheets: DayworkSheet[] = [
    sheet('d1', 'i1', 'validated', [['labour', 10, 500]]),  // 5000 validated for i1
    sheet('d2', 'i1', 'draft', [['labour', 10, 500]]),      // draft, excluded
    sheet('d3', 'i2', 'validated', [['plant', 2, 1500]]),   // 3000 validated for i2
  ];
  it('bills validated value not yet in an IPC', () => {
    const lines = dayworkBilling(sheets, [], ['i1', 'i2']);
    expect(lines.find((l) => l.boqItemId === 'i1')!.pending).toBe(5000);
    expect(lines.find((l) => l.boqItemId === 'i2')!.pending).toBe(3000);
  });
  it('nets off what prior IPCs already billed', () => {
    const ipcs = [{ lines: [{ boqItemId: 'i1', amount: 2000 }] }];
    const lines = dayworkBilling(sheets, ipcs, ['i1', 'i2']);
    expect(lines.find((l) => l.boqItemId === 'i1')!.pending).toBe(3000); // 5000 - 2000
  });
  it('omits a line fully billed', () => {
    const ipcs = [{ lines: [{ boqItemId: 'i1', amount: 5000 }] }];
    const lines = dayworkBilling(sheets, ipcs, ['i1']);
    expect(lines.find((l) => l.boqItemId === 'i1')).toBeUndefined();
  });
});

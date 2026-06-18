import { describe, it, expect } from 'vitest';
import { buildBoqRows, groupBoq, boqTotals, filterBoqRows } from './boqrollup';
import type { BoqItem, Distribution, ProgressUpdate } from '../data/types';

const item = (over: Partial<BoqItem>): BoqItem => ({
  id: 'b1', projectId: 'p', billNo: '1', code: 'C1', description: 'd', unit: 'Cum', qty: 100, rate: 10, amount: 1000, ...over,
});

describe('boqrollup', () => {
  it('joins mode + executed and derives status/pct', () => {
    const items = [item({ id: 'a', qty: 100, rate: 10, amount: 1000 }), item({ id: 'b', qty: 50, rate: 20, amount: 1000 })];
    const dists: Distribution[] = [{ boqItemId: 'a', projectId: 'p', mode: 'self', allocatedQty: 100 }];
    const progress: ProgressUpdate[] = [
      { id: 'pr1', projectId: 'p', boqItemId: 'a', period: 'Jan', executedQty: 40, status: 'validated' },
      { id: 'pr2', projectId: 'p', boqItemId: 'a', period: 'Feb', executedQty: 10, status: 'validated' },
    ];
    const rows = buildBoqRows(items, dists, progress);
    const a = rows.find((r) => r.item.id === 'a')!;
    expect(a.mode).toBe('self');
    expect(a.executedQty).toBe(50);
    expect(a.executedValue).toBe(500);
    expect(a.pct).toBeCloseTo(0.5);
    expect(a.status).toBe('in_progress');
    const b = rows.find((r) => r.item.id === 'b')!;
    expect(b.mode).toBe('unassigned');
    expect(b.status).toBe('unassigned');
  });

  it('marks complete and not_started correctly', () => {
    const items = [item({ id: 'a', qty: 100 }), item({ id: 'b', qty: 100 })];
    const dists: Distribution[] = [
      { boqItemId: 'a', projectId: 'p', mode: 'sublet', allocatedQty: 100 },
      { boqItemId: 'b', projectId: 'p', mode: 'self', allocatedQty: 100 },
    ];
    const progress: ProgressUpdate[] = [{ id: 'p1', projectId: 'p', boqItemId: 'a', period: 'Jan', executedQty: 100, status: 'validated' }];
    const rows = buildBoqRows(items, dists, progress);
    expect(rows.find((r) => r.item.id === 'a')!.status).toBe('complete');
    expect(rows.find((r) => r.item.id === 'b')!.status).toBe('not_started');
  });

  it('groups by bill then section with subtotals and totals', () => {
    const items = [
      item({ id: 'a', billNo: '1', billName: 'Road', section: 'Earth', amount: 1000 }),
      item({ id: 'b', billNo: '1', billName: 'Road', section: 'Pave', amount: 2000 }),
      item({ id: 'c', billNo: '2', billName: 'Struct', section: 'Culvert', amount: 500 }),
    ];
    const rows = buildBoqRows(items, [], []);
    const bills = groupBoq(rows);
    expect(bills).toHaveLength(2);
    expect(bills[0].billName).toBe('Road');
    expect(bills[0].sections).toHaveLength(2);
    expect(bills[0].totals.amount).toBe(3000);
    expect(boqTotals(rows).amount).toBe(3500);
  });

  it('filters by search, bill and status', () => {
    const items = [
      item({ id: 'a', billNo: '1', description: 'Excavation', section: 'Earth' }),
      item({ id: 'b', billNo: '2', description: 'Asphalt', section: 'Pave' }),
    ];
    const dists: Distribution[] = [{ boqItemId: 'a', projectId: 'p', mode: 'self', allocatedQty: 100 }];
    const rows = buildBoqRows(items, dists, []);
    expect(filterBoqRows(rows, { search: 'asph', bill: 'all', status: 'all' })).toHaveLength(1);
    expect(filterBoqRows(rows, { search: '', bill: '2', status: 'all' })).toHaveLength(1);
    expect(filterBoqRows(rows, { search: '', bill: 'all', status: 'unassigned' }).map((r) => r.item.id)).toEqual(['b']);
  });
});

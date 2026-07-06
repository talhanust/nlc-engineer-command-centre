import { describe, it, expect } from 'vitest';
import {
  cumulativeExecuted, itemPctComplete, physicalProgressPct, executedValueToDate, pendingValidation,
} from './progress';
import type { BoqItem, ProgressUpdate } from '../data/types';

function item(id: string, qty: number, rate: number): BoqItem {
  return { id, projectId: 'p', billNo: '1', code: id, description: id, unit: 'm3', qty, rate, amount: qty * rate };
}
function upd(boqItemId: string, qty: number, status: ProgressUpdate['status']): ProgressUpdate {
  return { id: `${boqItemId}-${qty}-${status}`, projectId: 'p', boqItemId, period: 'Jun-26', executedQty: qty, status };
}

describe('progress — validated updates are the single source', () => {
  const i1 = item('I1', 100, 1000);
  const i2 = item('I2', 200, 500);
  const updates = [
    upd('I1', 30, 'validated'), upd('I1', 20, 'validated'),
    upd('I1', 40, 'draft'),   // not counted until validated
    upd('I2', 50, 'validated'),
  ];

  it('counts only validated qty in the cumulative', () => {
    expect(cumulativeExecuted(updates, 'I1')).toBe(50); // 30+20, draft 40 excluded
    expect(itemPctComplete(i1, updates)).toBe(50);
  });

  it('caps item completion at 100%', () => {
    const over = [upd('I1', 150, 'validated')];
    expect(itemPctComplete(i1, over)).toBe(100);
  });

  it('computes executed value and value-weighted physical %', () => {
    // earned = 50*1000 + 50*500 = 75,000 ; total = 100,000 + 100,000 = 200,000
    expect(executedValueToDate([i1, i2], updates)).toBe(75000);
    expect(physicalProgressPct([i1, i2], updates)).toBe(37.5);
  });

  it('lists drafts pending validation', () => {
    expect(pendingValidation(updates)).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import { revisedBoqValue, revisedBoqItems } from './domain/variations';
import type { BoqItem, Variation } from './data/types';

const item = (id: string, qty: number, rate: number): BoqItem =>
  ({ id, projectId: 'p', billNo: '1', billName: 'b', section: 's', code: id, description: id, unit: 'Cu.m', qty, rate, amount: qty * rate });

describe('revised BOQ = base BOQ + approved variations (CA = BOQ)', () => {
  const boq = [item('a', 100, 500), item('b', 50, 1000)]; // base 100,000

  it('base BOQ is unchanged when no VO is approved', () => {
    const vos: Variation[] = [
      { id: 'v1', projectId: 'p', voNo: 'VO-01', seq: 1, title: 'pending', type: 'addition', amount: 20000, status: 'submitted', date: '2026-01-01' },
    ];
    expect(revisedBoqValue(boq, vos)).toBe(100000); // submitted VO does not revise
  });

  it('an approved amount-based VO revises the BOQ value (and adds a summary line)', () => {
    const vos: Variation[] = [
      { id: 'v1', projectId: 'p', voNo: 'VO-01', seq: 1, title: 'Extra culvert', type: 'addition', amount: 25000, status: 'approved', date: '2026-01-01' },
    ];
    expect(revisedBoqValue(boq, vos)).toBe(125000);
    const items = revisedBoqItems(boq, vos);
    expect(items).toHaveLength(3); // base 2 + 1 VO summary line
    expect(items.find((i) => i.code === 'VO-01')?.amount).toBe(25000);
  });

  it('an approved line-based VO edits specific items', () => {
    const vos: Variation[] = [
      { id: 'v1', projectId: 'p', voNo: 'VO-02', seq: 1, title: 'Qty up', type: 'addition', amount: 0, status: 'approved', date: '2026-01-01',
        lines: [{ kind: "qty", boqItemId: "a", newQty: 120, amount: 10000 }] }, // 20 × 500 = +10,000
    ];
    expect(revisedBoqValue(boq, vos)).toBe(110000);
  });

  it('omission reduces the revised BOQ', () => {
    const vos: Variation[] = [
      { id: 'v1', projectId: 'p', voNo: 'VO-03', seq: 1, title: 'Omit b', type: 'omission', amount: -50000, status: 'approved', date: '2026-01-01' },
    ];
    expect(revisedBoqValue(boq, vos)).toBe(50000);
  });
});

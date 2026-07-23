import { describe, it, expect } from 'vitest';
import type { BoqItem } from '../data/types';
import { diffContractLines } from './contractLineDiff';

const item = (id: string, code: string): BoqItem => ({
  id, projectId: 'p', billNo: '1', billName: 'Bill 1', section: '',
  code, description: `desc ${code}`, unit: 'CM', qty: 1000, rate: 100, amount: 100000,
} as BoqItem);

const items = [item('i1', '101'), item('i2', '201'), item('i3', '301')];

describe('diffContractLines', () => {
  it('reports nothing to do when the lines are identical', () => {
    const lines = [{ boqItemId: 'i1', qty: 100, rate: 90 }];
    const d = diffContractLines(lines, lines, items);
    expect(d.identical).toBe(true);
    expect(d.delta).toBe(0);
    expect(d.unchanged).toHaveLength(1);
  });

  it('detects a rate correction — the case that prompted this', () => {
    // Uploaded at the CLIENT rate by mistake, re-uploaded at the sublet rate.
    const d = diffContractLines(
      [{ boqItemId: 'i1', qty: 100, rate: 100 }],
      [{ boqItemId: 'i1', qty: 100, rate: 88 }],
      items,
    );
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].fromRate).toBe(100);
    expect(d.changed[0].toRate).toBe(88);
    expect(d.fromValue).toBe(10_000);
    expect(d.toValue).toBe(8_800);
    expect(d.delta).toBe(-1_200);
    expect(d.identical).toBe(false);
  });

  it('detects added and removed lines', () => {
    const d = diffContractLines(
      [{ boqItemId: 'i1', qty: 100, rate: 90 }],
      [{ boqItemId: 'i2', qty: 50, rate: 80 }],
      items,
    );
    expect(d.removed.map((c) => c.code)).toEqual(['101']);
    expect(d.added.map((c) => c.code)).toEqual(['201']);
    expect(d.delta).toBe(50 * 80 - 100 * 90);
  });

  it('detects a quantity change', () => {
    const d = diffContractLines(
      [{ boqItemId: 'i1', qty: 100, rate: 90 }],
      [{ boqItemId: 'i1', qty: 150, rate: 90 }],
      items,
    );
    expect(d.changed[0].fromQty).toBe(100);
    expect(d.changed[0].toQty).toBe(150);
    expect(d.delta).toBe(4_500);
  });

  it('orders changes by the size of the money movement', () => {
    const d = diffContractLines(
      [{ boqItemId: 'i1', qty: 100, rate: 90 }, { boqItemId: 'i2', qty: 100, rate: 90 }],
      [{ boqItemId: 'i1', qty: 101, rate: 90 }, { boqItemId: 'i2', qty: 500, rate: 90 }],
      items,
    );
    expect(d.changes[0].code).toBe('201'); // the big one first
  });

  it('folds repeated lines for one item so nothing is double-counted', () => {
    const d = diffContractLines(
      [],
      [{ boqItemId: 'i1', qty: 60, rate: 90 }, { boqItemId: 'i1', qty: 40, rate: 90 }],
      items,
    );
    expect(d.added).toHaveLength(1);
    expect(d.added[0].toQty).toBe(100);
    expect(d.toValue).toBe(9_000);
  });

  it('still describes a line whose BOQ item has since gone', () => {
    const d = diffContractLines([{ boqItemId: 'ghost', qty: 10, rate: 5 }], [], items);
    expect(d.removed[0].description).toMatch(/no longer in the BOQ/);
  });

  it('handles a first-time upload onto an empty contract', () => {
    const d = diffContractLines([], [{ boqItemId: 'i1', qty: 100, rate: 90 }], items);
    expect(d.fromValue).toBe(0);
    expect(d.toValue).toBe(9_000);
    expect(d.added).toHaveLength(1);
  });
});

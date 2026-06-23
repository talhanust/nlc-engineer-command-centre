import { describe, it, expect } from 'vitest';
import { applyVariationToBoq, variationLineAmount, dominantVariationType } from './variations';
import type { BoqItem, Variation } from '../data/types';

const boq: BoqItem[] = [
  { id: 'b1', projectId: 'p', billNo: '1', code: 'C1', description: 'Earthwork', unit: 'Cft', qty: 1000, rate: 100, amount: 100000 },
  { id: 'b2', projectId: 'p', billNo: '2', code: 'C2', description: 'Concrete', unit: 'Cft', qty: 500, rate: 200, amount: 100000 },
];

function vo(lines: Variation['lines']): Variation {
  return { id: 'v', projectId: 'p', voNo: 'VO-01', seq: 1, title: 't', type: 'addition', amount: 0, status: 'approved', lines };
}

describe('variation line amounts', () => {
  it('computes the signed delta for each kind', () => {
    expect(variationLineAmount({ kind: 'qty', boqItemId: 'b1', newQty: 1200, amount: 0 }, boq[0])).toBe(20000);   // +200 × 100
    expect(variationLineAmount({ kind: 'rate', boqItemId: 'b1', newRate: 120, amount: 0 }, boq[0])).toBe(20000);  // 1000 × +20
    expect(variationLineAmount({ kind: 'add', newQty: 10, newRate: 50, amount: 0 })).toBe(500);
    expect(variationLineAmount({ kind: 'omit', boqItemId: 'b1', amount: 0 }, boq[0])).toBe(-100000);
  });
});

describe('applyVariationToBoq', () => {
  it('applies a quantity variation and tags the item', () => {
    const out = applyVariationToBoq(boq, vo([{ kind: 'qty', boqItemId: 'b1', newQty: 1200, amount: 0 }]));
    const b1 = out.find((b) => b.id === 'b1')!;
    expect(b1.qty).toBe(1200);
    expect(b1.amount).toBe(120000);
    expect(b1.revisedByVo).toBe('VO-01');
  });

  it('applies a rate change', () => {
    const out = applyVariationToBoq(boq, vo([{ kind: 'rate', boqItemId: 'b2', newRate: 250, amount: 0 }]));
    const b2 = out.find((b) => b.id === 'b2')!;
    expect(b2.rate).toBe(250);
    expect(b2.amount).toBe(125000);
  });

  it('omits an item (qty/amount to zero)', () => {
    const out = applyVariationToBoq(boq, vo([{ kind: 'omit', boqItemId: 'b1', amount: 0 }]));
    expect(out.find((b) => b.id === 'b1')!.amount).toBe(0);
  });

  it('adds a new item to the BOQ', () => {
    const out = applyVariationToBoq(boq, vo([{ kind: 'add', billNo: '3', code: 'NEW', description: 'New scope', unit: 'No', newQty: 4, newRate: 1000, amount: 0 }]));
    expect(out.length).toBe(boq.length + 1);
    const added = out.find((b) => b.code === 'NEW')!;
    expect(added.amount).toBe(4000);
    expect(added.section).toContain('VO-01');
  });

  it('leaves the BOQ untouched when there are no lines', () => {
    expect(applyVariationToBoq(boq, vo([]))).toEqual(boq);
  });

  it('infers the dominant variation type from the lines', () => {
    expect(dominantVariationType([{ kind: 'add', amount: 100 }])).toBe('addition');
    expect(dominantVariationType([{ kind: 'omit', boqItemId: 'b1', amount: -100 }])).toBe('omission');
  });
});

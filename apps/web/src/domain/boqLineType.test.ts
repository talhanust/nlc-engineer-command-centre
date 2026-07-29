import { describe, it, expect } from 'vitest';
import type { BoqItem, BoqLineType } from '../data/types';
import {
  lineType, isRemeasured, countsToEarnedValue, isAllocable, earnedValueBase, inferLineType, LINE_TYPE_LABEL,
} from './boqLineType';

const item = (lt: BoqLineType | undefined, amount = 100): BoqItem => ({
  id: 'i', projectId: 'p', billNo: '1', billName: 'B', section: '', code: 'c',
  description: 'd', unit: 'CM', qty: 1, rate: amount, amount, lineType: lt,
} as BoqItem);

describe('lineType defaulting', () => {
  it('treats an untyped (legacy) item as measured', () => {
    expect(lineType(item(undefined))).toBe('measured');
    expect(isRemeasured(item(undefined))).toBe(true);
    expect(countsToEarnedValue(item(undefined))).toBe(true);
  });
});

describe('remeasurement', () => {
  it('remeasures only measured lines', () => {
    expect(isRemeasured(item('measured'))).toBe(true);
    expect(isRemeasured(item('lump_sum'))).toBe(false);
    expect(isRemeasured(item('provisional'))).toBe(false);
    expect(isRemeasured(item('prime_cost'))).toBe(false);
    expect(isRemeasured(item('dayworks'))).toBe(false);
  });
});

describe('earned value inclusion', () => {
  it('includes measured and lump-sum, excludes allowances', () => {
    expect(countsToEarnedValue(item('measured'))).toBe(true);
    expect(countsToEarnedValue(item('lump_sum'))).toBe(true);
    expect(countsToEarnedValue(item('provisional'))).toBe(false);
    expect(countsToEarnedValue(item('prime_cost'))).toBe(false);
    expect(countsToEarnedValue(item('dayworks'))).toBe(false);
  });

  it('splits a BOQ into EV-scope and held-out allowances by value', () => {
    const items = [item('measured', 1000), item('lump_sum', 500), item('provisional', 176_000_000), item('dayworks', 200)];
    const b = earnedValueBase(items);
    expect(b.inScopeValue).toBe(1500);
    expect(b.excludedValue).toBe(176_000_200);
    expect(b.excluded.map((i) => i.amount).sort((a, z) => a - z)).toEqual([200, 176_000_000]);
  });
});

describe('allocability', () => {
  it('lets measured and lump-sum be planned, holds allowances back', () => {
    expect(isAllocable(item('measured'))).toBe(true);
    expect(isAllocable(item('lump_sum'))).toBe(true);
    expect(isAllocable(item('provisional'))).toBe(false);
    expect(isAllocable(item('prime_cost'))).toBe(false);
    expect(isAllocable(item('dayworks'))).toBe(false);
  });
});

describe('inferLineType', () => {
  it('recognises a provisional sum by the PS unit — the Toll Plaza case', () => {
    expect(inferLineType({ unit: 'PS', description: 'Remodeling of Toll Plaza' })).toBe('provisional');
  });
  it('recognises the standard tokens', () => {
    expect(inferLineType({ unit: 'PC' })).toBe('prime_cost');
    expect(inferLineType({ unit: 'DW' })).toBe('dayworks');
    expect(inferLineType({ unit: 'LS' })).toBe('lump_sum');
    expect(inferLineType({ unit: 'Sum' })).toBe('lump_sum');
    expect(inferLineType({ unit: 'Item' })).toBe('lump_sum');
  });
  it('recognises keywords in the description', () => {
    expect(inferLineType({ unit: '', description: 'Provisional sum for utility diversions' })).toBe('provisional');
    expect(inferLineType({ unit: '', description: 'Dayworks allowance' })).toBe('dayworks');
    expect(inferLineType({ unit: '', description: 'Prime cost sum for street lighting' })).toBe('prime_cost');
  });
  it('leaves an ordinary measured item alone', () => {
    expect(inferLineType({ unit: 'CM', description: 'Concrete Class A3' })).toBe('measured');
    expect(inferLineType({ unit: 'Sqm', description: 'Clearing & grubbing' })).toBe('measured');
  });
});

describe('labels', () => {
  it('names every type', () => {
    expect(LINE_TYPE_LABEL.provisional).toBe('Provisional sum');
    expect(LINE_TYPE_LABEL.prime_cost).toBe('Prime cost');
  });
});

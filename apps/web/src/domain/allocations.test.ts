import { describe, it, expect } from 'vitest';
import {
  allocatedQty, remainingQty, isOverAllocated, itemMargin, boqMargin,
  contractSummaries, requiredAuthority, canApproveContract,
} from './allocations';
import type { Allocation, BoqItem } from '../data/types';

function item(id: string, qty: number, rate: number): BoqItem {
  return { id, projectId: 'p', billNo: '1', code: id, description: id, unit: 'm3', qty, rate, amount: qty * rate };
}
function alloc(boqItemId: string, type: Allocation['executionType'], contractorId: string | undefined, qty: number, rate: number): Allocation {
  return { id: `${boqItemId}-${type}-${contractorId ?? 'x'}`, projectId: 'p', boqItemId, executionType: type, contractorId, qty, rate };
}

describe('allocation quantities + margin', () => {
  const boq = item('I1', 100, 1000);
  const allocs = [alloc('I1', 'sublet', 'c1', 60, 800), alloc('I1', 'labor', 'c2', 30, 600)];

  it('sums allocated and computes remaining', () => {
    expect(allocatedQty(allocs, 'I1')).toBe(90);
    expect(remainingQty(boq, allocs)).toBe(10);
    expect(isOverAllocated(boq, allocs)).toBe(false);
  });

  it('flags over-allocation beyond BOQ qty', () => {
    const over = [...allocs, alloc('I1', 'labor', 'c3', 20, 500)]; // 110 > 100
    expect(isOverAllocated(boq, over)).toBe(true);
  });

  it('computes item margin = Σ (BOQ rate − rate) × qty', () => {
    // (1000-800)*60 + (1000-600)*30 = 12000 + 12000 = 24000
    expect(itemMargin(boq, allocs)).toBe(24000);
  });

  it('computes overall BOQ margin + %', () => {
    const m = boqMargin([boq], allocs);
    expect(m.revenue).toBe(90000); // 1000*90
    expect(m.cost).toBe(66000);    // 800*60 + 600*30
    expect(m.margin).toBe(24000);
  });
});

describe('contract summaries + competent authority', () => {
  const boq = item('I1', 100, 1_000_000);
  const allocs = [alloc('I1', 'sublet', 'c1', 200, 900_000)]; // value 180,000,000

  it('groups by contractor + type with value and margin', () => {
    const [c] = contractSummaries([boq], allocs);
    expect(c.value).toBe(180_000_000);
    expect(c.margin).toBe(20_000_000); // (1,000,000-900,000)*200
  });

  it('routes to the right authority by value + type', () => {
    expect(requiredAuthority('sublet', 180_000_000)).toBe('comd_engrs'); // >150M
    expect(requiredAuthority('sublet', 1_200_000_000)).toBe('oic');
    expect(requiredAuthority('labor', 12_000_000)).toBe('pd');
    expect(requiredAuthority('labor', 40_000_000)).toBe('dg');
  });

  it('gates approval by power ceiling', () => {
    expect(canApproveContract('pd', 'sublet', 180_000_000)).toBe(false); // PD caps at 150M sublet
    expect(canApproveContract('comd_engrs', 'sublet', 180_000_000)).toBe(true);
    expect(canApproveContract('pd', 'labor', 12_000_000)).toBe(true);
  });
});

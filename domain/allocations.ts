import { LABOR_CONTRACT_POWERS, SUBLET_CONTRACT_POWERS } from './chains';
import type { Allocation, BoqItem, ExecutionType } from '../data/types';

export const EXECUTION_LABEL: Record<ExecutionType, string> = {
  labor: 'Labor-rate', sublet: 'Sublet', nlc_direct: 'NLC-direct',
};

export function itemAllocations(allocs: Allocation[], boqItemId: string): Allocation[] {
  return allocs.filter((a) => a.boqItemId === boqItemId);
}

export function allocatedQty(allocs: Allocation[], boqItemId: string): number {
  return itemAllocations(allocs, boqItemId).reduce((s, a) => s + a.qty, 0);
}

export function remainingQty(item: BoqItem, allocs: Allocation[]): number {
  return +(item.qty - allocatedQty(allocs, item.id)).toFixed(4);
}

export function isOverAllocated(item: BoqItem, allocs: Allocation[]): boolean {
  return allocatedQty(allocs, item.id) > item.qty + 1e-6;
}

/** Item gross margin = Σ (BOQ rate − contractor rate) × qty over labor/sublet lines. */
export function itemMargin(item: BoqItem, allocs: Allocation[]): number {
  return itemAllocations(allocs, item.id)
    .filter((a) => a.executionType !== 'nlc_direct')
    .reduce((s, a) => s + (item.rate - a.rate) * a.qty, 0);
}

export interface BoqMarginSummary {
  revenue: number; // BOQ value of allocated (labor+sublet) qty
  cost: number;    // contractor cost
  margin: number;
  marginPct: number;
}

export function boqMargin(items: BoqItem[], allocs: Allocation[]): BoqMarginSummary {
  let revenue = 0, cost = 0;
  for (const item of items) {
    for (const a of itemAllocations(allocs, item.id)) {
      if (a.executionType === 'nlc_direct') continue;
      revenue += item.rate * a.qty;
      cost += a.rate * a.qty;
    }
  }
  const margin = revenue - cost;
  return { revenue, cost, margin, marginPct: revenue > 0 ? +((margin / revenue) * 100).toFixed(1) : 0 };
}

export interface ContractSummary {
  key: string;
  executionType: ExecutionType;
  contractorId: string;
  value: number;   // payable to contractor = Σ rate × qty
  revenue: number; // BOQ value = Σ BOQ rate × qty
  margin: number;
  lines: number;
}

/** Group labor/sublet allocations into contracts (one per contractor + type). */
export function contractSummaries(items: BoqItem[], allocs: Allocation[]): ContractSummary[] {
  const rateOf = new Map(items.map((i) => [i.id, i.rate]));
  const byKey = new Map<string, ContractSummary>();
  for (const a of allocs) {
    if (a.executionType === 'nlc_direct' || !a.contractorId) continue;
    const key = `${a.executionType}:${a.contractorId}`;
    const boqRate = rateOf.get(a.boqItemId) ?? 0;
    const cur = byKey.get(key) ?? { key, executionType: a.executionType, contractorId: a.contractorId, value: 0, revenue: 0, margin: 0, lines: 0 };
    cur.value += a.rate * a.qty;
    cur.revenue += boqRate * a.qty;
    cur.margin = cur.revenue - cur.value;
    cur.lines += 1;
    byKey.set(key, cur);
  }
  return [...byKey.values()];
}

/** Lowest Competent Authority that can approve a contract of this type + value. */
export function requiredAuthority(type: ExecutionType, value: number): string {
  const ladder: Array<[string, number]> = type === 'sublet'
    ? [['pd', 150e6], ['comd_engrs', 300e6], ['dg', 1000e6], ['oic', Infinity]]
    : [['pd', 15e6], ['comd_engrs', 30e6], ['dg', 50e6]];
  for (const [role, ceil] of ladder) if (value <= ceil) return role;
  return type === 'sublet' ? 'oic' : 'dg'; // labor > 50 Mn is undefined in spec; default DG
}

/** Can `role` approve a contract of this type + value? */
export function canApproveContract(role: string, type: ExecutionType, value: number): boolean {
  const powers = type === 'sublet' ? SUBLET_CONTRACT_POWERS : LABOR_CONTRACT_POWERS;
  const ceil = powers[role];
  if (ceil === undefined) return false;
  return ceil === null || value <= ceil;
}

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

/** Per-item sublet (S/C) cost = Σ sublet rate×qty. */
export function itemScCost(item: BoqItem, allocs: Allocation[]): number {
  return itemAllocations(allocs, item.id).filter((a) => a.executionType === 'sublet').reduce((s, a) => s + a.rate * a.qty, 0);
}
/** Per-item labour-only (L/O) cost = Σ labor rate×qty. */
export function itemLoCost(item: BoqItem, allocs: Allocation[]): number {
  return itemAllocations(allocs, item.id).filter((a) => a.executionType === 'labor').reduce((s, a) => s + a.rate * a.qty, 0);
}
/** Summary mode for a BOQ item based on its allocation lines. */
export function itemModeLabel(item: BoqItem, allocs: Allocation[]): 'Unassigned' | 'Self' | 'Sublet' | 'Labor' | 'Mixed' {
  const lines = itemAllocations(allocs, item.id);
  if (lines.length === 0) return 'Unassigned';
  const types = new Set(lines.map((a) => a.executionType));
  if (types.size > 1) return 'Mixed';
  const only = [...types][0];
  return only === 'nlc_direct' ? 'Self' : only === 'sublet' ? 'Sublet' : 'Labor';
}
/** Item margin % over the BOQ value of its labor+sublet allocation. */
export function itemMarginPct(item: BoqItem, allocs: Allocation[]): number {
  const revenue = itemAllocations(allocs, item.id).filter((a) => a.executionType !== 'nlc_direct').reduce((s, a) => s + item.rate * a.qty, 0);
  return revenue > 0 ? +((itemMargin(item, allocs) / revenue) * 100).toFixed(1) : 0;
}

export interface PlanTotals { amount: number; scCost: number; loCost: number; margin: number; marginPct: number }
export function planTotals(items: BoqItem[], allocs: Allocation[]): PlanTotals {
  let amount = 0, scCost = 0, loCost = 0, margin = 0;
  for (const item of items) {
    amount += item.amount;
    scCost += itemScCost(item, allocs);
    loCost += itemLoCost(item, allocs);
    margin += itemMargin(item, allocs);
  }
  const revenue = boqMargin(items, allocs).revenue;
  return { amount, scCost, loCost, margin, marginPct: revenue > 0 ? +((margin / revenue) * 100).toFixed(1) : 0 };
}

export interface ContractCoverage {
  contractId: string;
  contractNo: string;
  subcontractorId: string;
  scopeValue: number;     // BOQ value of the contract's scope bills
  allocatedValue: number; // BOQ value allocated to this contractor within scope
  unawarded: number;      // scopeValue − allocatedValue
  pct: number;            // allocated / scope, 0..1
}

/**
 * Per-contract scope vs allocated coverage. "Scope" is the BOQ value of the
 * contract's scope bills; "allocated" is the BOQ value of quantities assigned to
 * that contractor within scope. Unawarded scope = scope − allocated.
 */
export function contractCoverage(
  contracts: Array<{ id: string; contractNo: string; subcontractorId: string; scopeBills: string[] }>,
  items: BoqItem[],
  allocs: Allocation[],
): ContractCoverage[] {
  return contracts.map((c) => {
    const scopeItems = items.filter((it) => !c.scopeBills.length || c.scopeBills.includes(it.billNo));
    const scopeIds = new Set(scopeItems.map((it) => it.id));
    const scopeValue = scopeItems.reduce((s, it) => s + it.amount, 0);
    const rateOf = new Map(scopeItems.map((it) => [it.id, it.rate]));
    const allocatedValue = allocs
      .filter((a) => a.contractorId === c.subcontractorId && a.executionType !== 'nlc_direct' && scopeIds.has(a.boqItemId))
      .reduce((s, a) => s + (rateOf.get(a.boqItemId) ?? 0) * a.qty, 0);
    const unawarded = +(scopeValue - allocatedValue).toFixed(2);
    return {
      contractId: c.id, contractNo: c.contractNo, subcontractorId: c.subcontractorId,
      scopeValue, allocatedValue, unawarded, pct: scopeValue > 0 ? Math.min(1, allocatedValue / scopeValue) : 0,
    };
  });
}

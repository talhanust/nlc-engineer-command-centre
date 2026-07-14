// A sublet or labor contract carries its own BOQ: agreed quantities of the main
// BOQ items at the subcontractor's rates. Those quantities LOCK against the main
// BOQ — the distribution planner may not give away more of an item than the item
// holds, and the locked portion of an item is committed to a named contractor.
//
// A BOQ item may be split across several contractors (Contractor A takes 6,000
// m³ of a 10,000 m³ excavation item, Contractor B the rest). Splitting is
// allowed; over-committing the item across contractors is a WARNING, not a block,
// because the correction (revise a contract, or a variation) is a commercial
// decision the planner makes deliberately, not an input error to reject.

import type { BoqItem, Contract, ContractLine } from '../data/types';

const EPS = 1e-6;

/** Contracts whose lines are live for locking: everything except a closed one. */
export function lockingContracts(contracts: Contract[]): Contract[] {
  return contracts.filter((c) => c.status !== 'closed' && Array.isArray(c.lines) && c.lines.length > 0);
}

/** A contract's value is the sum of its lines — never a typed-in figure that can
 *  drift from the quantities it is billed against. */
export function contractValue(lines: ContractLine[]): number {
  return lines.reduce((s, l) => s + Math.max(0, l.qty) * Math.max(0, l.rate), 0);
}

export interface ItemLock {
  boqItemId: string;
  itemQty: number;
  /** Σ of contract-line quantities committed against this item. */
  lockedQty: number;
  /** itemQty − lockedQty, floored at 0 — what the planner may still give away. */
  unallocatedQty: number;
  /** lockedQty exceeds the BOQ quantity (by more than a rounding tolerance). */
  overCommitted: boolean;
  /** Who holds what, for the tooltip / breakdown. */
  holders: Array<{ contractId: string; contractNo: string; subcontractorId: string; qty: number }>;
}

/**
 * How much of each BOQ item is locked to contracts, and how much remains.
 * `contracts` should already be filtered to the ones that lock (see
 * lockingContracts); passing all of them is harmless but counts closed ones.
 */
export function itemLocks(items: BoqItem[], contracts: Contract[]): Map<string, ItemLock> {
  const byItem = new Map<string, ItemLock>();
  for (const item of items) {
    byItem.set(item.id, {
      boqItemId: item.id, itemQty: item.qty, lockedQty: 0,
      unallocatedQty: item.qty, overCommitted: false, holders: [],
    });
  }
  for (const c of contracts) {
    for (const line of c.lines ?? []) {
      const lock = byItem.get(line.boqItemId);
      if (!lock || line.qty <= 0) continue;
      lock.lockedQty += line.qty;
      lock.holders.push({ contractId: c.id, contractNo: c.contractNo, subcontractorId: c.subcontractorId, qty: line.qty });
    }
  }
  for (const lock of byItem.values()) {
    lock.unallocatedQty = Math.max(0, lock.itemQty - lock.lockedQty);
    lock.overCommitted = lock.lockedQty - lock.itemQty > EPS;
  }
  return byItem;
}

export interface ContractLineIssue {
  boqItemId: string;
  itemCode: string;
  itemQty: number;
  lockedQty: number;
  overBy: number;
}

/**
 * Validate a set of contract lines about to be saved against the BOQ and the
 * OTHER contracts already locking. Returns the items this contract would push
 * over their BOQ quantity — a warning the user acknowledges, not a hard stop.
 * `excludeContractId` lets an edit ignore the contract's own current lines.
 */
export function contractLineIssues(
  lines: ContractLine[],
  items: BoqItem[],
  otherContracts: Contract[],
  excludeContractId?: string,
): ContractLineIssue[] {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const locks = itemLocks(items, otherContracts.filter((c) => c.id !== excludeContractId && c.status !== 'closed'));
  const issues: ContractLineIssue[] = [];
  // Fold this contract's proposed lines on top of everyone else's locks.
  const proposed = new Map<string, number>();
  for (const l of lines) if (l.qty > 0) proposed.set(l.boqItemId, (proposed.get(l.boqItemId) ?? 0) + l.qty);

  for (const [boqItemId, addQty] of proposed) {
    const item = itemById.get(boqItemId);
    if (!item) continue;
    const already = locks.get(boqItemId)?.lockedQty ?? 0;
    const total = already + addQty;
    if (total - item.qty > EPS) {
      issues.push({ boqItemId, itemCode: item.code, itemQty: item.qty, lockedQty: total, overBy: +(total - item.qty).toFixed(3) });
    }
  }
  return issues;
}

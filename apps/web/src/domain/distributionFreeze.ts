import type { Contract, Distribution, BoqItem } from '../data/types';

/**
 * Distribution freeze (spec §4): once a contract is AWARDED, the BOQ-item
 * quantities distributed to that contractor are frozen. The remainder of each
 * item may be awarded to another contractor, but the frozen quantity cannot be
 * re-allocated or reduced. This computes, per BOQ item, how much quantity is
 * locked by awarded contracts and what remains distributable.
 */

export interface ItemFreeze {
  boqItemId: string;
  itemQty: number;
  frozenQty: number;        // Σ allocated to awarded contracts for this item
  remainingQty: number;     // itemQty − frozenQty
  frozenBy: string[];       // contractor ids holding frozen quantity
}

const AWARDED = new Set(['awarded', 'in_progress', 'completed', 'closed']);

export function itemFreezes(
  items: BoqItem[],
  contracts: Contract[],
  distributions: Distribution[],
): Map<string, ItemFreeze> {
  const awardedSubs = new Set(contracts.filter((c) => AWARDED.has(c.status)).map((c) => c.subcontractorId));
  const byItem = new Map<string, ItemFreeze>();
  for (const it of items) byItem.set(it.id, { boqItemId: it.id, itemQty: it.qty, frozenQty: 0, remainingQty: it.qty, frozenBy: [] });
  for (const d of distributions) {
    if (d.mode !== 'sublet' || !d.subcontractorId || !awardedSubs.has(d.subcontractorId)) continue;
    const f = byItem.get(d.boqItemId);
    if (!f) continue;
    f.frozenQty += d.allocatedQty;
    f.remainingQty = Math.max(0, f.itemQty - f.frozenQty);
    if (!f.frozenBy.includes(d.subcontractorId)) f.frozenBy.push(d.subcontractorId);
  }
  return byItem;
}

/**
 * May this distribution change be applied? Returns null if allowed, or a
 * reason string if it would touch quantity frozen by an awarded contract
 * (reducing another contractor's frozen allocation, or over-allocating the
 * item beyond its total quantity).
 */
export function distributionChangeBlocked(
  next: Distribution,
  prev: Distribution | undefined,
  freeze: ItemFreeze | undefined,
): string | null {
  if (!freeze) return null;
  // Editing a distribution that itself belongs to an awarded (frozen) contractor.
  if (prev && prev.mode === 'sublet' && prev.subcontractorId && freeze.frozenBy.includes(prev.subcontractorId)) {
    const changedSub = prev.subcontractorId !== next.subcontractorId;
    const reducedQty = next.allocatedQty < prev.allocatedQty;
    if (changedSub || reducedQty || next.mode !== 'sublet') {
      return `Quantity is frozen under an awarded contract with ${prev.subcontractorId}; raise a variation instead`;
    }
  }
  // Over-allocation: new allocation would exceed the item quantity given what is already frozen by OTHERS.
  const frozenByOthers = freeze.frozenQty - (prev && prev.subcontractorId && freeze.frozenBy.includes(prev.subcontractorId) ? prev.allocatedQty : 0);
  if (next.mode === 'sublet' && next.allocatedQty + frozenByOthers > freeze.itemQty + 1e-6) {
    return `Only ${(freeze.itemQty - frozenByOthers).toFixed(2)} remains after awarded contracts; cannot allocate ${next.allocatedQty}`;
  }
  return null;
}

import type { BoqItem, BoqWbsLink, BoqMaterialLink } from '../data/types';

export interface Coverage {
  total: number;
  confirmed: number;
  auto: number;
  disputed: number;
  unmapped: number;
  confirmedPct: number;
  coveragePct: number; // any non-unmapped link
}

function coverage(total: number, links: Array<{ confidence: string }>): Coverage {
  const confirmed = links.filter((l) => l.confidence === 'confirmed').length;
  const auto = links.filter((l) => l.confidence === 'auto').length;
  const disputed = links.filter((l) => l.confidence === 'disputed').length;
  const mapped = links.length;
  const unmapped = Math.max(0, total - mapped);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total,
    confirmed,
    auto,
    disputed,
    unmapped,
    confirmedPct: pct(confirmed),
    coveragePct: pct(mapped),
  };
}

export function wbsCoverage(items: BoqItem[], links: BoqWbsLink[]): Coverage {
  const ids = new Set(items.map((i) => i.id));
  return coverage(items.length, links.filter((l) => ids.has(l.boqItemId)));
}

export function materialCoverage(items: BoqItem[], links: BoqMaterialLink[]): Coverage {
  const ids = new Set(items.map((i) => i.id));
  return coverage(items.length, links.filter((l) => ids.has(l.boqItemId)));
}

/** Links grouped per BOQ item (many-to-many). */
export function linksByItem(links: BoqWbsLink[]): Map<string, BoqWbsLink[]> {
  const m = new Map<string, BoqWbsLink[]>();
  for (const l of links) {
    const arr = m.get(l.boqItemId) ?? [];
    arr.push(l);
    m.set(l.boqItemId, arr);
  }
  return m;
}

/** True when the item's mapping is driven by explicit quantity allocation. */
export function usesQtyAllocation(itemLinks: BoqWbsLink[]): boolean {
  return itemLinks.some((l) => l.qty !== undefined && l.qty >= 0);
}

/**
 * Effective value share of one link, in priority order:
 *   1. quantity allocation — qty ÷ item qty (the honest measure: an activity
 *      carries exactly the value of the quantity executed under it);
 *   2. an explicit weight;
 *   3. an even split across the item's links.
 * `item` is optional so existing call sites keep compiling; pass it whenever a
 * quantity-allocated mapping must be respected.
 */
export function effectiveWeight(link: BoqWbsLink, itemLinks: BoqWbsLink[], item?: { qty: number }): number {
  if (item && item.qty > 0 && usesQtyAllocation(itemLinks)) {
    return Math.max(0, Math.min(1, (link.qty ?? 0) / item.qty));
  }
  if (link.weight !== undefined && link.weight >= 0) return Math.min(1, link.weight);
  return itemLinks.length > 0 ? 1 / itemLinks.length : 0;
}

export interface ItemAllocation {
  itemId: string;
  itemQty: number;
  /** Σ of allocated quantities across the item's links. */
  allocatedQty: number;
  /** itemQty − allocatedQty, floored at 0. */
  remainingQty: number;
  /** allocatedQty > itemQty (by more than a rounding tolerance). */
  overAllocated: boolean;
  /** Every unit of the item is accounted for. */
  fullyAllocated: boolean;
  usesQty: boolean;
}

// Quantities are decimals (m³, tonnes); compare with a tolerance rather than ===.
const EPS = 1e-6;

/** Quantity allocation of a single BOQ item across the activities it maps to. */
export function itemAllocation(item: { id: string; qty: number }, itemLinks: BoqWbsLink[]): ItemAllocation {
  const usesQty = usesQtyAllocation(itemLinks);
  const allocatedQty = itemLinks.reduce((s, l) => s + (l.qty ?? 0), 0);
  return {
    itemId: item.id,
    itemQty: item.qty,
    allocatedQty,
    remainingQty: Math.max(0, item.qty - allocatedQty),
    overAllocated: usesQty && allocatedQty - item.qty > EPS,
    fullyAllocated: usesQty && Math.abs(allocatedQty - item.qty) <= EPS,
    usesQty,
  };
}

export interface AllocationIssues {
  /** Items whose links allocate MORE than the BOQ quantity — must be fixed. */
  overAllocated: ItemAllocation[];
  /** Quantity-allocated items with quantity still unassigned — a warning. */
  underAllocated: ItemAllocation[];
  /** Blocking problems exist; the mapping should not be locked. */
  blocking: boolean;
}

/**
 * Pre-lock validation. Over-allocation is blocking: it would bill the same
 * quantity twice through two activities. Under-allocation is only a warning —
 * a planner may legitimately map part of an item now and the rest later.
 */
export function allocationIssues(items: Array<{ id: string; qty: number }>, links: BoqWbsLink[]): AllocationIssues {
  const by = linksByItem(links.filter((l) => l.confidence !== 'disputed'));
  const overAllocated: ItemAllocation[] = [];
  const underAllocated: ItemAllocation[] = [];
  for (const item of items) {
    const itemLinks = by.get(item.id) ?? [];
    if (itemLinks.length === 0) continue;
    const a = itemAllocation(item, itemLinks);
    if (!a.usesQty) continue;
    if (a.overAllocated) overAllocated.push(a);
    else if (a.remainingQty > EPS) underAllocated.push(a);
  }
  return { overAllocated, underAllocated, blocking: overAllocated.length > 0 };
}

/** Links grouped per activity — the "one activity, many BOQ items" view. */
export function linksByActivity(links: BoqWbsLink[]): Map<string, BoqWbsLink[]> {
  const m = new Map<string, BoqWbsLink[]>();
  for (const l of links) {
    const arr = m.get(l.activityId) ?? [];
    arr.push(l);
    m.set(l.activityId, arr);
  }
  return m;
}

/** Value an activity carries: Σ over its links of (allocated share × item amount). */
export function activityMappedValue(
  activityLinks: BoqWbsLink[],
  itemOf: Map<string, { id: string; qty: number; amount: number }>,
  linksOfItem: Map<string, BoqWbsLink[]>,
): number {
  let total = 0;
  for (const l of activityLinks) {
    const item = itemOf.get(l.boqItemId);
    if (!item) continue;
    total += item.amount * effectiveWeight(l, linksOfItem.get(l.boqItemId) ?? [l], item);
  }
  return total;
}

export interface ValueCoverage {
  totalValue: number;
  mappedValue: number;     // Σ value of items with ≥1 non-disputed link
  pct: number;             // by BOQ value
  unmappedItems: BoqItem[]; // worklist
}

/** Coverage measured by BOQ value (per req 3a(3)), plus the unmapped worklist. */
export function valueCoverage(items: BoqItem[], links: BoqWbsLink[]): ValueCoverage {
  const by = linksByItem(links.filter((l) => l.confidence !== 'disputed'));
  const totalValue = items.reduce((s, i) => s + i.amount, 0);
  const unmappedItems = items.filter((i) => !(by.get(i.id)?.length));
  const mappedValue = totalValue - unmappedItems.reduce((s, i) => s + i.amount, 0);
  return { totalValue, mappedValue, pct: totalValue > 0 ? Math.round((mappedValue / totalValue) * 100) : 0, unmappedItems };
}

/** Percentage of schedule activities that carry at least one mapped BOQ item. */
export function activityCoverage(activities: Array<{ activityId: string }>, links: BoqWbsLink[]): number {
  if (activities.length === 0) return 0;
  const mapped = new Set(links.filter((l) => l.confidence !== 'disputed').map((l) => l.activityId));
  const n = activities.filter((a) => mapped.has(a.activityId)).length;
  return Math.round((n / activities.length) * 100);
}

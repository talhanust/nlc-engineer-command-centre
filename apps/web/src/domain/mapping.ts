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

/** Effective value share of one link: explicit weight, else even split across the item's links. */
export function effectiveWeight(link: BoqWbsLink, itemLinks: BoqWbsLink[]): number {
  if (link.weight !== undefined && link.weight >= 0) return Math.min(1, link.weight);
  return itemLinks.length > 0 ? 1 / itemLinks.length : 0;
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

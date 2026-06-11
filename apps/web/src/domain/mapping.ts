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

import type { BoqItem, BoqMaterialLink, MaterialMaster } from '../data/types';

/**
 * Rate analysis from the material composition — the estimator's build-up.
 * Material cost per unit of a BOQ item = Σ (coeff × material standard rate).
 * The balance to the BOQ rate covers labour, plant, overheads and profit; a
 * NEGATIVE balance (material alone exceeds the rate) is a loss-rate flag.
 */

export interface RateAnalysisRow {
  boqItemId: string;
  materialCostPerUnit: number;
  materialSharePct: number | null; // of the BOQ rate
  balancePerUnit: number;          // rate − material cost (labour/plant/OH+P)
  lossRate: boolean;               // material cost alone > BOQ rate
  missingRates: string[];          // composed materials absent from the master
}

export function rateAnalysis(
  items: BoqItem[],
  links: BoqMaterialLink[],
  master: MaterialMaster[],
): Map<string, RateAnalysisRow> {
  const rateOf = new Map(master.map((m) => [m.code, m.standardRate]));
  const byItem = new Map<string, BoqMaterialLink[]>();
  for (const l of links) {
    const arr = byItem.get(l.boqItemId) ?? [];
    arr.push(l);
    byItem.set(l.boqItemId, arr);
  }
  const out = new Map<string, RateAnalysisRow>();
  for (const item of items) {
    const comp = byItem.get(item.id);
    if (!comp?.length) continue;
    let cost = 0;
    const missing: string[] = [];
    for (const l of comp) {
      const r = rateOf.get(l.materialRef);
      if (r === undefined) missing.push(l.materialRef);
      else cost += l.coeff * r;
    }
    cost = +cost.toFixed(2);
    out.set(item.id, {
      boqItemId: item.id,
      materialCostPerUnit: cost,
      materialSharePct: item.rate > 0 ? +((cost / item.rate) * 100).toFixed(1) : null,
      balancePerUnit: +(item.rate - cost).toFixed(2),
      lossRate: cost > item.rate && item.rate > 0,
      missingRates: missing,
    });
  }
  return out;
}

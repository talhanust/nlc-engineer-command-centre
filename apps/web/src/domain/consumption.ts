import type { BoqItem, BoqMaterialLink, MaterialIssue, ProgressUpdate } from '../data/types';
import { cumulativeExecuted } from './progress';

/**
 * Theoretical vs actual material consumption — the site engineer's classic
 * wastage control. Theoretical = Σ (validated executed qty × consumption
 * coeff) across every BOQ item composed with the material; actual = quantity
 * issued from store. Wastage % = (issued − theoretical) / theoretical.
 */

export interface ConsumptionRow {
  materialRef: string;
  theoreticalQty: number;
  issuedQty: number;
  varianceQty: number;   // issued − theoretical
  wastagePct: number | null;
  items: string[];       // consuming item codes
}

export const WASTAGE_TOLERANCE_PCT = 5;

export function consumptionVariance(args: {
  items: BoqItem[];
  matLinks: BoqMaterialLink[];
  progress: ProgressUpdate[];
  issues: MaterialIssue[];
}): ConsumptionRow[] {
  const { items, matLinks, progress, issues } = args;
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const byMat = new Map<string, { theo: number; codes: string[] }>();
  for (const l of matLinks) {
    const item = itemOf.get(l.boqItemId);
    if (!item || l.coeff <= 0) continue;
    const executed = Math.min(cumulativeExecuted(progress, item.id), item.qty);
    const row = byMat.get(l.materialRef) ?? { theo: 0, codes: [] };
    row.theo += executed * l.coeff;
    row.codes.push(item.code);
    byMat.set(l.materialRef, row);
  }
  const issued = new Map<string, number>();
  for (const i of issues) issued.set(i.materialCode, (issued.get(i.materialCode) ?? 0) + i.qty);

  const refs = new Set([...byMat.keys(), ...issued.keys()]);
  const out: ConsumptionRow[] = [];
  for (const materialRef of refs) {
    const theo = byMat.get(materialRef)?.theo ?? 0;
    const iss = issued.get(materialRef) ?? 0;
    if (theo <= 0 && iss <= 0) continue;
    out.push({
      materialRef,
      theoreticalQty: +theo.toFixed(2),
      issuedQty: +iss.toFixed(2),
      varianceQty: +(iss - theo).toFixed(2),
      wastagePct: theo > 0 ? +(((iss - theo) / theo) * 100).toFixed(1) : null,
      items: byMat.get(materialRef)?.codes ?? [],
    });
  }
  return out.sort((a, b) => (b.wastagePct ?? -1) - (a.wastagePct ?? -1));
}

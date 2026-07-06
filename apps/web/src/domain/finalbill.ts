import type { BoqItem, Ipc, Variation } from '../data/types';
import { approvedVariationQtyByItem } from './billing';

/**
 * Final-bill reconciliation — the QS check before financial closure:
 * per BOQ item, the AUTHORISED quantity (BOQ + approved variation orders)
 * against the quantity CLAIMED through the IPC register. Over-claims are the
 * defects of the account; under-claims are value left on the table.
 */

export interface FinalBillRow {
  boqItemId: string;
  code: string;
  description: string;
  unit: string;
  authorisedQty: number;   // BOQ qty + approved VO delta
  claimedQty: number;      // Σ IPC line qty
  varianceQty: number;     // claimed − authorised
  varianceAmount: number;  // varianceQty × rate
  over: boolean;
}

export interface FinalBillSummary {
  rows: FinalBillRow[];
  overItems: number;
  overAmount: number;      // Σ over-claimed value
  underItems: number;
  underValue: number;      // Σ unclaimed authorised value
  clean: boolean;          // no over-claims
}

export function finalBillRecon(items: BoqItem[], ipcs: Ipc[], variations: Variation[] = []): FinalBillSummary {
  const voDelta = approvedVariationQtyByItem(variations, items);
  const claimed = new Map<string, number>();
  for (const ipc of ipcs) {
    for (const l of ipc.lines ?? []) {
      claimed.set(l.boqItemId, (claimed.get(l.boqItemId) ?? 0) + l.qty);
    }
  }
  const rows: FinalBillRow[] = [];
  for (const it of items) {
    const authorised = it.qty + (voDelta[it.id] ?? 0);
    const cl = claimed.get(it.id) ?? 0;
    if (authorised <= 0 && cl <= 0) continue;
    const variance = +(cl - authorised).toFixed(2);
    rows.push({
      boqItemId: it.id, code: it.code, description: it.description, unit: it.unit,
      authorisedQty: +authorised.toFixed(2), claimedQty: +cl.toFixed(2),
      varianceQty: variance, varianceAmount: +(variance * it.rate).toFixed(2),
      over: variance > 0.0001,
    });
  }
  rows.sort((a, b) => b.varianceAmount - a.varianceAmount);
  const overRows = rows.filter((r) => r.over);
  const underRows = rows.filter((r) => r.varianceQty < 0);
  return {
    rows,
    overItems: overRows.length,
    overAmount: +overRows.reduce((s, r) => s + r.varianceAmount, 0).toFixed(2),
    underItems: underRows.length,
    underValue: +underRows.reduce((s, r) => s + Math.abs(r.varianceAmount), 0).toFixed(2),
    clean: overRows.length === 0,
  };
}

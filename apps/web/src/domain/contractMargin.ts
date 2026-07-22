// Margin on a sublet/labor contract, measured against the ORIGINAL BOQ.
//
// The subcontractor's BOQ carries only what is sublet: the items, the sublet
// quantities and the sublet rate. It is never the revenue side. Revenue is the
// project's own BOQ rate for the same item — the rate NLC is paid by the client.
// So for each line:
//
//     revenue = sublet qty × ORIGINAL BOQ rate
//     cost    = sublet qty × sublet rate
//     margin  = revenue − cost
//
// This is the margin fixed at AWARD, the moment the rate is committed — distinct
// from domain/marginanalytics.ts, which measures margin on work actually executed.
// Both matter: this one is the decision, that one is the outturn.
//
// A sublet rate at or above the BOQ rate is a loss on that item and must be shown
// as such, never buried in a favourable total.

import type { BoqItem, ContractLine } from '../data/types';

export interface LineMargin {
  boqItemId: string;
  code: string;
  description: string;
  unit: string;
  qty: number;
  /** The original BOQ rate — the revenue side. */
  boqRate: number;
  /** What the subcontractor is paid. */
  subletRate: number;
  revenue: number;
  cost: number;
  margin: number;
  /** margin ÷ revenue, as a percentage. 0 when the BOQ rate is 0. */
  marginPct: number;
  /** Sublet rate ≥ BOQ rate: this line earns nothing or loses money. */
  negative: boolean;
}

export interface ContractMargin {
  lines: LineMargin[];
  /** Σ qty × BOQ rate — what this scope earns at the client's rates. */
  revenue: number;
  /** Σ qty × sublet rate — the contract value. */
  cost: number;
  margin: number;
  marginPct: number;
  /** Lines priced at or above the BOQ rate. */
  negativeLines: LineMargin[];
}

const pct = (margin: number, revenue: number) => (revenue > 0 ? +((margin / revenue) * 100).toFixed(2) : 0);

/**
 * Work out a contract's margin against the original BOQ.
 * Lines whose item is not in the BOQ are ignored — they cannot be priced, and a
 * guess would misstate the margin.
 */
export function contractMargin(lines: ContractLine[], items: BoqItem[]): ContractMargin {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const out: LineMargin[] = [];

  for (const l of lines) {
    const item = itemById.get(l.boqItemId);
    if (!item) continue;
    const qty = Math.max(0, l.qty);
    const revenue = qty * item.rate;
    const cost = qty * Math.max(0, l.rate);
    const margin = revenue - cost;
    out.push({
      boqItemId: l.boqItemId, code: item.code, description: item.description, unit: item.unit,
      qty, boqRate: item.rate, subletRate: l.rate,
      revenue, cost, margin, marginPct: pct(margin, revenue),
      // Equal rates earn nothing, which is as much a red flag as a loss.
      negative: item.rate > 0 && l.rate >= item.rate,
    });
  }

  const revenue = out.reduce((s, l) => s + l.revenue, 0);
  const cost = out.reduce((s, l) => s + l.cost, 0);
  const margin = revenue - cost;
  return {
    lines: out, revenue, cost, margin, marginPct: pct(margin, revenue),
    negativeLines: out.filter((l) => l.negative),
  };
}

// What a sublet contract's BOQ actually is, for display.
//
// A contract that carries `lines` has its OWN bill of quantities: the items
// sublet, the quantity awarded, and the rate the subcontractor is paid. Pricing
// that view at the client's BOQ rate — or listing every item in the scope bills
// rather than the lines actually awarded — misstates the contract in the one
// place a user goes to check it.
//
// So the rows come from the LINES, the money comes from the SUBLET rate, and the
// client rate appears only as a labelled reference so the margin is verifiable.
//
// Older contracts predate the sublet flow and carry no lines, only scope bills
// and a typed value. Those fall back to a scope view priced at client rates —
// which is correct for them — and are marked `lineBased: false` so the UI can
// say so plainly instead of implying a precision that is not there.

import type { BoqItem, Contract, Rar } from '../data/types';

export interface ContractBoqRow {
  boqItemId: string;
  code: string;
  description: string;
  billNo: string;
  billName: string;
  unit: string;
  /** Quantity awarded to THIS subcontractor. */
  subletQty: number;
  /** Rate THIS subcontractor is paid. */
  subletRate: number;
  subletAmount: number;
  /** The client BOQ rate, for reference only. */
  clientRate: number;
  /** Revenue on the sublet quantity: subletQty × clientRate. */
  clientAmount: number;
  margin: number;
  /** Value already billed to this contract through its RARs. */
  billed: number;
  /** subletAmount − billed: what remains billable on this contract. */
  balance: number;
  /** billed ÷ subletAmount. */
  pct: number;
  /** The sublet rate is at or above the client rate — this line earns nothing. */
  negative: boolean;
}

export interface ContractBoqView {
  rows: ContractBoqRow[];
  /** True when the rows come from the contract's own lines. */
  lineBased: boolean;
  /** Σ sublet amounts — the contract value, derived, never a typed figure. */
  subletValue: number;
  /** Σ revenue on the sublet quantities at client rates. */
  clientValue: number;
  margin: number;
  marginPct: number;
  billedTotal: number;
  /** subletValue − billedTotal. */
  balanceTotal: number;
  /** Set when the stored contract.value disagrees with Σ lines. */
  storedValueMismatch?: { stored: number; derived: number };
}

const pct = (n: number, d: number) => (d > 0 ? +((n / d) * 100).toFixed(2) : 0);

export function contractBoqView(contract: Contract, boq: BoqItem[], rars: Rar[]): ContractBoqView {
  const itemById = new Map(boq.map((b) => [b.id, b]));
  const myRars = rars.filter((r) => r.contractId === contract.id);
  const billedByItem = new Map<string, number>();
  for (const r of myRars) {
    for (const l of r.lines ?? []) billedByItem.set(l.boqItemId, (billedByItem.get(l.boqItemId) ?? 0) + l.amount);
  }

  const lines = contract.lines ?? [];
  if (lines.length === 0) {
    // Legacy scope-based contract: price the scope at client rates, and say so.
    const inScope = (b: BoqItem) => !contract.scopeBills.length || contract.scopeBills.includes(b.billNo);
    const rows: ContractBoqRow[] = boq.filter(inScope).map((item) => {
      const billed = billedByItem.get(item.id) ?? 0;
      return {
        boqItemId: item.id, code: item.code, description: item.description, billNo: item.billNo, billName: item.billName ?? "", unit: item.unit,
        subletQty: item.qty, subletRate: item.rate, subletAmount: item.amount,
        clientRate: item.rate, clientAmount: item.amount, margin: 0,
        billed, balance: item.amount - billed, pct: pct(billed, item.amount), negative: false,
      };
    });
    const subletValue = rows.reduce((a, r) => a + r.subletAmount, 0);
    const billedTotal = rows.reduce((a, r) => a + r.billed, 0);
    return {
      rows, lineBased: false, subletValue, clientValue: subletValue, margin: 0, marginPct: 0,
      billedTotal, balanceTotal: subletValue - billedTotal,
    };
  }

  const rows: ContractBoqRow[] = [];
  for (const l of lines) {
    const item = itemById.get(l.boqItemId);
    if (!item) continue;
    const subletAmount = l.qty * l.rate;
    const clientAmount = l.qty * item.rate;
    const billed = billedByItem.get(l.boqItemId) ?? 0;
    rows.push({
      boqItemId: l.boqItemId, code: item.code, description: item.description, billNo: item.billNo, billName: item.billName ?? "", unit: item.unit,
      subletQty: l.qty, subletRate: l.rate, subletAmount,
      clientRate: item.rate, clientAmount, margin: clientAmount - subletAmount,
      billed, balance: subletAmount - billed, pct: pct(billed, subletAmount),
      negative: item.rate > 0 && l.rate >= item.rate,
    });
  }

  const subletValue = rows.reduce((a, r) => a + r.subletAmount, 0);
  const clientValue = rows.reduce((a, r) => a + r.clientAmount, 0);
  const billedTotal = rows.reduce((a, r) => a + r.billed, 0);
  const margin = clientValue - subletValue;

  // A stored value that disagrees with the lines means the record was written by
  // an older build (or edited outside this flow). Surface it rather than showing
  // two different totals in two places and letting the user find it.
  const storedValueMismatch = Math.abs((contract.value ?? 0) - subletValue) > 0.5
    ? { stored: contract.value ?? 0, derived: subletValue }
    : undefined;

  return {
    rows, lineBased: true, subletValue, clientValue, margin, marginPct: pct(margin, clientValue),
    billedTotal, balanceTotal: subletValue - billedTotal, storedValueMismatch,
  };
}

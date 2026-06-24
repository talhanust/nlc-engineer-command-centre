// A valued material stores register for the Procurement module. It threads the
// full cross-module chain — Demand (carries rate + the BOQ item it was raised
// for) → Purchase Order → CRV (goods receipt) → Material issue (consumption) —
// into one ledger per material code: quantity and value received, issued and on
// hand, plus the BOQ items each material was procured against.
import type { Crv, Demand, PurchaseOrder, MaterialIssue } from '../data/types';

export interface MaterialRegisterRow {
  code: string;
  description: string;
  unit: string;
  receivedQty: number;
  receivedValue: number;
  avgRate: number;        // weighted-average receipt rate
  issuedQty: number;
  issuedValue: number;    // issued qty × avgRate (consumption at store value)
  balanceQty: number;     // received − issued
  balanceValue: number;   // balanceQty × avgRate
  boqItemIds: string[];   // BOQ items this material was procured for (via Demand)
  negative: boolean;      // issues exceed recorded receipts
}

export interface MaterialRegister {
  rows: MaterialRegisterRow[];
  totalReceivedValue: number;
  totalIssuedValue: number;
  totalBalanceValue: number;
  negativeCodes: number;
}

interface CodeMeta { description: string; unit: string; rateSum: number; rateQty: number; boq: Set<string> }

/**
 * Build the register. Receipt rates/descriptions are resolved by walking each
 * CRV → its PO → that PO's demand → the demand item with the matching code.
 */
export function materialRegister(
  crvs: Crv[],
  demands: Demand[],
  pos: PurchaseOrder[],
  issues: MaterialIssue[],
): MaterialRegister {
  const poById = new Map(pos.map((p) => [p.id, p]));
  const demandById = new Map(demands.map((d) => [d.id, d]));

  // code → metadata (description/unit/weighted rate/BOQ links) from demand items
  const meta = new Map<string, CodeMeta>();
  function metaFor(code: string): CodeMeta {
    let m = meta.get(code);
    if (!m) { m = { description: '', unit: '', rateSum: 0, rateQty: 0, boq: new Set() }; meta.set(code, m); }
    return m;
  }

  const receivedQty = new Map<string, number>();
  const receivedValue = new Map<string, number>();

  for (const crv of crvs) {
    const po = poById.get(crv.poId);
    const demand = po ? demandById.get(po.demandId) : undefined;
    for (const line of crv.received) {
      const di = demand?.items.find((i) => i.code === line.code);
      const rate = di?.estimatedRate ?? 0;
      const m = metaFor(line.code);
      if (di) {
        if (!m.description) m.description = di.description;
        if (!m.unit) m.unit = di.unit;
        if (di.boqItemId) m.boq.add(di.boqItemId);
      }
      m.rateSum += rate * line.qtyReceived;
      m.rateQty += line.qtyReceived;
      receivedQty.set(line.code, (receivedQty.get(line.code) ?? 0) + line.qtyReceived);
      receivedValue.set(line.code, (receivedValue.get(line.code) ?? 0) + rate * line.qtyReceived);
    }
  }

  const issuedQty = new Map<string, number>();
  for (const i of issues) {
    issuedQty.set(i.materialCode, (issuedQty.get(i.materialCode) ?? 0) + i.qty);
    // surface materials that were issued but never formally received
    if (!meta.has(i.materialCode)) metaFor(i.materialCode);
  }

  const codes = Array.from(new Set<string>([...receivedQty.keys(), ...issuedQty.keys()])).sort();
  const rows: MaterialRegisterRow[] = codes.map((code) => {
    const m = metaFor(code);
    const rQty = receivedQty.get(code) ?? 0;
    const rVal = receivedValue.get(code) ?? 0;
    const avgRate = m.rateQty > 0 ? rVal / m.rateQty : 0;
    const iQty = issuedQty.get(code) ?? 0;
    const balanceQty = rQty - iQty;
    return {
      code,
      description: m.description,
      unit: m.unit,
      receivedQty: rQty,
      receivedValue: rVal,
      avgRate,
      issuedQty: iQty,
      issuedValue: iQty * avgRate,
      balanceQty,
      balanceValue: balanceQty * avgRate,
      boqItemIds: Array.from(m.boq),
      negative: balanceQty < 0,
    };
  });

  return {
    rows,
    totalReceivedValue: rows.reduce((s, r) => s + r.receivedValue, 0),
    totalIssuedValue: rows.reduce((s, r) => s + r.issuedValue, 0),
    totalBalanceValue: rows.reduce((s, r) => s + r.balanceValue, 0),
    negativeCodes: rows.filter((r) => r.negative).length,
  };
}

// Per-material movement ledger for the stores drill-down. For one material code
// it threads every receipt (CRV line, valued at the demand rate via PO→Demand)
// and every issue/consumption into a single running-balance ledger, plus the two
// source lists. Receipts are listed before issues (CRVs carry no date), then
// issues in date order, so the running balance reads top-to-bottom.
import type { Crv, Demand, PurchaseOrder, MaterialIssue } from '../data/types';

export interface LedgerReceipt {
  crvNo: string;
  poNo: string;
  qty: number;
  rate: number;
  value: number;
}
export interface LedgerIssue {
  id: string;
  dated: string;
  qty: number;
  issuedTo: string;
  contractorId?: string;
  rate: number;
  value: number;
}
export type LedgerMovement =
  | { kind: 'receipt'; ref: string; dated: string; qtyIn: number; qtyOut: 0; balance: number }
  | { kind: 'issue'; ref: string; dated: string; qtyIn: 0; qtyOut: number; balance: number };

export interface MaterialLedger {
  code: string;
  receipts: LedgerReceipt[];
  issues: LedgerIssue[];
  movements: LedgerMovement[];
  receivedQty: number;
  issuedQty: number;
  balanceQty: number;
  avgRate: number;
}

export function materialLedger(
  code: string,
  crvs: Crv[],
  demands: Demand[],
  pos: PurchaseOrder[],
  issues: MaterialIssue[],
): MaterialLedger {
  const poById = new Map(pos.map((p) => [p.id, p]));
  const demandById = new Map(demands.map((d) => [d.id, d]));

  const receipts: LedgerReceipt[] = [];
  let recVal = 0, recQty = 0;
  for (const crv of crvs) {
    const po = poById.get(crv.poId);
    const demand = po ? demandById.get(po.demandId) : undefined;
    for (const line of crv.received) {
      if (line.code !== code) continue;
      const rate = demand?.items.find((i) => i.code === code)?.estimatedRate ?? 0;
      receipts.push({ crvNo: crv.crvNo, poNo: po?.poNo ?? '—', qty: line.qtyReceived, rate, value: rate * line.qtyReceived });
      recVal += rate * line.qtyReceived;
      recQty += line.qtyReceived;
    }
  }
  const avgRate = recQty > 0 ? recVal / recQty : 0;

  const issued = issues
    .filter((i) => i.materialCode === code)
    .slice()
    .sort((a, b) => a.dated.localeCompare(b.dated));
  const issueRows: LedgerIssue[] = issued.map((i) => {
    const rate = i.rate ?? avgRate;
    return { id: i.id, dated: i.dated, qty: i.qty, issuedTo: i.issuedTo, contractorId: i.contractorId, rate, value: rate * i.qty };
  });

  const movements: LedgerMovement[] = [];
  let bal = 0;
  for (const r of receipts) { bal += r.qty; movements.push({ kind: 'receipt', ref: r.crvNo, dated: '', qtyIn: r.qty, qtyOut: 0, balance: bal }); }
  for (const i of issueRows) { bal -= i.qty; movements.push({ kind: 'issue', ref: i.issuedTo, dated: i.dated, qtyIn: 0, qtyOut: i.qty, balance: bal }); }

  const issuedQty = issueRows.reduce((s, i) => s + i.qty, 0);
  return { code, receipts, issues: issueRows, movements, receivedQty: recQty, issuedQty, balanceQty: recQty - issuedQty, avgRate };
}

import type { BoqItem, Distribution } from '../data/types';

export interface WcComponent { label: string; amount: number; kind: 'asset' | 'liability'; }
export interface WorkingCapital { components: WcComponent[]; net: number; }

/**
 * Working-capital position from current balances: receivables and retention
 * held are assets; outstanding advances to recover and payables are liabilities.
 */
export function workingCapital(input: {
  receivables: number;
  retentionHeld: number;
  advancesOutstanding: number;
  payables: number;
}): WorkingCapital {
  const components: WcComponent[] = [
    { label: 'Receivables (billed, unpaid)', amount: input.receivables, kind: 'asset' },
    { label: 'Retention held', amount: input.retentionHeld, kind: 'asset' },
    { label: 'Advances to recover', amount: input.advancesOutstanding, kind: 'liability' },
    { label: 'Payables (RAR outstanding)', amount: input.payables, kind: 'liability' },
  ];
  const net = components.reduce((a, c) => a + (c.kind === 'asset' ? c.amount : -c.amount), 0);
  return { components, net };
}

export interface BillMargin { billNo: string; revenue: number; cost: number; margin: number; marginPct: number; }

/** Self-executed work is assumed to cost `selfCostRatio` of its BOQ value. */
export const SELF_COST_RATIO = 0.85;

/**
 * Margin per bill: revenue is the BOQ value; sublet items are costed at their
 * full BOQ value (passed through to subs), self-execute items at SELF_COST_RATIO.
 */
export function marginByBill(
  boq: BoqItem[],
  dists: Record<string, Distribution | undefined>,
  selfCostRatio: number = SELF_COST_RATIO,
): BillMargin[] {
  const bills = new Map<string, { revenue: number; cost: number }>();
  for (const it of boq) {
    const mode = dists[it.id]?.mode ?? 'unassigned';
    const cost = mode === 'sublet' ? it.amount : it.amount * selfCostRatio;
    const b = bills.get(it.billNo) ?? { revenue: 0, cost: 0 };
    b.revenue += it.amount;
    b.cost += cost;
    bills.set(it.billNo, b);
  }
  return Array.from(bills.entries())
    .map(([billNo, { revenue, cost }]) => ({
      billNo, revenue, cost, margin: revenue - cost,
      marginPct: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    }))
    .sort((a, b) => a.billNo.localeCompare(b.billNo));
}

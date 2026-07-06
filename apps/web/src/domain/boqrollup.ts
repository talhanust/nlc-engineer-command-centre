import type { BoqItem, Distribution, ProgressUpdate, DistributionMode } from '../data/types';

export type BoqStatus = 'unassigned' | 'not_started' | 'in_progress' | 'complete';

export interface BoqRow {
  item: BoqItem;
  mode: DistributionMode;
  executedQty: number;
  executedValue: number;
  vettedValue: number;
  paidValue: number;
  receivableValue: number;
  pct: number; // 0..1 of contract qty executed
  status: BoqStatus;
}

export const MODE_LABEL: Record<DistributionMode, string> = {
  unassigned: 'Unassigned', self: 'Self', sublet: 'Sublet',
};

export const STATUS_LABEL: Record<BoqStatus, string> = {
  unassigned: 'Unassigned', not_started: 'Not started', in_progress: 'In progress', complete: 'Complete',
};

/** Join the contract baseline with planned mode (distribution) and executed qty (progress). */
export function buildBoqRows(
  items: BoqItem[],
  distributions: Distribution[],
  progress: ProgressUpdate[],
  opts?: { vetted?: Record<string, number>; paid?: Record<string, number> },
): BoqRow[] {
  const distByItem = new Map(distributions.map((d) => [d.boqItemId, d]));
  const execByItem = new Map<string, number>();
  for (const p of progress) execByItem.set(p.boqItemId, (execByItem.get(p.boqItemId) ?? 0) + p.executedQty);

  return items.map((item) => {
    const mode = distByItem.get(item.id)?.mode ?? 'unassigned';
    const executedQty = execByItem.get(item.id) ?? 0;
    const executedValue = executedQty * item.rate;
    const vettedValue = opts?.vetted?.[item.id] ?? 0;
    const paidValue = opts?.paid?.[item.id] ?? 0;
    const receivableValue = Math.max(0, vettedValue - paidValue);
    const pct = item.qty > 0 ? Math.min(1, executedQty / item.qty) : 0;
    let status: BoqStatus;
    if (mode === 'unassigned') status = 'unassigned';
    else if (executedQty <= 0) status = 'not_started';
    else if (pct >= 1) status = 'complete';
    else status = 'in_progress';
    return { item, mode, executedQty, executedValue, vettedValue, paidValue, receivableValue, pct, status };
  });
}

export interface BoqTotals {
  amount: number; executedValue: number; vettedValue: number; paidValue: number; receivableValue: number; count: number;
}

export function boqTotals(rows: BoqRow[]): BoqTotals {
  return rows.reduce<BoqTotals>((a, r) => ({
    amount: a.amount + r.item.amount,
    executedValue: a.executedValue + r.executedValue,
    vettedValue: a.vettedValue + r.vettedValue,
    paidValue: a.paidValue + r.paidValue,
    receivableValue: a.receivableValue + r.receivableValue,
    count: a.count + 1,
  }), { amount: 0, executedValue: 0, vettedValue: 0, paidValue: 0, receivableValue: 0, count: 0 });
}

export interface SectionGroup { section: string; rows: BoqRow[]; totals: BoqTotals }
export interface BillGroup { billNo: string; billName: string; sections: SectionGroup[]; rows: BoqRow[]; totals: BoqTotals }

/** Group rows by bill → section, preserving first-seen order, with subtotals at each level. */
export function groupBoq(rows: BoqRow[]): BillGroup[] {
  const bills = new Map<string, BoqRow[]>();
  for (const r of rows) {
    const arr = bills.get(r.item.billNo) ?? [];
    arr.push(r);
    bills.set(r.item.billNo, arr);
  }
  return Array.from(bills.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([billNo, billRows]) => {
      const secMap = new Map<string, BoqRow[]>();
      for (const r of billRows) {
        const key = r.item.section ?? '—';
        const arr = secMap.get(key) ?? [];
        arr.push(r);
        secMap.set(key, arr);
      }
      const sections = Array.from(secMap.entries()).map(([section, secRows]) => ({
        section, rows: secRows, totals: boqTotals(secRows),
      }));
      return {
        billNo,
        billName: billRows[0]?.item.billName ?? `Bill ${billNo}`,
        sections,
        rows: billRows,
        totals: boqTotals(billRows),
      };
    });
}

/** Filter predicate for the register's search + bill + status controls. */
export function filterBoqRows(
  rows: BoqRow[],
  q: { search: string; bill: string; status: string },
): BoqRow[] {
  const s = q.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (q.bill !== 'all' && r.item.billNo !== q.bill) return false;
    if (q.status !== 'all' && r.status !== q.status) return false;
    if (s && !(`${r.item.code} ${r.item.description} ${r.item.section ?? ''}`.toLowerCase().includes(s))) return false;
    return true;
  });
}

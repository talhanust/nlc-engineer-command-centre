import type { BoqItem, ProgressUpdate } from '../data/types';

/** Cumulative executed qty for a BOQ item — validated updates only. */
export function cumulativeExecuted(updates: ProgressUpdate[], boqItemId: string): number {
  return updates
    .filter((u) => u.boqItemId === boqItemId && u.status === 'validated')
    .reduce((s, u) => s + u.executedQty, 0);
}

/** Item % complete = cumulative executed / BOQ qty (capped at 100). */
export function itemPctComplete(item: BoqItem, updates: ProgressUpdate[]): number {
  if (item.qty <= 0) return 0;
  return Math.min(100, +((cumulativeExecuted(updates, item.id) / item.qty) * 100).toFixed(1));
}

/** Executed value to date = Σ cumulative executed × rate (validated). */
export function executedValueToDate(items: BoqItem[], updates: ProgressUpdate[]): number {
  return items.reduce((s, i) => s + cumulativeExecuted(updates, i.id) * i.rate, 0);
}

/** Value-weighted physical progress % across the BOQ. */
export function physicalProgressPct(items: BoqItem[], updates: ProgressUpdate[]): number {
  const total = items.reduce((s, i) => s + i.amount, 0);
  if (total <= 0) return 0;
  const earned = items.reduce((s, i) => s + cumulativeExecuted(updates, i.id) * i.rate, 0);
  return +((earned / total) * 100).toFixed(1);
}

export function pendingValidation(updates: ProgressUpdate[]): ProgressUpdate[] {
  return updates.filter((u) => u.status === 'draft');
}

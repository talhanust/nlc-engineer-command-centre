// How each BOQ line type behaves.
//
// The point of typing a line is that the type decides what the app does with it:
// whether it is remeasured for payment, whether it belongs in earned value,
// whether it can be sublet as a quantity. Putting those rules HERE — one place,
// tested — stops every screen from re-deciding "is this a provisional sum?" by
// sniffing the unit, which is how the Toll Plaza went missing.

import type { BoqItem, BoqLineType } from '../data/types';

export const LINE_TYPE_LABEL: Record<BoqLineType, string> = {
  measured: 'Measured',
  lump_sum: 'Lump sum',
  provisional: 'Provisional sum',
  prime_cost: 'Prime cost',
  dayworks: 'Dayworks',
};

export const LINE_TYPE_SHORT: Record<BoqLineType, string> = {
  measured: 'MEAS', lump_sum: 'LS', provisional: 'PS', prime_cost: 'PC', dayworks: 'DW',
};

/** The type of an item, defaulting to measured for untyped (legacy) data. */
export function lineType(item: Pick<BoqItem, 'lineType'>): BoqLineType {
  return item.lineType ?? 'measured';
}

/**
 * Is this line remeasured by quantity? Measured lines are; everything else is
 * paid another way (percent complete, actual cost, incurred time). A non-measured
 * line should not present a quantity × rate remeasurement in a RAR/IPC.
 */
export function isRemeasured(item: Pick<BoqItem, 'lineType'>): boolean {
  return lineType(item) === 'measured';
}

/**
 * Does this line count toward earned value / the S-curve right now? A provisional
 * or prime-cost sum is an allowance for work not yet defined — it carries a value
 * but represents no scheduled physical progress, so including it inflates the
 * baseline and flatters the curve. It should be excluded until it is converted
 * into real (measured or lump-sum) work.
 */
export function countsToEarnedValue(item: Pick<BoqItem, 'lineType'>): boolean {
  const t = lineType(item);
  return t === 'measured' || t === 'lump_sum';
}

/**
 * Can a quantity of this line be sublet/allocated in the planner? Measured lines
 * split by quantity. Lump sums are indivisible defined work — allocable whole,
 * not by quantity. Provisional / prime-cost / dayworks are allowances, not
 * quantities to award, so they are not planned as sublet quantity.
 */
export function isAllocable(item: Pick<BoqItem, 'lineType'>): boolean {
  const t = lineType(item);
  return t === 'measured' || t === 'lump_sum';
}

/**
 * Split a set of BOQ items into the portion that drives earned value and the
 * portion held out as allowances — the numbers a coverage or EVM view needs.
 */
export function earnedValueBase<T extends Pick<BoqItem, 'lineType' | 'amount'>>(items: T[]): {
  inScope: T[]; excluded: T[]; inScopeValue: number; excludedValue: number;
} {
  const inScope: T[] = []; const excluded: T[] = [];
  let inScopeValue = 0, excludedValue = 0;
  for (const i of items) {
    if (countsToEarnedValue(i)) { inScope.push(i); inScopeValue += i.amount; }
    else { excluded.push(i); excludedValue += i.amount; }
  }
  return { inScope, excluded, inScopeValue, excludedValue };
}

/**
 * Infer a line type from a raw BOQ row when the sheet doesn't state one, so an
 * imported provisional sum is recognised instead of being treated as measured.
 * Conservative: only classifies on strong signals (unit token, description
 * keyword), otherwise leaves it measured.
 */
export function inferLineType(row: { unit?: string; description?: string; code?: string }): BoqLineType {
  const unit = (row.unit ?? '').trim().toLowerCase();
  const desc = (row.description ?? '').toLowerCase();
  if (unit === 'ps' || /\bprovisional sum\b|\bp\.?s\.?\b/.test(desc)) return 'provisional';
  if (unit === 'pc' || /\bprime cost\b|\bp\.?c\.? sum\b/.test(desc)) return 'prime_cost';
  if (unit === 'dw' || /\bdayworks?\b|\bday works?\b/.test(desc)) return 'dayworks';
  if (unit === 'ls' || unit === 'sum' || unit === 'item' || /\blump sum\b/.test(desc)) return 'lump_sum';
  return 'measured';
}

/**
 * How a line is measured for payment, given its type — the shape the entry UI and
 * the RAR/IPC path both need so they stop treating every line as a quantity.
 *
 *  - 'quantity'   enter the executed quantity this period (measured lines)
 *  - 'percent'    enter % complete; the value is that % of the lump (lump sums)
 *  - 'none'       not remeasured from the BOQ — a provisional/PC sum is adjusted
 *                 on instruction, dayworks are booked as incurred cost elsewhere
 */
export type MeasureMode = 'quantity' | 'percent' | 'none';

export function measureMode(item: Pick<BoqItem, 'lineType'>): MeasureMode {
  const t = lineType(item);
  if (t === 'measured') return 'quantity';
  if (t === 'lump_sum') return 'percent';
  return 'none';
}

/**
 * Convert a CUMULATIVE % complete on a lump sum into the cumulative executed
 * "quantity" the progress store holds. A lump sum is modelled as qty × rate, so
 * x% complete is x% of that quantity — and the existing executedQty × rate
 * arithmetic then yields x% of the money with no special-casing downstream.
 * Clamped to [0, qty] so a lump can never be over-billed past 100%.
 */
export function percentToExecuted(item: Pick<BoqItem, 'qty'>, percent: number): number {
  const pct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return +((pct / 100) * item.qty).toFixed(6);
}

/** The inverse: the cumulative executed quantity expressed as % of the lump. */
export function executedToPercent(item: Pick<BoqItem, 'qty'>, executed: number): number {
  if (item.qty <= 0) return 0;
  return Math.max(0, Math.min(100, +((executed / item.qty) * 100).toFixed(1)));
}

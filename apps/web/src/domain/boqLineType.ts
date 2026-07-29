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

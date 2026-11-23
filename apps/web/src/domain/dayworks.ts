// Dayworks — time-and-materials booked against a dayworks BOQ line.
//
// A dayworks line is not remeasured from a quantity (boqLineType.measureMode →
// 'none'). Its value is the sum of the daywork sheets validated against it:
// actual labour hours, plant hours and materials, each at its rate. This module
// is the pure arithmetic — totals, category splits, and the validated value per
// line that the earned-value picture and billing draw on.

import type { DayworkSheet, DayworkKind } from '../data/types';

export const DAYWORK_KIND_LABEL: Record<DayworkKind, string> = {
  labour: 'Labour', plant: 'Plant', material: 'Material',
};

export function resourceAmount(r: { qty: number; rate: number }): number {
  return (Number.isFinite(r.qty) ? r.qty : 0) * (Number.isFinite(r.rate) ? r.rate : 0);
}

/** Total value of one sheet (all resource lines). */
export function sheetTotal(sheet: Pick<DayworkSheet, 'resources'>): number {
  return sheet.resources.reduce((s, r) => s + resourceAmount(r), 0);
}

/** Per-category subtotals for one sheet. */
export function sheetCategoryTotals(sheet: Pick<DayworkSheet, 'resources'>): Record<DayworkKind, number> {
  const out: Record<DayworkKind, number> = { labour: 0, plant: 0, material: 0 };
  for (const r of sheet.resources) out[r.kind] += resourceAmount(r);
  return out;
}

/**
 * The validated dayworks value for a given BOQ line — only validated sheets count,
 * so a draft sheet never inflates the account before it is signed off.
 */
export function validatedDayworkValue(sheets: DayworkSheet[], boqItemId: string): number {
  return sheets
    .filter((s) => s.boqItemId === boqItemId && s.status === 'validated')
    .reduce((sum, s) => sum + sheetTotal(s), 0);
}

/** Map of boqItemId → validated dayworks value, for the whole project. */
export function dayworkValueByItem(sheets: DayworkSheet[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sheets) {
    if (s.status !== 'validated') continue;
    m.set(s.boqItemId, (m.get(s.boqItemId) ?? 0) + sheetTotal(s));
  }
  return m;
}

/** Project-wide totals: booked (all) vs validated, split by category. */
export function dayworkSummary(sheets: DayworkSheet[]): {
  booked: number; validated: number; draft: number;
  byCategory: Record<DayworkKind, number>; // validated only
  sheetCount: number; validatedCount: number;
} {
  let booked = 0, validated = 0;
  const byCategory: Record<DayworkKind, number> = { labour: 0, plant: 0, material: 0 };
  let validatedCount = 0;
  for (const s of sheets) {
    const t = sheetTotal(s);
    booked += t;
    if (s.status === 'validated') {
      validated += t; validatedCount += 1;
      const c = sheetCategoryTotals(s);
      byCategory.labour += c.labour; byCategory.plant += c.plant; byCategory.material += c.material;
    }
  }
  return { booked, validated, draft: booked - validated, byCategory, sheetCount: sheets.length, validatedCount };
}

/**
 * The dayworks amount already billed in IPCs for a line — the sum of IPC line
 * amounts booked against that BOQ item (every IPC, since a certified line stands).
 */
export function dayworkBilledByItem(ipcs: Array<{ lines?: Array<{ boqItemId: string; amount: number }> }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const ipc of ipcs) for (const l of ipc.lines ?? []) m.set(l.boqItemId, (m.get(l.boqItemId) ?? 0) + l.amount);
  return m;
}

export interface DayworkIpcLine {
  boqItemId: string;
  validated: number;   // validated dayworks value to date
  billed: number;      // already billed in prior IPCs
  pending: number;     // what this IPC would certify
}

/**
 * Dayworks ready to bill: for each dayworks BOQ line, the validated value not yet
 * certified in an IPC. These become IPC lines (qty 1 × the pending amount) so
 * dayworks flow through the measurement sheet, deduction waterfall and net exactly
 * like measured work — no special-casing downstream.
 */
export function dayworkBilling(
  sheets: DayworkSheet[],
  ipcs: Array<{ lines?: Array<{ boqItemId: string; amount: number }> }>,
  dayworkItemIds: Iterable<string>,
): DayworkIpcLine[] {
  const value = dayworkValueByItem(sheets);
  const billed = dayworkBilledByItem(ipcs);
  const out: DayworkIpcLine[] = [];
  for (const id of dayworkItemIds) {
    const validated = value.get(id) ?? 0;
    const already = billed.get(id) ?? 0;
    const pending = +(validated - already).toFixed(2);
    if (pending > 0.005) out.push({ boqItemId: id, validated, billed: already, pending });
  }
  return out;
}

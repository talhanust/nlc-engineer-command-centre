// Matching an uploaded contractor BOQ to the project's BOQ.
//
// A real BOQ item code is NOT unique. In the Margalla contractor BOQ, "401f"
// (Lean concrete) appears in seven different bills and "107a" (Structural
// excavation) in five — the same standard item priced separately under Box
// Culverts, Pipe Culverts, Retaining Walls, Bridges and Underpasses. The unique
// key is therefore BILL + CODE, and matching on code alone would silently
// collapse seven contract lines onto one BOQ item.
//
// So: match on bill+code when the sheet names a bill; fall back to code alone
// only when that code is unambiguous; and REPORT anything ambiguous rather than
// guessing, because a wrong quantity here becomes a wrong commitment.

import type { BoqItem } from '../data/types';

export interface SubletImportRow {
  bill: string;
  code: string;
  qty: number;
  rate: number;
  /** Optional tie-breaker: real sheets sometimes repeat a code WITHIN a bill
   *  (a mis-keyed code), and the description then tells the two rows apart. */
  description?: string;
}

export interface SubletMatch {
  boqItemId: string;
  qty: number;
  rate: number;
}

export interface SubletImportResult {
  matched: SubletMatch[];
  /** Rows the sheet cannot place on exactly one BOQ item. */
  ambiguous: Array<{ bill: string; code: string; candidates: number }>;
  /** Rows whose bill+code (or code) matched no BOQ item at all. */
  unmatched: Array<{ bill: string; code: string }>;
}

const key = (bill: string, code: string) => `${bill.trim().toLowerCase()}|${code.trim().toLowerCase()}`;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Narrow several candidate items to one by exact description, when possible. */
function byDescription(candidates: BoqItem[], description?: string): BoqItem | undefined {
  if (!description) return undefined;
  const hits = candidates.filter((c) => norm(c.description) === norm(description));
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Resolve uploaded rows against the project BOQ.
 * Rows with qty <= 0 are dropped (a contract line needs a quantity); a rate of 0
 * is allowed through so the caller can default it to the BOQ rate.
 */
export function matchSubletRows(rows: SubletImportRow[], items: BoqItem[]): SubletImportResult {
  // Both maps hold LISTS: a silent last-one-wins overwrite is exactly the bug
  // this module exists to prevent, so collisions must stay visible.
  const byBillCode = new Map<string, BoqItem[]>();
  const byCode = new Map<string, BoqItem[]>();
  for (const it of items) {
    const bc = key(it.billNo ?? '', it.code);
    byBillCode.set(bc, [...(byBillCode.get(bc) ?? []), it]);
    const c = it.code.trim().toLowerCase();
    byCode.set(c, [...(byCode.get(c) ?? []), it]);
  }

  const matched: SubletMatch[] = [];
  const ambiguous: SubletImportResult['ambiguous'] = [];
  const unmatched: SubletImportResult['unmatched'] = [];

  // An item may only be claimed by one uploaded row, so two rows sharing a
  // mis-keyed code cannot both land on it.
  const taken = new Set<string>();
  const pick = (candidates: BoqItem[], r: SubletImportRow): BoqItem | undefined => {
    // One candidate: unambiguous, whatever the description says.
    if (candidates.length === 1) return taken.has(candidates[0].id) ? undefined : candidates[0];
    // Several: the description must positively identify one of the free ones. We
    // never match by elimination — if the last free item contradicts the stated
    // description, that is a discrepancy to report, not a line to commit.
    return byDescription(candidates.filter((c) => !taken.has(c.id)), r.description);
  };

  for (const r of rows) {
    if (!r.code.trim() || r.qty <= 0) continue;
    let item: BoqItem | undefined;
    // 1. bill + code (+ description when that pair repeats).
    const billCandidates = r.bill.trim() ? (byBillCode.get(key(r.bill, r.code)) ?? []) : [];
    if (billCandidates.length) {
      item = pick(billCandidates, r);
      if (!item) { ambiguous.push({ bill: r.bill, code: r.code, candidates: billCandidates.length }); continue; }
    }
    if (!item) {
      // 2. Code alone — only when it identifies exactly one item.
      const candidates = byCode.get(r.code.trim().toLowerCase()) ?? [];
      if (candidates.length) {
        item = pick(candidates, r);
        if (!item) { ambiguous.push({ bill: r.bill, code: r.code, candidates: candidates.length }); continue; }
      }
    }
    if (!item) { unmatched.push({ bill: r.bill, code: r.code }); continue; }
    taken.add(item.id);
    matched.push({ boqItemId: item.id, qty: r.qty, rate: r.rate });
  }
  return { matched, ambiguous, unmatched };
}

/**
 * Pull contractor-BOQ rows out of a spreadsheet grid: find the header, locate the
 * bill/code/qty/rate/description columns, and carry the bill down (a BOQ groups
 * its rows under a bill heading, so only the first row of each group names it).
 * Shared by the create and revise flows so both read a sheet identically.
 */
export function parseSubletGrid(grid: string[][]): { rows: SubletImportRow[]; error?: string } {
  let headerRow = 0;
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const joined = (grid[i] ?? []).join(' ').toLowerCase();
    if (/code|item/.test(joined) && /(qty|quantity)/.test(joined)) { headerRow = i; break; }
  }
  const header = (grid[headerRow] ?? []).map((c) => c.toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const cCode = col('code', 'item');
  const cQty = col('qty', 'quantity');
  const cRate = col('rate', 'price');
  const cBill = col('bill');
  const cDesc = col('description', 'desc', 'particulars');
  if (cCode < 0 || cQty < 0) {
    return { rows: [], error: 'Could not find "code" and "quantity" columns in that file.' };
  }

  const num = (s: string): number => {
    const n = Number(String(s).replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  let currentBill = '';
  const rows: SubletImportRow[] = [];
  for (const g of grid.slice(headerRow + 1)) {
    if (cBill >= 0 && String(g[cBill] ?? '').trim()) currentBill = String(g[cBill]).trim();
    const code = String(g[cCode] ?? '').trim();
    if (!code) continue;
    rows.push({
      bill: currentBill, code,
      qty: num(String(g[cQty] ?? '')),
      rate: cRate >= 0 ? num(String(g[cRate] ?? '')) : 0,
      description: cDesc >= 0 ? String(g[cDesc] ?? '').trim() : undefined,
    });
  }
  return { rows };
}

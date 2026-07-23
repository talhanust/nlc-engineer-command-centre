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
import { similarity } from './scheduleDiff';

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

export type SkipReason = 'ambiguous' | 'not-in-boq' | 'no-quantity' | 'no-rate';

/** A row the importer did NOT take, with the money it carries. Import must be
 *  reconcilable to the last rupee, so every discarded row is reported with its
 *  value — a silently dropped provisional sum is how a contract ends up short. */
export interface SkippedRow {
  bill: string;
  code: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  reason: SkipReason;
  detail?: string;
}

/** Stable key for a sheet row, so a user's manual match survives a recompute. */
export function rowKey(r: { bill: string; code: string; description?: string }): string {
  return `${r.bill.trim().toLowerCase()}|${r.code.trim().toLowerCase()}|${(r.description ?? '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

export interface SubletImportResult {
  matched: SubletMatch[];
  /** Rows the sheet cannot place on exactly one BOQ item. */
  ambiguous: Array<{ bill: string; code: string; candidates: number }>;
  /** Rows whose bill+code (or code) matched no BOQ item at all. */
  unmatched: Array<{ bill: string; code: string }>;
  /** Every row not imported, with its amount and why. */
  skipped: SkippedRow[];
  /** Σ qty × rate over ALL rows read from the file — the control total. */
  fileValue: number;
  /** Σ qty × rate over the rows actually imported. */
  matchedValue: number;
  /** fileValue − matchedValue. Must be 0 for a clean import. */
  variance: number;
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
export function matchSubletRows(
  rows: SubletImportRow[],
  items: BoqItem[],
  /** Manual row → BOQ item decisions, keyed by rowKey(). A human choice is taken
   *  as given: it is the one source of truth the algorithm cannot second-guess. */
  resolutions?: Map<string, string>,
): SubletImportResult {
  // Both maps hold LISTS: a silent last-one-wins overwrite is exactly the bug
  // this module exists to prevent, so collisions must stay visible.
  const byBillCode = new Map<string, BoqItem[]>();
  const byCode = new Map<string, BoqItem[]>();
  const byBill = new Map<string, BoqItem[]>();
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const it of items) {
    const bc = key(it.billNo ?? '', it.code);
    byBillCode.set(bc, [...(byBillCode.get(bc) ?? []), it]);
    const c = it.code.trim().toLowerCase();
    byCode.set(c, [...(byCode.get(c) ?? []), it]);
    const b = (it.billNo ?? '').trim().toLowerCase();
    byBill.set(b, [...(byBill.get(b) ?? []), it]);
  }

  const matched: SubletMatch[] = [];
  const ambiguous: SubletImportResult['ambiguous'] = [];
  const unmatched: SubletImportResult['unmatched'] = [];
  const skipped: SkippedRow[] = [];
  let fileValue = 0;

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
    const amount = Math.max(0, r.qty) * Math.max(0, r.rate);
    fileValue += amount;
    const label = { bill: r.bill, code: r.code, description: r.description ?? '', qty: r.qty, rate: r.rate, amount };

    if (r.qty <= 0) { skipped.push({ ...label, reason: 'no-quantity' }); continue; }
    if (r.rate <= 0) { skipped.push({ ...label, reason: 'no-rate' }); continue; }

    let item: BoqItem | undefined;
    let wasAmbiguous = false;

    const chosen = resolutions?.get(rowKey(r));
    if (chosen) {
      const picked = itemById.get(chosen);
      if (picked && !taken.has(picked.id)) {
        taken.add(picked.id);
        matched.push({ boqItemId: picked.id, qty: r.qty, rate: r.rate });
        continue;
      }
    }

    if (r.code.trim()) {
      // 1. bill + code (+ description when that pair repeats).
      const billCandidates = r.bill.trim() ? (byBillCode.get(key(r.bill, r.code)) ?? []) : [];
      if (billCandidates.length) {
        item = pick(billCandidates, r);
        if (!item) wasAmbiguous = true;
      }
      if (!item && !wasAmbiguous) {
        // 2. Code alone — only when it identifies exactly one item.
        const candidates = byCode.get(r.code.trim().toLowerCase()) ?? [];
        if (candidates.length) {
          item = pick(candidates, r);
          if (!item) wasAmbiguous = true;
        }
      }
    }

    // 3. No code (or code found nothing): match on description. A provisional or
    //    lump sum legitimately carries no item code, and dropping it because of
    //    that is how a whole sum goes missing from a contract.
    if (!item && !wasAmbiguous && r.description) {
      const inBill = r.bill.trim() ? (byBill.get(r.bill.trim().toLowerCase()) ?? []) : [];
      item = byDescription(inBill.filter((c) => !taken.has(c.id)), r.description)
        ?? byDescription(items.filter((c) => !taken.has(c.id)), r.description);
    }

    if (wasAmbiguous) {
      const n = (byBillCode.get(key(r.bill, r.code)) ?? byCode.get(r.code.trim().toLowerCase()) ?? []).length;
      ambiguous.push({ bill: r.bill, code: r.code, candidates: n });
      skipped.push({ ...label, reason: 'ambiguous', detail: `${n} BOQ items share this code` });
      continue;
    }
    if (!item) {
      unmatched.push({ bill: r.bill, code: r.code });
      skipped.push({ ...label, reason: 'not-in-boq', detail: r.code.trim() ? undefined : 'no item code — matched on description, which found nothing' });
      continue;
    }
    taken.add(item.id);
    matched.push({ boqItemId: item.id, qty: r.qty, rate: r.rate });
  }

  const matchedValue = matched.reduce((s, m) => s + m.qty * m.rate, 0);
  return { matched, ambiguous, unmatched, skipped, fileValue, matchedValue, variance: fileValue - matchedValue };
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
    const description = cDesc >= 0 ? String(g[cDesc] ?? '').trim() : '';
    const qty = num(String(g[cQty] ?? ''));
    const rate = cRate >= 0 ? num(String(g[cRate] ?? '')) : 0;
    // Keep a row that carries money even without an item code — provisional and
    // lump sums are real BOQ lines. Drop only true headings/blanks: nothing to
    // identify it by, or nothing priced.
    if (!code && !description) continue;
    if (qty <= 0 && rate <= 0) continue;
    rows.push({
      bill: currentBill, code, qty, rate,
      description: description || undefined,
    });
  }
  return { rows };
}

/**
 * Candidate BOQ items for a row the importer could not place.
 *
 * A contractor's sheet and the client's BOQ describe the same work in different
 * words: "Toll Plaza" against "Remodeling of Toll Plaza". Exact description
 * matching misses that, and fuzzy matching that decides for itself is worse — a
 * wrong guess here becomes a committed quantity at a committed rate.
 *
 * So the importer suggests and the user confirms. Candidates are ranked by
 * description similarity, with a nudge for sharing the row's bill, and each is
 * returned with its BOQ amount so the choice can be sanity-checked against the
 * money rather than the wording alone.
 */
export interface BoqCandidate {
  item: BoqItem;
  score: number;
  sameBill: boolean;
}

export function suggestBoqMatches(
  row: { bill: string; code: string; description?: string },
  items: BoqItem[],
  limit = 5,
): BoqCandidate[] {
  const text = (row.description ?? '').trim() || row.code.trim();
  if (!text) return [];
  const rowBill = row.bill.trim().toLowerCase();

  return items
    .map((item) => {
      const sameBill = !!rowBill && (item.billNo ?? '').trim().toLowerCase() === rowBill;
      const byDesc = similarity(text, item.description ?? '');
      const byCode = row.code.trim() ? similarity(row.code, item.code ?? '') : 0;
      // Description carries the meaning; a shared bill is corroboration, not proof.
      const score = Math.max(byDesc, byCode * 0.8) + (sameBill ? 0.15 : 0);
      return { item, score, sameBill };
    })
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

import type { BoqItem, BoqWbsLink, ScheduleActivity } from '../data/types';
import { linksByItem } from './mapping';

/**
 * BOQ ↔ WBS auto-suggestion engine (req 3a(2)). Scores each (item, activity)
 * pair on token overlap between the item's description/bill/section and the
 * activity's name/WBS, with light domain synonyms. Suggestions are emitted as
 * confidence:'auto' links that a named user must confirm or reject in the
 * review queue before they take part in derived progress.
 */

const STOP = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'work', 'works', 'etc', 'all', 'with', 'incl', 'including']);

/** Domain synonyms: map variants to a canonical token so 'earthwork'≈'excavation'. */
const SYNONYM: Record<string, string> = {
  earthworks: 'earthwork', excavation: 'earthwork', grading: 'earthwork', grubbing: 'earthwork', clearing: 'earthwork', filling: 'earthwork', embankment: 'earthwork',
  'sub-base': 'subbase', base: 'subbase', aggregate: 'subbase',
  asphalt: 'surfacing', bitumen: 'surfacing', bituminous: 'surfacing', carpet: 'surfacing', wearing: 'surfacing',
  sewer: 'sewerage', sewers: 'sewerage', drain: 'drainage', drains: 'drainage', storm: 'drainage', culvert: 'drainage', culverts: 'drainage',
  water: 'water', pipeline: 'water',
  electric: 'electrical', electrification: 'electrical', lighting: 'electrical',
  mobilisation: 'mobilization',
  demolition: 'demolition', dismantling: 'demolition',
};

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9-]+/)) {
    if (!raw || raw.length < 3 || STOP.has(raw)) continue;
    out.add(SYNONYM[raw] ?? raw);
  }
  return out;
}

/** A token shared only via the item's bill/section is weak evidence: everything
 *  in an "Earthworks" bill shares that word. Description matches carry full
 *  weight, context matches a fraction, so a bill name alone can never trigger a
 *  suggestion on its own. */
const CONTEXT_WEIGHT = 0.4;

/**
 * Similarity 0..1 between a BOQ item and an activity. A P6 import gives us more
 * than the activity name: the readable WBS path and the RESOURCE NAMES assigned
 * to the activity ("Clearing & grubbing") are often a closer match to the BOQ
 * description than the activity title is, so they all feed the activity's tokens.
 */
export function matchScore(item: BoqItem, act: ScheduleActivity): number {
  const desc = tokens(item.description);
  const context = tokens(`${item.billName} ${item.section}`);
  const b = tokens(`${act.name} ${act.wbs} ${act.wbsPath ?? ''} ${(act.resourceNames ?? []).join(' ')}`);
  if ((desc.size === 0 && context.size === 0) || b.size === 0) return 0;
  let hit = 0;
  for (const t of b) {
    if (desc.has(t)) hit += 1;
    else if (context.has(t)) hit += CONTEXT_WEIGHT;
  }
  const denom = Math.min(desc.size + context.size, b.size);
  return denom > 0 ? Math.min(1, hit / denom) : 0;
}

export interface WbsSuggestion {
  link: BoqWbsLink;
  score: number;
  activityName: string;
}

/**
 * Best-activity suggestion for every currently-unmapped item, above `threshold`.
 * Returned links carry confidence:'auto' (pending review).
 */
export function suggestWbsLinks(
  items: BoqItem[],
  acts: ScheduleActivity[],
  existing: BoqWbsLink[],
  threshold = 0.34,
): WbsSuggestion[] {
  const by = linksByItem(existing);
  const out: WbsSuggestion[] = [];
  for (const item of items) {
    if (by.get(item.id)?.length) continue; // only unmapped items
    let best: ScheduleActivity | null = null;
    let bestScore = 0;
    for (const act of acts) {
      if (act.isMilestone) continue;
      const s = matchScore(item, act);
      if (s > bestScore) { bestScore = s; best = act; }
    }
    if (best && bestScore >= threshold) {
      out.push({
        link: { boqItemId: item.id, projectId: item.projectId, activityId: best.activityId, confidence: 'auto' },
        score: +bestScore.toFixed(2),
        activityName: best.name,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---- Quantity-allocated suggestions ----

export interface AllocationProposal {
  activityId: string;
  activityName: string;
  score: number;
  /** Proposed quantity of the item to execute under this activity. */
  qty: number;
}
export interface ItemProposal {
  boqItemId: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  /** Quantity that was available to allocate (the item's free quantity). */
  availableQty: number;
  allocations: AllocationProposal[];
}

/**
 * Distribute `total` across `weights` so the parts sum EXACTLY to the total.
 * Largest-remainder: floor each share to `dp` decimals, then hand the rounding
 * crumbs to the biggest fractional parts. Without this, twelve activities each
 * rounded down leave a phantom unallocated remainder that looks like an error.
 */
export function distribute(total: number, weights: number[], dp = 2): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const step = 10 ** dp;
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((v) => Math.floor(v * step) / step);
  let remainder = Math.round((total - floors.reduce((s, v) => s + v, 0)) * step);
  const order = exact
    .map((v, i) => ({ i, frac: v * step - Math.floor(v * step) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; remainder > 0 && k < order.length * 2; k++) {
    out[order[k % order.length].i] = Math.round((out[order[k % order.length].i] + 1 / step) * step) / step;
    remainder--;
  }
  return out;
}

export interface SuggestOptions {
  /** Minimum similarity for an activity to be considered. */
  threshold?: number;
  /** Most activities one BOQ item may be split across. */
  maxPerItem?: number;
  /** Decimal places for allocated quantities. */
  dp?: number;
}

/**
 * Propose, for every unmapped BOQ item, WHICH activities consume it and HOW MUCH
 * of it each one takes.
 *
 * The split is weighted by match score × activity duration: a thirty-day activity
 * that mentions the item plausibly executes more of it than a three-day one. This
 * is a starting point for a human, not a decision — every proposal is emitted as
 * confidence:'auto' and takes no part in derived progress until a named user
 * confirms it.
 */
export function suggestAllocations(
  items: BoqItem[],
  acts: ScheduleActivity[],
  existing: BoqWbsLink[],
  { threshold = 0.34, maxPerItem = 3, dp = 2 }: SuggestOptions = {},
): ItemProposal[] {
  const by = linksByItem(existing);
  const candidates = acts.filter((a) => !a.isMilestone);
  const out: ItemProposal[] = [];

  for (const item of items) {
    if (by.get(item.id)?.length) continue;   // never touch an item a human already mapped
    if (item.qty <= 0) continue;

    const scored = candidates
      .map((a) => ({ act: a, score: matchScore(item, a) }))
      .filter((c) => c.score >= threshold)
      .sort((x, y) => y.score - x.score || x.act.activityId.localeCompare(y.act.activityId))
      .slice(0, maxPerItem);
    if (scored.length === 0) continue;

    // Weight by confidence AND by how much work the activity represents.
    const weights = scored.map((c) => c.score * Math.max(c.act.originalDurationDays ?? c.act.durationDays ?? 1, 1));
    const qtys = distribute(item.qty, weights, dp);

    out.push({
      boqItemId: item.id,
      itemCode: item.code,
      itemDescription: item.description,
      unit: item.unit,
      availableQty: item.qty,
      allocations: scored.map((c, i) => ({
        activityId: c.act.activityId,
        activityName: c.act.name,
        score: +c.score.toFixed(2),
        qty: qtys[i],
      })).filter((a) => a.qty > 0),
    });
  }
  return out.sort((a, b) => (b.allocations[0]?.score ?? 0) - (a.allocations[0]?.score ?? 0));
}

/** Flatten proposals into the auto links a review queue will confirm or reject. */
export function proposalsToLinks(proposals: ItemProposal[], projectId: string): BoqWbsLink[] {
  return proposals.flatMap((p) =>
    p.allocations.map((a) => ({
      boqItemId: p.boqItemId, projectId, activityId: a.activityId, confidence: 'auto' as const, qty: a.qty,
    })),
  );
}

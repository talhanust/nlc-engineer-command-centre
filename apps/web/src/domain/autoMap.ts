// Suggests BOQ → schedule-activity (WBS) links by token similarity, so a freshly
// imported Primavera plan can be mapped to the commercial BOQ in one click instead
// of item-by-item. Suggestions are advisory (confidence 'auto'); the engineer
// confirms or overrides them in the Mapping tab.
import type { BoqItem, ScheduleActivity, BoqWbsLink } from '../data/types';

const STOP = new Set([
  'the', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'at', 'a', 'an', 'as',
  'works', 'work', 'item', 'items', 'including', 'incl', 'etc', 'misc', 'all',
  'per', 'no', 'nos', 'rate', 'supply', 'supplying', 'providing', 'provide',
  'laying', 'lay', 'complete', 'completed', 'job', 'cum', 'sqm', 'rft', 'm', 'mm',
]);

function tokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Weighted overlap of two token bags (shared / smaller bag), 0..1. */
function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bset = new Set(b);
  let shared = 0;
  const seen = new Set<string>();
  for (const t of a) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (bset.has(t)) shared += 1;
  }
  return shared / Math.min(seen.size, new Set(b).size);
}

export interface MapSuggestion {
  boqItemId: string;
  activityId: string;
  activityName: string;
  score: number;
}

/**
 * Best-activity-per-BOQ-item suggestions above `threshold` (default 0.34).
 * `activity` token bag combines its name and WBS path; `item` combines code +
 * description. Items already present in `existing` are skipped.
 */
export function suggestWbsLinks(
  items: BoqItem[],
  activities: ScheduleActivity[],
  existing: BoqWbsLink[] = [],
  threshold = 0.34,
): MapSuggestion[] {
  const taken = new Set(existing.map((l) => l.boqItemId));
  const acts = activities.map((a) => ({ a, tok: tokens(`${a.name} ${a.wbs}`) }));
  const out: MapSuggestion[] = [];
  for (const it of items) {
    if (taken.has(it.id)) continue;
    const itTok = tokens(`${it.code} ${it.description}`);
    let best: MapSuggestion | null = null;
    for (const { a, tok } of acts) {
      const score = similarity(itTok, tok);
      if (score > 0 && (!best || score > best.score)) {
        best = { boqItemId: it.id, activityId: a.activityId, activityName: a.name, score: +score.toFixed(3) };
      }
    }
    if (best && best.score >= threshold) out.push(best);
  }
  return out;
}

/** Materialise suggestions as 'auto' BoqWbsLinks for a given project. */
export function suggestionsToLinks(projectId: string, suggestions: MapSuggestion[]): BoqWbsLink[] {
  return suggestions.map((s) => ({
    boqItemId: s.boqItemId,
    projectId,
    activityId: s.activityId,
    confidence: 'auto' as const,
  }));
}

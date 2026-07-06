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

/** Similarity 0..1 between a BOQ item and an activity (token Jaccard over name fields). */
export function matchScore(item: BoqItem, act: ScheduleActivity): number {
  const a = tokens(`${item.description} ${item.billName} ${item.section}`);
  const b = tokens(`${act.name} ${act.wbs}`);
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of b) if (a.has(t)) hit += 1;
  return hit / Math.min(a.size, b.size);
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

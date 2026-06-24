// Critical Path Method over the imported schedule. Uses each activity's duration
// and its predecessor codes (from Primavera TASKPRED) to run a forward pass
// (early start/finish) and backward pass (late start/finish), then total float =
// LS − ES. Activities with ~zero float are on the critical path. Topological
// ordering tolerates the activities arriving in any order; cycles are broken
// defensively so a malformed plan can't hang the UI.
import type { ScheduleActivity } from '../data/types';

export interface CpmNode {
  activityId: string;
  es: number; ef: number; ls: number; lf: number;
  totalFloat: number;
  critical: boolean;
}
export interface CriticalPath {
  nodes: Map<string, CpmNode>;
  projectDuration: number;
  criticalIds: Set<string>;
  hasNetwork: boolean; // any predecessor relationships present
}

/** Kahn topological order; leftover (cyclic) nodes are appended in input order. */
function topoOrder(ids: string[], preds: Map<string, string[]>): string[] {
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const id of ids) {
    for (const p of preds.get(id) ?? []) {
      if (!indeg.has(p)) continue;
      indeg.set(id, (indeg.get(id) ?? 0) + 1);
      succ.get(p)!.push(id);
    }
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id); order.push(id);
    for (const s of succ.get(id) ?? []) {
      indeg.set(s, (indeg.get(s) ?? 0) - 1);
      if ((indeg.get(s) ?? 0) <= 0) queue.push(s);
    }
  }
  for (const id of ids) if (!seen.has(id)) order.push(id); // cyclic remainder
  return order;
}

export function criticalPath(activities: ScheduleActivity[], floatTolerance = 0): CriticalPath {
  const ids = activities.map((a) => a.activityId);
  const dur = new Map(activities.map((a) => [a.activityId, Math.max(0, a.durationDays)]));
  const preds = new Map(activities.map((a) => [a.activityId, (a.predecessors ?? []).filter((p) => dur.has(p))]));
  const hasNetwork = activities.some((a) => (a.predecessors ?? []).length > 0);

  const order = topoOrder(ids, preds);
  const es = new Map<string, number>(), ef = new Map<string, number>();
  // Forward pass
  for (const id of order) {
    const start = Math.max(0, ...(preds.get(id) ?? []).map((p) => ef.get(p) ?? 0));
    es.set(id, start);
    ef.set(id, start + (dur.get(id) ?? 0));
  }
  const projectDuration = Math.max(0, ...ids.map((id) => ef.get(id) ?? 0));

  // Successor map for the backward pass
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const id of ids) for (const p of preds.get(id) ?? []) succ.get(p)?.push(id);

  const lf = new Map<string, number>(), ls = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const succs = succ.get(id) ?? [];
    const finish = succs.length ? Math.min(...succs.map((s) => ls.get(s) ?? projectDuration)) : projectDuration;
    lf.set(id, finish);
    ls.set(id, finish - (dur.get(id) ?? 0));
  }

  const nodes = new Map<string, CpmNode>();
  const criticalIds = new Set<string>();
  for (const id of ids) {
    const tf = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    const critical = hasNetwork && tf <= floatTolerance;
    nodes.set(id, { activityId: id, es: es.get(id) ?? 0, ef: ef.get(id) ?? 0, ls: ls.get(id) ?? 0, lf: lf.get(id) ?? 0, totalFloat: tf, critical });
    if (critical) criticalIds.add(id);
  }
  return { nodes, projectDuration, criticalIds, hasNetwork };
}

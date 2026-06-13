import type { OrgNode, HrPosting } from '../data/types';
import { childrenOf, nodeById } from './org';

/** All node ids strictly under `id` (excludes the node itself). */
export function descendantNodeIds(nodes: OrgNode[], id: string): string[] {
  const out: string[] = [];
  for (const child of childrenOf(nodes, id)) {
    out.push(child.id, ...descendantNodeIds(nodes, child.id));
  }
  return out;
}

export interface HrTotals { posted: number; sanctioned: number }

function sum(hr: HrPosting[], nodeIds: Set<string>): HrTotals {
  let posted = 0, sanctioned = 0;
  for (const h of hr) {
    if (nodeIds.has(h.nodeId)) { posted += h.posted; sanctioned += h.sanctioned; }
  }
  return { posted, sanctioned };
}

export interface HrRollup {
  own: HrTotals;
  descendants: HrTotals;
  rolled: HrTotals;     // what the node reports up
  excludesOwn: boolean; // true at HQ NLC: own is shown but not rolled up
}

/**
 * Roll-up rules:
 * - Project / HQ PD / HQ Engrs: rolled = own + descendants.
 * - HQ NLC (top, type 'hq'): own is shown but EXCLUDED from the roll-up.
 */
export function hrRollup(nodes: OrgNode[], hr: HrPosting[], id: string): HrRollup {
  const node = nodeById(nodes, id);
  const own = sum(hr, new Set([id]));
  const descendants = sum(hr, new Set(descendantNodeIds(nodes, id)));
  const excludesOwn = node?.type === 'hq';
  const rolled = excludesOwn
    ? descendants
    : { posted: own.posted + descendants.posted, sanctioned: own.sanctioned + descendants.sanctioned };
  return { own, descendants, rolled, excludesOwn };
}

/** Posted/sanctioned grouped by category for a set of nodes. */
export function hrByCategory(hr: HrPosting[], nodeIds: string[]): Array<{ category: string } & HrTotals> {
  const set = new Set(nodeIds);
  const byCat = new Map<string, HrTotals>();
  for (const h of hr) {
    if (!set.has(h.nodeId)) continue;
    const cur = byCat.get(h.category) ?? { posted: 0, sanctioned: 0 };
    cur.posted += h.posted; cur.sanctioned += h.sanctioned;
    byCat.set(h.category, cur);
  }
  return [...byCat.entries()].map(([category, t]) => ({ category, ...t }));
}

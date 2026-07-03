import type { HrUnit, OrgNode } from '../data/types';
import { bandForScale } from './hrcost';

/**
 * Manpower cost roll-up (req 3d(2)) — the organisation's defined rule:
 *   project level        → the project's own HR;
 *   HQ-PD level          → its own HR PLUS its projects';
 *   HQ-Engrs level       → its own HR PLUS everything below;
 *   top HQ level         → shown, but EXCLUDING its own HR (children only).
 * Cost per seat comes from the establishment pay bands (held basis).
 */

export interface NodeHrCost {
  nodeId: string;
  own: number;        // this node's own establishment, monthly
  fromChildren: number;
  total: number;      // per the rule above
}

/** Monthly cost of one establishment unit (held seats × pay band). */
export function unitMonthly(u: HrUnit): number {
  return u.held * bandForScale(u.scale);
}

/** Σ monthly cost of a node's own establishment. */
export function nodeOwnHrMonthly(units: HrUnit[], nodeId: string): number {
  return units.filter((u) => u.nodeId === nodeId).reduce((s, u) => s + unitMonthly(u), 0);
}

/** Apply the four-level rule across the whole org tree. */
export function hrCostRollup(nodes: OrgNode[], units: HrUnit[]): Map<string, NodeHrCost> {
  const childrenOf = new Map<string, OrgNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n);
    childrenOf.set(n.parentId, arr);
  }
  const out = new Map<string, NodeHrCost>();
  const visit = (n: OrgNode): NodeHrCost => {
    const cached = out.get(n.id);
    if (cached) return cached;
    const own = nodeOwnHrMonthly(units, n.id);
    const fromChildren = (childrenOf.get(n.id) ?? []).reduce((s, c) => s + visit(c).total, 0);
    // The rule: top HQ reports children only; every other level includes its own HR.
    const total = n.type === 'hq' ? fromChildren : own + fromChildren;
    const row = { nodeId: n.id, own, fromChildren, total };
    out.set(n.id, row);
    return row;
  };
  for (const n of nodes) visit(n);
  return out;
}

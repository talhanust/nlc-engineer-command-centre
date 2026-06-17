import type { HrUnit, HrPosting, OrgNode } from '../data/types';

export interface OrgoNode extends HrUnit {
  children: OrgoNode[];
  depth: number;
}

export interface Strength { auth: number; held: number }

/** Build the establishment tree (roots first), sorted by `order`. */
export function buildOrganogram(units: HrUnit[]): OrgoNode[] {
  const byId = new Map<string, OrgoNode>();
  units.forEach((u) => byId.set(u.id, { ...u, children: [], depth: 0 }));
  const roots: OrgoNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: OrgoNode[], depth: number) => {
    list.sort((a, b) => a.order - b.order);
    for (const n of list) { n.depth = depth; sortRec(n.children, depth + 1); }
  };
  sortRec(roots, 0);
  return roots;
}

/**
 * Rolled strength for a subtree. Leaves contribute their own auth/held; a unit
 * with children reports the sum of its descendants (so section boxes total
 * their posts without double-counting the section row itself).
 */
export function rolledStrength(node: OrgoNode): Strength {
  if (node.children.length === 0) return { auth: node.auth, held: node.held };
  return node.children.reduce<Strength>((acc, c) => {
    const s = rolledStrength(c);
    return { auth: acc.auth + s.auth, held: acc.held + s.held };
  }, { auth: 0, held: 0 });
}

/** Total establishment strength across all leaf posts. */
export function establishmentTotals(roots: OrgoNode[]): Strength {
  return roots.reduce<Strength>((acc, r) => {
    const s = rolledStrength(r);
    return { auth: acc.auth + s.auth, held: acc.held + s.held };
  }, { auth: 0, held: 0 });
}

export type FillStatus = 'ok' | 'warn' | 'crit';

/** Fill status by held/auth ratio. Defaults: ≥90% ok, ≥75% warn, else crit. */
export function fillStatus(held: number, auth: number, warnAt = 0.75, okAt = 0.9): FillStatus {
  if (auth <= 0) return 'ok';
  const r = held / auth;
  if (r >= okAt) return 'ok';
  if (r >= warnAt) return 'warn';
  return 'crit';
}

export function fillPct(held: number, auth: number): number {
  if (auth <= 0) return 0;
  return Math.round((held / auth) * 100);
}

/**
 * Fallback organogram synthesised from category postings, so every tier shows
 * an establishment even before a detailed TO&E is authored: a head box per node
 * with one child box per category.
 */
export function organogramFromPostings(node: OrgNode, postings: HrPosting[]): HrUnit[] {
  const head: HrUnit = {
    id: `syn-${node.id}-head`, nodeId: node.id, parentId: null,
    title: node.name, auth: 0, held: 0, order: 0,
  };
  const kids: HrUnit[] = postings.map((p, i) => ({
    id: `syn-${node.id}-${i}`, nodeId: node.id, parentId: head.id,
    title: p.category, category: p.category, auth: p.sanctioned, held: p.posted, order: i + 1,
  }));
  return [head, ...kids];
}

/** The chain of single-child units at the top (e.g. Director → Deputy). */
export function commandSpine(roots: OrgoNode[]): { spine: OrgoNode[]; fanout: OrgoNode | null } {
  const spine: OrgoNode[] = [];
  if (roots.length !== 1) return { spine, fanout: roots[0] ?? null };
  let cur: OrgoNode | null = roots[0];
  while (cur && cur.children.length === 1) { spine.push(cur); cur = cur.children[0]; }
  if (cur) spine.push(cur);
  return { spine, fanout: cur };
}

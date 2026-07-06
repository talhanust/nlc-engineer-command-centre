import { OrgNode, Project } from '../data/types';
import { childrenOf, descendantProjectIds, nodeById } from './org';
import { sumMoney, toNum } from './money';

export type Rag = 'green' | 'amber' | 'red';

/** Slippage thresholds (actual% − planned%). Made adjustable in a later issue. */
export const DEFAULT_RAG = { amberAt: -2, redAt: -10 };

export function ragForSlippage(slippage: number, t = DEFAULT_RAG): Rag {
  if (slippage <= t.redAt) return 'red';
  if (slippage <= t.amberAt) return 'amber';
  return 'green';
}

export interface Aggregate {
  contractValue: number;
  billed: number;
  received: number;
  /** Contract-value-weighted planned/actual progress, matching the prototype. */
  plannedPct: number;
  actualPct: number;
  slippage: number;
  rag: Rag;
  projectCount: number;
}

export interface RollupRow extends Aggregate {
  id: string;
  name: string;
  type: OrgNode['type'];
}

export interface Rollup {
  node: OrgNode;
  totals: Aggregate;
  children: RollupRow[];
}

function aggregateProjects(projects: Project[], t = DEFAULT_RAG): Aggregate {
  const contractValue = sumMoney(projects.map((p) => p.contractValue));
  const billed = sumMoney(projects.map((p) => p.billedToDate));
  const received = sumMoney(projects.map((p) => p.receivedToDate));
  // Weight progress by contract value (a 50 Cr project moves the needle more
  // than a 5 Cr one) — the same weighting the prototype's S-curve uses.
  const w = contractValue || 1;
  const plannedPct = projects.reduce((a, p) => a + toNum(p.contractValue) * p.plannedPct, 0) / w;
  const actualPct = projects.reduce((a, p) => a + toNum(p.contractValue) * p.actualPct, 0) / w;
  const slippage = actualPct - plannedPct;
  return {
    contractValue, billed, received,
    plannedPct, actualPct, slippage,
    rag: ragForSlippage(slippage, t),
    projectCount: projects.length,
  };
}

/**
 * computeNodeRollup — the access-scoped command-dashboard data for a node.
 * Totals aggregate over all descendant projects; child rows give per-child
 * subtotals (recursively for branch children, the project itself for leaves).
 * Pass an `accessibleProjectIds` set to scope (api mode); omit in local mode.
 */
export function computeNodeRollup(
  nodes: OrgNode[],
  projects: Project[],
  nodeId: string,
  opts: { accessibleProjectIds?: Set<string>; rag?: typeof DEFAULT_RAG } = {},
): Rollup | null {
  const node = nodeById(nodes, nodeId);
  if (!node) return null;
  const t = opts.rag ?? DEFAULT_RAG;

  const visible = (ids: string[]): Project[] =>
    ids
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is Project => !!p && (!opts.accessibleProjectIds || opts.accessibleProjectIds.has(p.id)));

  const totals = aggregateProjects(visible(descendantProjectIds(nodes, nodeId)), t);

  const children: RollupRow[] = childrenOf(nodes, nodeId).map((c) => {
    const agg = aggregateProjects(visible(descendantProjectIds(nodes, c.id)), t);
    return { ...agg, id: c.id, name: c.name, type: c.type };
  });

  return { node, totals, children };
}

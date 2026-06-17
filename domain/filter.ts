import { OrgNode, Project } from '../data/types';
import { nodeById } from './org';
import { ragForSlippage, type Rag } from './rollup';
import type { Filter, RagThresholds } from '../state/UiState';

export function clientsOf(projects: Project[]): string[] {
  return Array.from(new Set(projects.map((p) => p.clientName))).sort();
}

/** Project-level RAG, computed from the project's OWN slippage. */
export function projectRag(p: Project, t: RagThresholds): Rag {
  return ragForSlippage(p.actualPct - p.plannedPct, t);
}

/**
 * Filter the project set for true re-aggregation. The RAG filter uses the
 * PROJECT's own slippage (projectRag) — not the node roll-up's RAG — which
 * sidesteps the recursion the prototype warned about (node RAG depends on the
 * aggregate, which depends on the filtered set, which would depend on RAG…).
 */
export function applyFilter(
  projects: Project[],
  nodes: OrgNode[],
  filter: Filter,
  ragT: RagThresholds,
): Project[] {
  const q = filter.search.trim().toLowerCase();
  return projects.filter((p) => {
    if (filter.client !== 'all' && p.clientName !== filter.client) return false;
    if (filter.rag !== 'all' && projectRag(p, ragT) !== filter.rag) return false;
    if (q) {
      const name = nodeById(nodes, p.id)?.name ?? '';
      const hay = `${name} ${p.clientName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

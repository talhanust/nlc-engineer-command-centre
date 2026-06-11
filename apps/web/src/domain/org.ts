import { OrgNode } from '../data/types';

export function nodeById(nodes: OrgNode[], id: string): OrgNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function childrenOf(nodes: OrgNode[], id: string): OrgNode[] {
  return nodes.filter((n) => n.parentId === id);
}

/** Ancestor chain from root → node (inclusive), for breadcrumbs. */
export function ancestorsOf(nodes: OrgNode[], id: string): OrgNode[] {
  const chain: OrgNode[] = [];
  let cur = nodeById(nodes, id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? nodeById(nodes, cur.parentId) : undefined;
  }
  return chain;
}

/** All project-leaf ids at or under a node (the node itself if it's a project). */
export function descendantProjectIds(nodes: OrgNode[], id: string): string[] {
  const start = nodeById(nodes, id);
  if (!start) return [];
  if (start.type === 'project') return [start.id];
  const out: string[] = [];
  for (const child of childrenOf(nodes, id)) {
    out.push(...descendantProjectIds(nodes, child.id));
  }
  return out;
}

export const isBranch = (n: OrgNode): boolean => n.type !== 'project';

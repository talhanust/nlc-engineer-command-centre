// The global Attention system.
//
// Every project computes its own commercial/schedule alerts. A commander does not
// want to open forty projects to find the three on fire — they want the alerts for
// everything UNDER THEIR COMMAND, in one place, worst first, each a deep link to
// the fix. So attention rolls UP the org tree: a project shows its own alerts; a
// PD HQ shows every alert across the projects it commands; HQ Engineers and HQ NLC
// aggregate their whole subtree.
//
// This module is pure: it turns raw per-project data + the node tree into a ranked,
// project-tagged alert list for any node. Loading the data is the provider's job.

import { commercialAlerts, mergeAlertStates, activeAlerts, type TriagedAlert } from './alerts';
import { activityDerivedProgress, divergenceAlerts, unmappedBoqAlert } from './derivedProgress';
import type {
  OrgNode, Ipc, Rar, Epc, Distribution, BoqItem, Subcontractor, BankGuarantee,
  BoqWbsLink, ScheduleActivity, ProgressUpdate, AlertState,
} from '../data/types';

/** Everything needed to compute one project's alerts. */
export interface ProjectAlertInputs {
  projectId: string;
  ipcs: Ipc[];
  rars: Rar[];
  epcs: Epc[];
  dists: Distribution[];
  boq: BoqItem[];
  subs: Subcontractor[];
  bgs: BankGuarantee[];
  links: BoqWbsLink[];
  sched: ScheduleActivity[];
  progress: ProgressUpdate[];
  divergenceTolerancePct?: number;
  states: AlertState[];
}

/**
 * The active, triaged alerts for a single project — the exact set its own banner
 * shows, so the roll-up and the per-project view can never disagree.
 */
export function projectActiveAlerts(input: ProjectAlertInputs, today = new Date()): TriagedAlert[] {
  const base = commercialAlerts({
    ipcs: input.ipcs, rars: input.rars, epcs: input.epcs, dists: input.dists,
    boq: input.boq, subs: input.subs, bgs: input.bgs, today,
  });
  const rows = activityDerivedProgress(input.sched, input.boq, input.links, input.progress, today.toISOString().slice(0, 10));
  const dv = divergenceAlerts(rows, input.divergenceTolerancePct ?? 10);
  const um = unmappedBoqAlert(input.boq, input.links);
  return activeAlerts(mergeAlertStates([...base, ...dv, ...(um ? [um] : [])], input.states));
}

/** An alert tagged with the project it belongs to — what a roll-up returns. */
export interface AttentionItem extends TriagedAlert {
  projectId: string;
  projectName: string;
}

export interface AttentionRollup {
  nodeId: string;
  /** Direct descendant projects contributing (for the "N projects" summary). */
  projectCount: number;
  /** Projects that actually have at least one active alert. */
  affectedProjects: number;
  items: AttentionItem[];
  critical: number;
  warning: number;
  total: number;
  /** Per-project breakdown, worst first — the level-wise view. */
  byProject: Array<{ projectId: string; projectName: string; critical: number; warning: number; total: number }>;
}

/** All project nodes at or under a node (the node itself if it is a project). */
export function projectsUnder(nodeId: string, nodes: OrgNode[]): OrgNode[] {
  const childrenOf = new Map<string, OrgNode[]>();
  for (const n of nodes) {
    if (n.parentId) childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
  }
  const start = nodes.find((n) => n.id === nodeId);
  if (!start) return [];
  if (start.type === 'project') return [start];

  const out: OrgNode[] = [];
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.type === 'project') { out.push(cur); continue; }
    for (const c of childrenOf.get(cur.id) ?? []) stack.push(c);
  }
  return out;
}

/**
 * Roll the given projects' alerts up to a node. `alertsByProject` is the already-
 * computed active alerts for each project id (the provider loads these); this keeps
 * the aggregation pure and cheap to test.
 */
export function rollUpAttention(
  nodeId: string,
  nodes: OrgNode[],
  alertsByProject: Map<string, TriagedAlert[]>,
): AttentionRollup {
  const projects = projectsUnder(nodeId, nodes);
  const nameOf = new Map(projects.map((p) => [p.id, p.name]));

  const items: AttentionItem[] = [];
  const byProject: AttentionRollup['byProject'] = [];

  for (const proj of projects) {
    const alerts = alertsByProject.get(proj.id) ?? [];
    let c = 0, w = 0;
    for (const a of alerts) {
      items.push({ ...a, projectId: proj.id, projectName: proj.name });
      if (a.severity === 'critical') c += 1; else w += 1;
    }
    if (alerts.length > 0) byProject.push({ projectId: proj.id, projectName: proj.name, critical: c, warning: w, total: alerts.length });
  }

  // Worst first, then by project name so the list is stable.
  const sevRank = (s: string) => (s === 'critical' ? 0 : 1);
  items.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.projectName.localeCompare(b.projectName));
  byProject.sort((a, b) => b.critical - a.critical || b.total - a.total || a.projectName.localeCompare(b.projectName));

  const critical = items.filter((i) => i.severity === 'critical').length;
  const warning = items.length - critical;
  void nameOf;
  return {
    nodeId,
    projectCount: projects.length,
    affectedProjects: byProject.length,
    items,
    critical,
    warning,
    total: items.length,
    byProject,
  };
}

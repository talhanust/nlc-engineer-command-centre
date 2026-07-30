import { describe, it, expect } from 'vitest';
import type { OrgNode } from '../data/types';
import type { TriagedAlert } from './alerts';
import { projectsUnder, rollUpAttention } from './attention';

// A small org tree:
//   hq ── hqe ── pdN ── p1, p2
//                └ pdS ── p3
const nodes: OrgNode[] = [
  { id: 'hq', name: 'HQ NLC', type: 'hq', parentId: null },
  { id: 'hqe', name: 'HQ Engineers', type: 'hq_engrs', parentId: 'hq' },
  { id: 'pdN', name: 'PD North', type: 'pd_hq', parentId: 'hqe' },
  { id: 'pdS', name: 'PD South', type: 'pd_hq', parentId: 'hqe' },
  { id: 'p1', name: 'Margalla Road', type: 'project', parentId: 'pdN' },
  { id: 'p2', name: 'Ring Road', type: 'project', parentId: 'pdN' },
  { id: 'p3', name: 'Coastal Highway', type: 'project', parentId: 'pdS' },
];

const a = (id: string, severity: 'critical' | 'warning'): TriagedAlert =>
  ({ id, severity, title: id, detail: '', sub: 'x', status: 'open' } as TriagedAlert);

describe('projectsUnder — the subtree', () => {
  it('a project resolves to itself', () => {
    expect(projectsUnder('p1', nodes).map((n) => n.id)).toEqual(['p1']);
  });
  it('a PD HQ resolves to the projects it commands', () => {
    expect(projectsUnder('pdN', nodes).map((n) => n.id).sort()).toEqual(['p1', 'p2']);
    expect(projectsUnder('pdS', nodes).map((n) => n.id)).toEqual(['p3']);
  });
  it('HQ Engineers and HQ NLC resolve to the whole subtree', () => {
    expect(projectsUnder('hqe', nodes).map((n) => n.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(projectsUnder('hq', nodes).map((n) => n.id).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('rollUpAttention — level-wise aggregation', () => {
  const byProject = new Map<string, TriagedAlert[]>([
    ['p1', [a('bg-1', 'critical'), a('um-boq', 'warning')]],
    ['p2', [a('ag-9', 'warning')]],
    ['p3', [a('oc-x', 'critical')]],
  ]);

  it('a project shows only its own alerts', () => {
    const r = rollUpAttention('p1', nodes, byProject);
    expect(r.total).toBe(2);
    expect(r.critical).toBe(1);
    expect(r.items.every((i) => i.projectId === 'p1')).toBe(true);
  });

  it('a PD HQ aggregates every project it commands', () => {
    const r = rollUpAttention('pdN', nodes, byProject);
    expect(r.total).toBe(3);            // p1 (2) + p2 (1)
    expect(r.affectedProjects).toBe(2);
    expect(new Set(r.items.map((i) => i.projectId))).toEqual(new Set(['p1', 'p2']));
  });

  it('HQ NLC aggregates the entire organisation', () => {
    const r = rollUpAttention('hq', nodes, byProject);
    expect(r.total).toBe(4);            // 2 + 1 + 1
    expect(r.critical).toBe(2);
    expect(r.affectedProjects).toBe(3);
  });

  it('tags every alert with its originating project', () => {
    const r = rollUpAttention('hq', nodes, byProject);
    const bg = r.items.find((i) => i.id === 'bg-1')!;
    expect(bg.projectName).toBe('Margalla Road');
    const oc = r.items.find((i) => i.id === 'oc-x')!;
    expect(oc.projectName).toBe('Coastal Highway');
  });

  it('orders critical before warning, and gives a per-project breakdown worst-first', () => {
    const r = rollUpAttention('hq', nodes, byProject);
    expect(r.items[0].severity).toBe('critical');
    expect(r.items[r.items.length - 1].severity).toBe('warning');
    // p1 and p3 each have a critical; they sort above p2 (warning only).
    expect(r.byProject[r.byProject.length - 1].projectId).toBe('p2');
  });

  it('is empty (but valid) when nothing under a node has alerts', () => {
    const r = rollUpAttention('pdS', nodes, new Map());
    expect(r.total).toBe(0);
    expect(r.affectedProjects).toBe(0);
    expect(r.projectCount).toBe(1); // p3 exists, just no alerts
  });
});

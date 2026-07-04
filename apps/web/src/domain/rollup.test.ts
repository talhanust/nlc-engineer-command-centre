import { describe, it, expect } from 'vitest';
import { LocalDataProvider } from '../data/LocalDataProvider';
import { computeNodeRollup, ragForSlippage } from './rollup';
import { ancestorsOf, descendantProjectIds } from './org';

const provider = new LocalDataProvider();

describe('RAG thresholds', () => {
  it('classifies slippage', () => {
    expect(ragForSlippage(0)).toBe('green');
    expect(ragForSlippage(-2)).toBe('amber');
    expect(ragForSlippage(-5)).toBe('amber');
    expect(ragForSlippage(-10)).toBe('red');
    expect(ragForSlippage(-25)).toBe('red');
  });
});

describe('computeNodeRollup', () => {
  it('rolls all projects up to HQ NLC', async () => {
    const nodes = await provider.listNodes();
    const projects = await provider.listProjects();
    const r = computeNodeRollup(nodes, projects, 'hq-nlc')!;
    expect(r.totals.projectCount).toBe(20);
    // Total contract value equals the sum of all seeded projects.
    const sum = projects.reduce((a, p) => a + Number(p.contractValue), 0);
    expect(Math.round(r.totals.contractValue)).toBe(Math.round(sum));
  });

  it('weights progress by contract value', async () => {
    const nodes = await provider.listNodes();
    const projects = await provider.listProjects();
    const r = computeNodeRollup(nodes, projects, 'pd-north')!;
    // pd-north's weighted actual lies within its projects' actual range.
    expect(r.totals.actualPct).toBeGreaterThan(40);
    expect(r.totals.actualPct).toBeLessThan(60);
    expect(r.children).toHaveLength(5);
  });

  it('scopes totals to accessible projects only', async () => {
    const nodes = await provider.listNodes();
    const projects = await provider.listProjects();
    const r = computeNodeRollup(nodes, projects, 'pd-north', {
      accessibleProjectIds: new Set(['proj-f14f15']),
    })!;
    expect(r.totals.projectCount).toBe(1);
  });
});

describe('org helpers', () => {
  it('builds the breadcrumb chain', async () => {
    const nodes = await provider.listNodes();
    expect(ancestorsOf(nodes, 'proj-f14f15').map((n) => n.id)).toEqual([
      'hq-nlc',
      'hq-engrs',
      'pd-north',
      'proj-f14f15',
    ]);
  });

  it('collects descendant projects of a branch', async () => {
    const nodes = await provider.listNodes();
    expect(descendantProjectIds(nodes, 'pd-kpk').sort()).toEqual(
      ['proj-d-i-khan', 'proj-hazara-exp', 'proj-m2-rehab', 'proj-swat-expr'].sort(),
    );
  });
});

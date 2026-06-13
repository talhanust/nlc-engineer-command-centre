import { describe, it, expect } from 'vitest';
import { hrRollup, descendantNodeIds, hrByCategory } from './hr';
import type { OrgNode, HrPosting } from '../data/types';

const nodes: OrgNode[] = [
  { id: 'hq-nlc', name: 'HQ NLC', type: 'hq', parentId: null },
  { id: 'hq-engrs', name: 'HQ Engineers', type: 'hq_engrs', parentId: 'hq-nlc' },
  { id: 'pd-north', name: 'HQ PD North', type: 'pd_hq', parentId: 'hq-engrs' },
  { id: 'proj-1', name: 'Project 1', type: 'project', parentId: 'pd-north' },
];
const hr: HrPosting[] = [
  { id: 'a', nodeId: 'hq-nlc', category: 'Secretariat', sanctioned: 30, posted: 27 },
  { id: 'b', nodeId: 'hq-engrs', category: 'Engineers', sanctioned: 20, posted: 18 },
  { id: 'c', nodeId: 'pd-north', category: 'HQ staff', sanctioned: 14, posted: 12 },
  { id: 'd', nodeId: 'proj-1', category: 'Engineers', sanctioned: 12, posted: 10 },
];

describe('HR roll-up rules', () => {
  it('project node rolls up its own HR only', () => {
    const r = hrRollup(nodes, hr, 'proj-1');
    expect(r.rolled.posted).toBe(10);
    expect(r.excludesOwn).toBe(false);
  });

  it('HQ PD / HQ Engrs include their own HR in the roll-up', () => {
    const pd = hrRollup(nodes, hr, 'pd-north');
    expect(pd.rolled.posted).toBe(12 + 10); // own + project
    const eng = hrRollup(nodes, hr, 'hq-engrs');
    expect(eng.rolled.posted).toBe(18 + 12 + 10); // own + pd + project
    expect(eng.excludesOwn).toBe(false);
  });

  it('HQ NLC shows its own HR but excludes it from the roll-up', () => {
    const nlc = hrRollup(nodes, hr, 'hq-nlc');
    expect(nlc.own.posted).toBe(27);
    expect(nlc.rolled.posted).toBe(18 + 12 + 10); // descendants only, NOT 27
    expect(nlc.excludesOwn).toBe(true);
  });

  it('lists descendant node ids and category totals', () => {
    expect(descendantNodeIds(nodes, 'hq-engrs').sort()).toEqual(['pd-north', 'proj-1']);
    const cats = hrByCategory(hr, ['hq-engrs', 'proj-1']);
    expect(cats.find((c) => c.category === 'Engineers')!.posted).toBe(28);
  });
});

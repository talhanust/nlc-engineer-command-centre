import { describe, it, expect } from 'vitest';
import {
  buildOrganogram, rolledStrength, establishmentTotals, fillStatus, fillPct,
  organogramFromPostings, commandSpine,
} from './organogram';
import type { HrUnit, HrPosting, OrgNode } from '../data/types';

const units: HrUnit[] = [
  { id: 'h', nodeId: 'p', parentId: null, title: 'Director', auth: 1, held: 1, order: 0 },
  { id: 'd', nodeId: 'p', parentId: 'h', title: 'Deputy', auth: 1, held: 1, order: 0 },
  { id: 's1', nodeId: 'p', parentId: 'd', title: 'Contract Sec', auth: 8, held: 6, order: 1 },
  { id: 's2', nodeId: 'p', parentId: 'd', title: 'F&A Sec', auth: 12, held: 11, order: 2 },
  { id: 's1a', nodeId: 'p', parentId: 's1', title: 'QS', auth: 3, held: 2, order: 0 },
  { id: 's1b', nodeId: 'p', parentId: 's1', title: 'AQS', auth: 5, held: 4, order: 1 },
];

describe('organogram domain', () => {
  it('builds a tree and orders siblings', () => {
    const roots = buildOrganogram(units);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('h');
    expect(roots[0].children[0].id).toBe('d');
    expect(roots[0].children[0].children.map((c) => c.id)).toEqual(['s1', 's2']);
  });

  it('rolls leaf strength up through sections without double counting', () => {
    const roots = buildOrganogram(units);
    const deputy = roots[0].children[0];
    const contract = deputy.children[0];
    // Contract Sec has children (QS+AQS) → rolled from leaves, not its own row.
    expect(rolledStrength(contract)).toEqual({ auth: 8, held: 6 });
    // Deputy rolls Contract(8/6) + F&A leaf(12/11).
    expect(rolledStrength(deputy)).toEqual({ auth: 20, held: 17 });
  });

  it('totals the whole establishment from leaves', () => {
    const roots = buildOrganogram(units);
    expect(establishmentTotals(roots)).toEqual({ auth: 20, held: 17 });
  });

  it('classifies fill status and percent', () => {
    expect(fillStatus(9, 10)).toBe('ok');
    expect(fillStatus(8, 10)).toBe('warn');
    expect(fillStatus(5, 10)).toBe('crit');
    expect(fillStatus(0, 0)).toBe('ok');
    expect(fillPct(96, 113)).toBe(85);
  });

  it('finds the command spine and fan-out', () => {
    const roots = buildOrganogram(units);
    const { spine, fanout } = commandSpine(roots);
    expect(spine.map((s) => s.id)).toEqual(['h', 'd']);
    expect(fanout?.id).toBe('d');
  });

  it('synthesises a fallback organogram from postings', () => {
    const node: OrgNode = { id: 'n', name: 'PD North', type: 'pd_hq', parentId: null };
    const postings: HrPosting[] = [
      { id: 'a', nodeId: 'n', category: 'Engineers', sanctioned: 12, posted: 10 },
      { id: 'b', nodeId: 'n', category: 'Admin', sanctioned: 8, posted: 8 },
    ];
    const synth = organogramFromPostings(node, postings);
    const roots = buildOrganogram(synth);
    expect(roots[0].title).toBe('PD North');
    expect(establishmentTotals(roots)).toEqual({ auth: 20, held: 18 });
  });
});

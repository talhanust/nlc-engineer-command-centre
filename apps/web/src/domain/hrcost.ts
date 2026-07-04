import type { HrUnit } from '../data/types';
import { buildOrganogram, type OrgoNode } from './organogram';

/**
 * Representative monthly cost (PKR) per NLC pay scale. These are planning
 * figures for establishment-cost estimation, editable later via settings.
 */
export const PAY_BANDS: Array<{ max: number; monthly: number }> = [
  { max: 3, monthly: 45_000 },
  { max: 7, monthly: 60_000 },
  { max: 10, monthly: 85_000 },
  { max: 13, monthly: 110_000 },
  { max: 16, monthly: 160_000 },
  { max: 17, monthly: 210_000 },
  { max: 18, monthly: 275_000 },
  { max: 21, monthly: 360_000 },
];
const DEFAULT_BAND = 150_000;

/** Parse the highest NLC scale number from a scale string ('NLC-14-16' → 16). */
export function scaleLevel(scale?: string): number | null {
  if (!scale) return null;
  const nums = (scale.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0 && n <= 22);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/** Monthly cost for one seat at a given scale. */
export function bandForScale(scale?: string): number {
  const lvl = scaleLevel(scale);
  if (lvl == null) {
    // Officer ranks without an NLC scale → senior band.
    if (scale && /\b(col|lt col|maj|brig|gen)\b/i.test(scale)) return 300_000;
    return DEFAULT_BAND;
  }
  for (const b of PAY_BANDS) if (lvl <= b.max) return b.monthly;
  return PAY_BANDS[PAY_BANDS.length - 1].monthly;
}

/** Cost basis: 'held' (sanctioned occupancy) or 'named' (actual roster). */
export type CostBasis = 'held' | 'named';

function leafCost(node: OrgoNode, basis: CostBasis, named: Map<string, number>): number {
  const seats = basis === 'named' ? (named.get(node.id) ?? 0) : node.held;
  return seats * bandForScale(node.scale);
}

function sumLeaves(node: OrgoNode, basis: CostBasis, named: Map<string, number>): number {
  if (node.children.length === 0) return leafCost(node, basis, named);
  return node.children.reduce((acc, c) => acc + sumLeaves(c, basis, named), 0);
}

/** Monthly cost per top-tier section (children of the fan-out / head). */
export function costBySection(
  units: HrUnit[], basis: CostBasis = 'held', namedByUnit?: Map<string, number>,
): Array<{ id: string; title: string; monthly: number }> {
  const named = namedByUnit ?? new Map();
  const roots = buildOrganogram(units);
  // Descend single-child spine to the fan-out, then report its children.
  let head: OrgoNode | undefined = roots[0];
  while (head && head.children.length === 1) head = head.children[0];
  const sections = head ? head.children : roots;
  return sections.map((s) => ({ id: s.id, title: s.title, monthly: sumLeaves(s, basis, named) }))
    .sort((a, b) => b.monthly - a.monthly);
}

export function totalMonthlyCost(
  units: HrUnit[], basis: CostBasis = 'held', namedByUnit?: Map<string, number>,
): number {
  const named = namedByUnit ?? new Map();
  return buildOrganogram(units).reduce((acc, r) => acc + sumLeaves(r, basis, named), 0);
}

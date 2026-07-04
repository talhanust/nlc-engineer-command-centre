import { describe, it, expect } from 'vitest';
import { synthSeries, weightedPortfolioCurve, TIMELINE, CURRENT_IDX } from './scurve';
import { wbsCoverage, materialCoverage } from './mapping';
import type { BoqItem, BoqWbsLink } from '../data/types';

describe('S-curve synthesis', () => {
  it('ramps planned 0→plannedPct and actual only up to now', () => {
    const s = synthSeries(80, 50);
    expect(s).toHaveLength(TIMELINE.length);
    expect(s[0].planned).toBeCloseTo(0, 1);
    expect(s[s.length - 1].planned).toBeCloseTo(80, 1);
    expect(s[CURRENT_IDX].actual).toBeCloseTo(50, 1);
    expect(s[CURRENT_IDX + 1].actual).toBeNull();
  });
});

describe('weighted portfolio curve', () => {
  it('weights by contract value (controlled case → 87.5%)', () => {
    // 1000 @ 50% planned + 3000 @ 100% planned => (1000*50 + 3000*100)/4000 = 87.5
    const a = synthSeries(50, 50);
    const b = synthSeries(100, 100);
    const curve = weightedPortfolioCurve([
      { weight: 1000, points: a },
      { weight: 3000, points: b },
    ]);
    expect(curve[curve.length - 1].planned).toBeCloseTo(87.5, 1);
  });
});

describe('mapping coverage', () => {
  const items: BoqItem[] = [1, 2, 3, 4].map((n) => ({
    id: `i${n}`, projectId: 'p', billNo: '1', code: `C${n}`, description: '', unit: '', qty: 1, rate: 1, amount: 1,
  }));
  it('computes WBS coverage', () => {
    const links: BoqWbsLink[] = [
      { boqItemId: 'i1', projectId: 'p', activityId: 'A', confidence: 'confirmed' },
      { boqItemId: 'i2', projectId: 'p', activityId: 'A', confidence: 'auto' },
    ];
    const c = wbsCoverage(items, links);
    expect(c.total).toBe(4);
    expect(c.confirmed).toBe(1);
    expect(c.unmapped).toBe(2);
    expect(c.coveragePct).toBe(50);
  });
  it('zero links => zero coverage', () => {
    expect(materialCoverage(items, []).coveragePct).toBe(0);
  });
});

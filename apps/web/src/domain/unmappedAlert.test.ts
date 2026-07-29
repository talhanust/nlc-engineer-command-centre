import { describe, it, expect } from 'vitest';
import type { BoqItem, BoqWbsLink } from '../data/types';
import { unmappedBoqAlert } from './derivedProgress';

const item = (id: string, amount: number): BoqItem => ({
  id, projectId: 'p', billNo: '1', billName: 'B', section: '', code: id,
  description: id, unit: 'CM', qty: 1, rate: amount, amount,
} as BoqItem);

const link = (boqItemId: string, confidence: BoqWbsLink['confidence']): BoqWbsLink =>
  ({ boqItemId, projectId: 'p', activityId: 'A1', confidence });

describe('unmappedBoqAlert', () => {
  it('routes to the Mapping tab, not the planner', () => {
    const a = unmappedBoqAlert([item('i1', 100)], []);
    expect(a).toBeTruthy();
    expect(a!.sub).toBe('mapping'); // the fix — was 'planner', which never opened Mapping
  });

  it('counts only items with no CONFIRMED link as unmapped', () => {
    const items = [item('i1', 100), item('i2', 200), item('i3', 300)];
    // i1 confirmed, i2 only auto (not confirmed), i3 none.
    const links = [link('i1', 'confirmed'), link('i2', 'auto')];
    const a = unmappedBoqAlert(items, links)!;
    expect(a.title).toMatch(/2 BOQ items unmapped/); // i2 + i3
    expect(a.detail).toMatch(/500/); // 200 + 300
  });

  it('clears once every item is confirmed', () => {
    const items = [item('i1', 100), item('i2', 200)];
    const links = [link('i1', 'confirmed'), link('i2', 'confirmed')];
    expect(unmappedBoqAlert(items, links)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { suggestWbsLinks, suggestionsToLinks } from './autoMap';
import type { BoqItem, ScheduleActivity, BoqWbsLink } from '../data/types';

function item(id: string, code: string, description: string): BoqItem {
  return { id, projectId: 'p', billNo: '1', code, description, unit: 'cum', qty: 100, rate: 1000, amount: 100000 };
}
function act(activityId: string, name: string, wbs = ''): ScheduleActivity {
  return { id: activityId, projectId: 'p', activityId, name, wbs, durationDays: 10, plannedStart: '2026-06-01', plannedFinish: '2026-06-10', isMilestone: false };
}

describe('suggestWbsLinks', () => {
  const items = [
    item('b1', 'BOQ-1', 'Excavation in ordinary soil for foundation'),
    item('b2', 'BOQ-2', 'Reinforced concrete in raft foundation'),
    item('b3', 'BOQ-3', 'Bituminous asphalt wearing course'),
  ];
  const acts = [
    act('A100', 'Excavation foundation'),
    act('A200', 'Reinforced concrete raft'),
    act('A300', 'Asphalt wearing course'),
  ];

  it('matches each BOQ item to its best activity by description similarity', () => {
    const s = suggestWbsLinks(items, acts);
    const by = Object.fromEntries(s.map((x) => [x.boqItemId, x.activityId]));
    expect(by['b1']).toBe('A100');
    expect(by['b2']).toBe('A200');
    expect(by['b3']).toBe('A300');
  });

  it('skips items already mapped', () => {
    const existing: BoqWbsLink[] = [{ boqItemId: 'b1', projectId: 'p', activityId: 'A100', confidence: 'confirmed' }];
    const s = suggestWbsLinks(items, acts, existing);
    expect(s.find((x) => x.boqItemId === 'b1')).toBeUndefined();
    expect(s.length).toBe(2);
  });

  it('does not suggest below the similarity threshold', () => {
    const s = suggestWbsLinks([item('z', 'X', 'Quantum widget calibration')], acts);
    expect(s).toHaveLength(0);
  });

  it('materialises suggestions as auto links', () => {
    const s = suggestWbsLinks(items, acts);
    const links = suggestionsToLinks('p', s);
    expect(links.every((l) => l.confidence === 'auto')).toBe(true);
    expect(links.every((l) => l.projectId === 'p')).toBe(true);
  });
});

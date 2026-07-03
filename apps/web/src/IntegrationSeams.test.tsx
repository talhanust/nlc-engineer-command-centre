import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { valueCoverage, activityCoverage, effectiveWeight, linksByItem } from './domain/mapping';
import { tokens, matchScore, suggestWbsLinks } from './domain/mappingSuggest';
import { activityDerivedProgress, divergenceAlerts, unmappedBoqAlert } from './domain/derivedProgress';
import { claimCap, approvedVariationQtyByItem } from './domain/billing';
import type { BoqItem, BoqWbsLink, ScheduleActivity, ProgressUpdate } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

const item = (id: string, over: Partial<BoqItem> = {}): BoqItem => ({
  id, projectId: 'p', billNo: '1', billName: 'Road Work', section: 'Earthwork',
  code: id, description: 'Clearing and grubbing', unit: 'Sq.m', qty: 100, rate: 10, amount: 1000, ...over,
});
const act = (activityId: string, name: string, over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
  id: `s-${activityId}`, projectId: 'p', activityId, name, wbs: '1.1', durationDays: 100,
  plannedStart: '2026-01-01', plannedFinish: '2026-12-31', isMilestone: false, ...over,
});
const link = (boqItemId: string, activityId: string, over: Partial<BoqWbsLink> = {}): BoqWbsLink =>
  ({ boqItemId, projectId: 'p', activityId, confidence: 'confirmed', ...over });
const prog = (boqItemId: string, executedQty: number): ProgressUpdate =>
  ({ id: `u-${boqItemId}-${executedQty}`, projectId: 'p', boqItemId, period: 'Jun-26', executedQty, status: 'validated', enteredBy: 'surveyor' } as unknown as ProgressUpdate);

describe('many-to-many mapping + value coverage (req 3a)', () => {
  it('measures coverage by BOQ value and lists unmapped items', () => {
    const items = [item('a', { amount: 3000 }), item('b', { amount: 1000 })];
    const vc = valueCoverage(items, [link('a', 'A-1')]);
    expect(vc.pct).toBe(75); // 3000 of 4000 mapped
    expect(vc.unmappedItems.map((i) => i.id)).toEqual(['b']);
  });

  it('computes activity coverage and splits weight evenly by default', () => {
    const links = [link('a', 'A-1'), link('a', 'A-2')];
    const by = linksByItem(links);
    expect(effectiveWeight(links[0], by.get('a')!)).toBeCloseTo(0.5);
    expect(activityCoverage([act('A-1', 'x'), act('A-2', 'y'), act('A-3', 'z')], links)).toBe(67);
  });
});

describe('auto-suggestion engine (req 3a(2))', () => {
  it('scores items to activities via tokens and synonyms', () => {
    expect(tokens('Clearing and grubbing').has('earthwork')).toBe(true);
    const s = matchScore(item('a'), act('A-1', 'Earthwork'));
    expect(s).toBeGreaterThan(0.5);
  });

  it('suggests only for unmapped items and emits auto confidence', () => {
    const items = [item('a'), item('b', { description: 'Asphalt wearing course', section: 'Surfacing' })];
    const acts = [act('A-1', 'Earthwork'), act('A-2', 'Asphalt & ancillary works')];
    const sugg = suggestWbsLinks(items, acts, [link('a', 'A-1')]);
    expect(sugg).toHaveLength(1);
    expect(sugg[0].link.boqItemId).toBe('b');
    expect(sugg[0].link.activityId).toBe('A-2');
    expect(sugg[0].link.confidence).toBe('auto');
  });
});

describe('derived activity progress + divergence (reqs 3a(4)(6), 3b(2))', () => {
  it('derives activity % from validated executed qty through confirmed links only', () => {
    const items = [item('a', { qty: 100, rate: 10, amount: 1000 })];
    const acts = [act('A-1', 'Earthwork')];
    const links = [link('a', 'A-1'), link('a', 'A-9', { confidence: 'auto' })]; // auto ignored
    const rows = activityDerivedProgress(acts, items, links, [prog('a', 50)], '2026-07-01');
    expect(rows[0].mapped).toBe(true);
    expect(rows[0].derivedPct).toBe(50); // 500 of 1000 value executed
    expect(rows[0].expectedPct).toBeGreaterThan(0);
  });

  it('flags divergence beyond tolerance and reports unmapped BOQ value', () => {
    const items = [item('a'), item('b', { id: 'b' })];
    const acts = [act('A-1', 'Earthwork', { plannedStart: '2025-01-01', plannedFinish: '2025-12-31' })]; // expected 100%
    const rows = activityDerivedProgress(acts, items, [link('a', 'A-1')], [prog('a', 10)], '2026-07-01');
    expect(rows[0].divergence).toBeLessThan(-10);
    const alerts = divergenceAlerts(rows, 10);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical'); // 90-pt gap > 2× tolerance
    const um = unmappedBoqAlert(items, [link('a', 'A-1')]);
    expect(um?.title).toMatch(/1 BOQ item unmapped/);
  });
});

describe('hard over-claim gate (req 3b(4))', () => {
  it('caps claims at approved BOQ + approved variations − claimed', () => {
    expect(claimCap({ id: 'a', qty: 100 }, 0, 80)).toBe(20);
    expect(claimCap({ id: 'a', qty: 100 }, 30, 80)).toBe(50); // approved VO raised qty to 130
    expect(claimCap({ id: 'a', qty: 100 }, 0, 120)).toBe(0);
  });

  it('counts only approved variation qty lines', () => {
    const boq = [{ id: 'a', qty: 100 }];
    const deltas = approvedVariationQtyByItem([
      { status: 'approved', lines: [{ kind: 'qty', boqItemId: 'a', newQty: 130 }] },
      { status: 'submitted', lines: [{ kind: 'qty', boqItemId: 'a', newQty: 999 }] },
    ], boq);
    expect(deltas['a']).toBe(30);
  });
});

describe('mapping workbench UI', () => {
  beforeEach(() => localStorage.clear());

  it('suggests mappings into a review queue and confirms one', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');
    await screen.findByRole('table', { name: 'WBS mapping' });
    expect(screen.getByLabelText('Mapping coverage').textContent).toMatch(/BOQ value mapped/);
    await user.click(screen.getByRole('button', { name: /Suggest mappings/ }));
    const queue = await screen.findByRole('table', { name: 'Mapping review queue' });
    const confirms = within(queue).getAllByRole('button', { name: /^Confirm / });
    expect(confirms.length).toBeGreaterThan(0);
    await user.click(confirms[0]);
    await waitFor(() => {
      const q = screen.queryByRole('table', { name: 'Mapping review queue' });
      const remaining = q ? within(q).queryAllByRole('button', { name: /^Confirm / }).length : 0;
      expect(remaining).toBe(confirms.length - 1);
    });
  });
});

describe('schedule derived progress UI', () => {
  beforeEach(() => localStorage.clear());

  it('shows derived vs expected % columns on the schedule', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/execution');
    await screen.findByRole('heading', { name: 'Progress S-curve' });
    await user.click(screen.getByRole('tab', { name: 'Schedule / WBS' }));
    const table = await screen.findByRole('table', { name: 'Schedule' });
    expect(within(table).getByText('Physical % (derived)')).toBeInTheDocument();
    expect(within(table).getByText('Expected %')).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { stageTotals, receivable, readyToClose, projectStage } from './domain/lifecycle';
import { consumptionVariance } from './domain/consumption';
import { overdueDirectiveAlerts } from './domain/alerts';
import type { Project, BoqItem, BoqMaterialLink, MaterialIssue, ProgressUpdate } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const proj = (id: string, over: Partial<Project> = {}): Project => ({
  id, pdHqId: 'pd', clientName: 'c', contractValue: '1000', billedToDate: '800', receivedToDate: '600',
  plannedPct: 80, actualPct: 80, ...over,
});

describe('project lifecycle stages', () => {
  it('separates totals per stage and keeps the all-projects total', () => {
    const t = stageTotals([
      proj('a'), // ongoing (default)
      proj('b', { stage: 'physically_completed', billedToDate: '1000', receivedToDate: '700' }),
      proj('c', { stage: 'financially_closed', billedToDate: '1000', receivedToDate: '1000' }),
    ]);
    expect(t.all.count).toBe(3);
    expect(t.ongoing.count).toBe(1);
    expect(t.physically_completed.count).toBe(1);
    expect(t.physically_completed.receivable).toBe(300);
    expect(t.financially_closed.receivable).toBe(0);
    expect(t.all.billed).toBe(2800);
  });

  it('gates financial close on receivable and liabilities', () => {
    const p = proj('x', { stage: 'physically_completed', billedToDate: '1000', receivedToDate: '1000' });
    expect(receivable(p)).toBe(0);
    expect(readyToClose(p, 0)).toBe(true);
    expect(readyToClose(p, 5)).toBe(false);
    expect(readyToClose(proj('y', { stage: 'physically_completed' }), 0)).toBe(false); // receivable 200
  });

  it('provider stage transitions set TOC and close dates and seed stages exist', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const all = await p.listProjects();
    expect(all.filter((x) => projectStage(x) === 'physically_completed').map((x) => x.id).sort())
      .toEqual(['proj-attock-byp', 'proj-thar-coal-rd']);
    expect(all.find((x) => x.id === 'proj-i11-infra')?.stage).toBe('financially_closed');
    const moved = await p.setProjectStage('proj-dha-ph8', 'physically_completed', '2026-07-01');
    expect(moved.tocDate).toBe('2026-07-01');
    const closed = await p.setProjectStage('proj-dha-ph8', 'financially_closed', '2026-07-04');
    expect(closed.financialCloseDate).toBe('2026-07-04');
    expect(closed.tocDate).toBe('2026-07-01'); // preserved
  });

  it('dashboard strip drills into the Recovery section with close gate', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    const strip = screen.getByRole('group', { name: 'Lifecycle totals' });
    expect(within(strip).getByLabelText('All projects totals')).toBeInTheDocument();
    await user.click(within(strip).getByLabelText('Physically completed (Recovery) totals'));
    const rec = await screen.findByRole('table', { name: 'Recovery section' });
    expect(within(rec).getByText('Attock Bypass')).toBeInTheDocument();
    expect(within(rec).getByText('Receivable')).toBeInTheDocument();
    // Attock has 1.6bn receivable → close blocked
    const attock = within(rec).getByText('Attock Bypass').closest('tr')! as HTMLElement;
    expect(within(attock).getByRole('button', { name: /Close proj-attock-byp/ })).toBeDisabled();
    // breakdown re-aggregates to the stage
    await user.click(within(strip).getByLabelText('Financially closed totals'));
    await screen.findByRole('table', { name: 'Financially closed projects' });
  });
});

describe('consumption variance (theoretical vs actual)', () => {
  it('computes wastage % per material from composition × executed qty', () => {
    const items: BoqItem[] = [{ id: 'a', projectId: 'p', billNo: '1', billName: 'x', section: 's', code: '1-01', description: 'PCC', unit: 'Cu.m', qty: 100, rate: 1, amount: 100 }];
    const matLinks: BoqMaterialLink[] = [{ boqItemId: 'a', projectId: 'p', materialRef: 'CEM', coeff: 7, confidence: 'confirmed' }];
    const progress: ProgressUpdate[] = [{ id: 'u1', projectId: 'p', boqItemId: 'a', period: 'Jun-26', executedQty: 50, status: 'validated', enteredBy: 's' } as unknown as ProgressUpdate];
    const issues: MaterialIssue[] = [{ id: 'i1', projectId: 'p', dated: 'd', materialCode: 'CEM', qty: 385, issuedTo: 'x' }];
    const [row] = consumptionVariance({ items, matLinks, progress, issues });
    expect(row.theoreticalQty).toBe(350); // 50 × 7
    expect(row.issuedQty).toBe(385);
    expect(row.wastagePct).toBe(10); // (385−350)/350
  });
});

describe('directive overdue escalation', () => {
  it('raises a critical alert routed to the assignee role', () => {
    const alerts = overdueDirectiveAlerts([
      { id: 'd1', title: 'Recover balance', projectId: 'p1', nodeId: 'n', assigneeRole: 'pm', assigneeNodeId: 'p1', dueDate: '2026-01-01', status: 'issued' },
      { id: 'd2', title: 'Done one', projectId: 'p1', nodeId: 'n', assigneeRole: 'pm', assigneeNodeId: 'p1', dueDate: '2026-01-01', status: 'complied' },
      { id: 'd3', title: 'Other project', projectId: 'p2', nodeId: 'n', assigneeRole: 'pm', assigneeNodeId: 'p2', dueDate: '2026-01-01', status: 'issued' },
    ], 'p1', '2026-07-04');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].owner).toBe('pm');
  });
});

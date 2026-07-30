import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { mergeAlertStates, activeAlerts, recoveryAlerts, ALERT_OWNER, type Alert } from './domain/alerts';
import { materialLeadPlan, leadTimeAlerts } from './domain/leadtime';
import { healthScore } from './domain/health';
import type { BoqItem, BoqMaterialLink, BoqWbsLink, ScheduleActivity, ProgressUpdate, MaterialIssue, MachineryUsage, Crv } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe('alert lifecycle (req 3i(2))', () => {
  const a: Alert = { id: 'x-1', severity: 'warning', title: 't', detail: 'd', sub: 'recon' };

  it('routes to the responsible role and defaults to open', () => {
    const [m] = mergeAlertStates([a], []);
    expect(m.owner).toBe(ALERT_OWNER.recon);
    expect(m.status).toBe('open');
  });

  it('resolved and muted alerts leave the active queue', () => {
    const merged = mergeAlertStates([a, { ...a, id: 'x-2' }], [
      { alertId: 'x-1', status: 'resolved', by: 'pm', note: 'fixed', updatedAt: 'now' },
    ]);
    expect(activeAlerts(merged).map((x) => x.id)).toEqual(['x-2']);
  });

  it('raises unrecovered material and machinery alerts', () => {
    const issues: MaterialIssue[] = [{ id: 'i1', projectId: 'p', dated: 'd', materialCode: 'CEM', qty: 10, issuedTo: 'x', contractorId: 'c1', rate: 100, recovered: 200 }];
    const mach: MachineryUsage[] = [{ id: 'm1', projectId: 'p', dated: 'd', machineryCode: 'EXC', description: '', hours: 10, rate: 100, contractorId: 'c1', recovered: 0 }];
    const alerts = recoveryAlerts(issues, mach);
    expect(alerts.map((x) => x.id).sort()).toEqual(['ur-machinery', 'ur-material']);
    expect(alerts.every((x) => x.sub === 'rar')).toBe(true);
  });
});

describe('procurement lead-time planner (req 3c(6))', () => {
  const item: BoqItem = { id: 'a', projectId: 'p', billNo: '1', billName: 'Road', section: 'x', code: '1-01', description: 'PCC', unit: 'Cu.m', qty: 100, rate: 10, amount: 1000 };
  const mat: BoqMaterialLink = { boqItemId: 'a', projectId: 'p', materialRef: 'CEM', coeff: 2, confidence: 'confirmed', leadDays: 30 };
  const wbs: BoqWbsLink = { boqItemId: 'a', projectId: 'p', activityId: 'A-1', confidence: 'confirmed' };
  const act: ScheduleActivity = { id: 's1', projectId: 'p', activityId: 'A-1', name: 'PCC works', wbs: '1', durationDays: 60, plannedStart: '2026-07-10', plannedFinish: '2026-09-30', isMilestone: false };
  const progress: ProgressUpdate[] = [{ id: 'u1', projectId: 'p', boqItemId: 'a', period: 'Jun-26', executedQty: 40, status: 'validated', enteredBy: 's' } as unknown as ProgressUpdate];
  const crv = { id: 'c1', projectId: 'p', poId: 'po1', received: [{ code: 'CEM', qtyReceived: 50 }] } as unknown as Crv;

  it('derives requirement from remaining qty × coeff, nets stock, flags order-now', () => {
    const rows = materialLeadPlan({ items: [item], matLinks: [mat], wbsLinks: [wbs], sched: [act], progress, crvs: [crv], issues: [], asOf: '2026-07-01' });
    expect(rows).toHaveLength(1);
    expect(rows[0].requiredQty).toBe(120); // (100−40) × 2
    expect(rows[0].onHand).toBe(50);
    expect(rows[0].shortfall).toBe(70);
    expect(rows[0].needBy).toBe('2026-07-10');
    expect(rows[0].status).toBe('order_now'); // order-by 2026-06-10 already past
    const alerts = leadTimeAlerts(rows);
    expect(alerts[0].sub).toBe('procurement');
  });

  it('goes late when the need-by date has passed with a shortfall', () => {
    const rows = materialLeadPlan({ items: [item], matLinks: [mat], wbsLinks: [wbs], sched: [{ ...act, plannedStart: '2026-06-01' }], progress, crvs: [], issues: [], asOf: '2026-07-01' });
    expect(rows[0].status).toBe('late');
    expect(leadTimeAlerts(rows)[0].severity).toBe('critical');
  });
});

describe('composite health score (req 3f(4))', () => {
  it('scores a healthy project green and a distressed one red', () => {
    const good = healthScore({ plannedPct: 60, actualPct: 58, contractValue: 1000, billed: 560, received: 530 });
    expect(good.band).toBe('green');
    const bad = healthScore({ plannedPct: 70, actualPct: 30, contractValue: 1000, billed: 100, received: 20 });
    expect(bad.band).toBe('red');
    expect(bad.schedule).toBe(0); // 40-pt slip floors the schedule component
  });
});

describe('alert centre UI', () => {
  beforeEach(() => localStorage.clear());

  it('acknowledges an alert and it stays in the active queue; resolving removes it', async () => {
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByText('BOQ lifecycle');
    await user.click(screen.getByRole('tab', { name: 'Alert centre' }));
    const table = await screen.findByRole('table', { name: 'Alert centre' });
    const ackBtns = within(table).getAllByRole('button', { name: /^Acknowledge / });
    const before = within(table).getAllByRole('row').length;
    await user.click(ackBtns[0]);
    await waitFor(() => expect(screen.getByRole('table', { name: 'Alert centre' })).toBeInTheDocument());
    // still active (ack keeps it in queue), row count unchanged
    expect(within(screen.getByRole('table', { name: 'Alert centre' })).getAllByRole('row').length).toBe(before);
    // resolve it with a note
    const resolveBtn = within(screen.getByRole('table', { name: 'Alert centre' })).getAllByRole('button', { name: /^Resolve / })[0];
    await user.click(resolveBtn);
    const dialog = await screen.findByRole('dialog', { name: 'Resolve alert' });
    await user.type(within(dialog).getByLabelText('Alert note'), 'Handled with client');
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));
    await waitFor(() => {
      const t = screen.getByRole('table', { name: 'Alert centre' });
      expect(within(t).getAllByRole('row').length).toBe(before - 1);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { directiveWorklist } from './domain/worklist';
import type { Directive } from './data/types';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('multi-material BOQ composition (civil practice)', () => {
  it('one BOQ item carries many materials; links upsert by (item, material)', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const boq = await p.listBoq(F);
    await p.setBoqMaterial(F, { boqItemId: boq[0].id, projectId: F, materialRef: 'CEM', coeff: 7.2, confidence: 'confirmed' });
    await p.setBoqMaterial(F, { boqItemId: boq[0].id, projectId: F, materialRef: 'SAND', coeff: 16, confidence: 'confirmed' });
    await p.setBoqMaterial(F, { boqItemId: boq[0].id, projectId: F, materialRef: 'CEM', coeff: 7.5, confidence: 'confirmed' }); // update, not duplicate
    const links = (await p.listBoqMaterial(F)).filter((l) => l.boqItemId === boq[0].id);
    const cem = links.find((l) => l.materialRef === 'CEM');
    expect(links.filter((l) => ['CEM', 'SAND'].includes(l.materialRef))).toHaveLength(2);
    expect(cem?.coeff).toBe(7.5);
    const after = await p.removeBoqMaterial(F, boq[0].id, 'SAND');
    expect(after.filter((l) => l.boqItemId === boq[0].id && l.materialRef === 'SAND')).toHaveLength(0);
  });

  it('generator seeds concrete-class compositions (cement + sand + crush + admixture)', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const links = await p.listBoqMaterial('proj-f14f15');
    expect(links.length).toBeGreaterThan(5);
    const byItem = new Map<string, string[]>();
    for (const l of links) byItem.set(l.boqItemId, [...(byItem.get(l.boqItemId) ?? []), l.materialRef]);
    const concrete = [...byItem.values()].find((refs) => refs.includes('CEM'));
    expect(concrete).toBeDefined();
    expect(concrete).toEqual(expect.arrayContaining(['CEM', 'SAND', 'CRUSH-10', 'CRUSH-20', 'ADMIX']));
  });

  it('composition editor adds a second material to an item', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/mapping');
    await screen.findByRole('table', { name: 'WBS mapping' });
    await user.click(screen.getAllByRole('tab', { name: 'BOQ → Material' })[0]);
    const table = await screen.findByRole('table', { name: 'Material mapping' });
    const row = within(table).getAllByRole('row').find((r) => within(r).queryByLabelText(/Material for/));
    expect(row).toBeDefined();
    const code = within(row!).getByLabelText(/^Material for /).getAttribute('aria-label')!.replace('Material for ', '');
    await user.type(within(row!).getByLabelText(`Material for ${code}`), 'WATER');
    await user.type(within(row!).getByLabelText(`Coeff for ${code}`), '0.18');
    await user.click(within(row!).getByLabelText(`Add material to ${code}`));
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Material mapping' })).getByText('WATER')).toBeInTheDocument());
  });
});

describe('command directives (issue → act → respond)', () => {
  it('lifecycle: issue, respond (acknowledge), comply, close — all persisted', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const d = await p.createDirective({
      nodeId: 'pd-north', projectId: 'proj-f14f15', title: 'Recover material balance before RAR-04',
      detail: 'Sardar & Sons outstanding', issuedBy: 'Comd Engrs', assigneeRole: 'pm', assigneeNodeId: 'proj-f14f15',
      dueDate: '2026-07-10',
    });
    expect(d.status).toBe('issued');
    let all = await p.respondDirective(d.id, 'PM F-14/15', 'Recovery scheduled in RAR-04 draft');
    expect(all.find((x) => x.id === d.id)?.status).toBe('acknowledged');
    all = await p.respondDirective(d.id, 'PM F-14/15', 'Recovered in full', 'complied');
    expect(all.find((x) => x.id === d.id)?.status).toBe('complied');
    expect(all.find((x) => x.id === d.id)?.responses).toHaveLength(2);
    all = await p.setDirectiveStatus(d.id, 'closed', 'Comd Engrs');
    expect(all.find((x) => x.id === d.id)?.status).toBe('closed');
  });

  it('routes pending directives to the assignee worklist and flags overdue', () => {
    const base: Directive = {
      id: 'd1', nodeId: 'pd-north', title: 'T', detail: '', issuedBy: 'PD', assigneeRole: 'pm',
      assigneeNodeId: 'proj-x', dueDate: '2026-01-01', status: 'issued', responses: [], createdAt: '', updatedAt: '',
    };
    const items = directiveWorklist('pm', [base, { ...base, id: 'd2', status: 'complied' }], () => true, (id) => id, '2026-07-04');
    expect(items).toHaveLength(1); // complied ones leave the queue
    expect(items[0].action).toMatch(/OVERDUE/);
    expect(directiveWorklist('fm', [base], () => true, (id) => id, '2026-07-04')).toHaveLength(0);
  });

  it('issues a directive from the dashboard and shows it in the register', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/pd-north');
    await screen.findByRole('table', { name: 'Breakdown' });
    await user.click(screen.getByRole('button', { name: 'Issue directive' }));
    await user.type(screen.getByLabelText('Directive title'), 'Expedite IPC-04 submission');
    await user.click(screen.getByRole('button', { name: 'Issue' }));
    const table = await screen.findByRole('table', { name: 'Directives' });
    expect(within(table).getByText('Expedite IPC-04 submission')).toBeInTheDocument();
    expect(within(table).getByText('awaiting response')).toBeInTheDocument();
  });
});

describe('staff section dashboards', () => {
  beforeEach(() => localStorage.clear());

  it('contracts section rolls up under-command CAs with recovery alarms and PD filter', async () => {
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    const table = await screen.findByRole('table', { name: 'contracts section' }, { timeout: 15000 });
    expect(within(table).getByText('CA value')).toBeInTheDocument();
    expect(within(table).getByText('To recover')).toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(3);
    expect(screen.getByLabelText('Filter by PD')).toBeInTheDocument();
  });

  it('switches to the finance section', async () => {
    const user = userEvent.setup();
    renderAt('/node/pd-north');
    await screen.findByRole('table', { name: 'Breakdown' });
    await screen.findByRole('table', { name: 'contracts section' }, { timeout: 15000 });
    await user.click(screen.getByRole('button', { name: 'Finance Sec' }));
    const table = await screen.findByRole('table', { name: 'finance section' }, { timeout: 15000 });
    expect(within(table).getByText('Liabilities')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { hrApprovalChain } from './domain/apptchain';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('HR authorisation ladder with grade delegation (A3)', () => {
  it('grades 1–16 terminate at Comd Engrs; Gr 17+ and TOHR go to DG via Dir HR', () => {
    expect(hrApprovalChain({ maxGrade: 16 }).map((s) => s.appointmentId)).toEqual(['pd', 'sm_hr_engrs', 'comd_engrs']);
    expect(hrApprovalChain({ maxGrade: 16 }).at(-1)!.action).toBe('approve');
    expect(hrApprovalChain({ maxGrade: 17 }).map((s) => s.appointmentId)).toEqual(['pd', 'sm_hr_engrs', 'comd_engrs', 'dir_hr', 'dg']);
    expect(hrApprovalChain({ kind: 'tohr' }).at(-1)!.appointmentId).toBe('dg');
  });

  it('genesis gate: a new project stays closed until the HR ladder approves', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'G-13 Water Supply', clientName: 'CDA', contractValue: '2500000000' });
    expect(proj.hrApproved).toBe(false);

    const draft = await p.createHrProposal(proj.id, {
      kind: 'key_appointments',
      entries: [
        { title: 'Senior Project Manager', grade: 18, auth: 1 },
        { title: 'Site Engineer', grade: 16, auth: 2 },
      ],
      by: 'Manager HR (HQ PD)',
    });
    let h = await p.submitHrProposal(proj.id, draft.id, 'Manager HR (HQ PD)');
    // max grade 18 → the DG ladder (5 steps)
    expect(h.chain!.steps.map((s) => s.appointmentId)).toEqual(['pd', 'sm_hr_engrs', 'comd_engrs', 'dir_hr', 'dg']);
    for (const who of ['PD', 'SM HR', 'Comd Engrs', 'Dir HR']) h = await p.actOnHrProposal(proj.id, draft.id, who);
    expect((await p.listProjects()).find((x) => x.id === proj.id)!.hrApproved).toBe(false);
    h = await p.actOnHrProposal(proj.id, draft.id, 'DG NLC');
    expect(h.status).toBe('approved');
    // Spec §2 step 5: approval opens the project.
    expect((await p.listProjects()).find((x) => x.id === proj.id)!.hrApproved).toBe(true);
  });

  it('a Gr-16-only proposal approves under Comd Engrs delegation in three acts', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Depot Access Road', clientName: 'NLC', contractValue: '400000000' });
    const d = await p.createHrProposal(proj.id, { kind: 'key_appointments', entries: [{ title: 'Store Incharge', grade: 12, auth: 1 }], by: 'HR' });
    let h = await p.submitHrProposal(proj.id, d.id, 'HR');
    expect(h.chain!.steps).toHaveLength(3);
    for (const who of ['PD', 'SM HR', 'Comd Engrs']) h = await p.actOnHrProposal(proj.id, d.id, who);
    expect(h.status).toBe('approved');
  });
});

describe('project staff lock UI', () => {
  it('locks an unapproved project for project-level appointments and shows the HR card to HQ', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/hq-nlc');
    await screen.findByRole('table', { name: 'Breakdown' });
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Test Locked Project', clientName: 'CDA', contractValue: '100000000' });

    // Site Engineer (project-level appointment) → locked
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'Site Engineer');
    window.history.pushState({}, '', '/');
    renderAt(`/node/${proj.id}`);
    const lock = await screen.findByRole('alert', { name: 'Project locked' });
    expect(lock.textContent).toMatch(/opens to project staff once it is approved/);
  }, 30000);
});

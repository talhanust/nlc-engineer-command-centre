import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { rarApprovalChain, newChain, act } from './domain/apptchain';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('RAR approval ladder (spec §5)', () => {
  it('places Pre-Audit before command approval and ends at Finance payment', () => {
    const ids = rarApprovalChain().map((s) => s.appointmentId);
    expect(ids).toEqual(['contract_engr', 'dpm', 'spm', 'sm_contracts_pd', 'pre_audit', 'dpd', 'pd', 'sm_fin_pd']);
    expect(rarApprovalChain()[4].action).toBe('audit');
    expect(rarApprovalChain().at(-1)!.label).toMatch(/pays & issues cheque/);
  });

  it('provider: submit → eight acts → the RAR lands PAID', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const subs = await p.listSubcontractors(F);
    const draft = await p.createRar(F, { period: 'Jul-2026', subcontractorId: subs[0].id, gross: 5_000_000 });
    expect(draft.status).toBe('draft');
    let r = await p.submitRarApproval(F, draft.rarNo, 'SQS');
    expect(r.chain!.steps).toHaveLength(8);
    for (const who of ['CE', 'DPM', 'SPM', 'MC-PD', 'Pre-Audit', 'DPD', 'PD']) {
      r = await p.actOnRar(F, draft.rarNo, who);
      expect(r.status).toBe('draft'); // not paid until Finance acts
    }
    r = await p.actOnRar(F, draft.rarNo, 'SM Finance');
    expect(r.chain!.status).toBe('approved');
    expect(r.status).toBe('paid');
    expect(r.chain!.history.filter((h) => h.kind === 'acted')).toHaveLength(8);
  });

  it('return by Pre-Audit and resubmission restarts the ladder', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const subs = await p.listSubcontractors(F);
    const draft = await p.createRar(F, { period: 'Aug-2026', subcontractorId: subs[0].id, gross: 3_000_000 });
    let r = await p.submitRarApproval(F, draft.rarNo, 'SQS');
    for (const who of ['CE', 'DPM', 'SPM', 'MC-PD']) r = await p.actOnRar(F, draft.rarNo, who);
    r = await p.returnRar(F, draft.rarNo, 'Pre-Audit', 'Machinery recovery for grader hours missing');
    expect(r.chain!.status).toBe('returned');
    r = await p.resubmitRar(F, draft.rarNo, 'SQS');
    expect(r.chain!.status).toBe('in_progress');
    expect(r.chain!.currentIndex).toBe(0);
  });

  it('pure engine: acting the full RAR ladder approves', () => {
    let st = newChain(rarApprovalChain());
    for (let i = 0; i < 8; i += 1) st = act(st, `step-${i}`);
    expect(st.status).toBe('approved');
  });
});

describe('RAR register chain UI', () => {
  it('submits a draft RAR to the chain and shows it with the Contract Engineer', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('tab', { name: 'RAR Register' });
    // draft AFTER boot (reconcileSeed clears entity keys on first run)
    const p = new LocalDataProvider();
    const subs = await p.listSubcontractors('proj-f14f15');
    const draft = await p.createRar('proj-f14f15', { period: 'Sep-2026', subcontractorId: subs[0].id, gross: 2_000_000 });
    await user.click(screen.getByRole('tab', { name: 'RAR Register' }));
    const reg = await screen.findByRole('table', { name: 'RAR register' });
    await user.click(within(reg).getByLabelText(`Submit ${draft.rarNo} for approval`));
    await waitFor(() => expect(screen.getByLabelText(`Chain ${draft.rarNo}`).textContent).toMatch(/Contract Engineer · step 1\/8/));
  }, 30000);
});

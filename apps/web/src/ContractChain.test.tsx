import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { newChain, act, returnForCorrection, resubmit, currentStep, contractApprovalChain } from './domain/apptchain';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('contract approval ladder (spec §4)', () => {
  it('routes by type and value with intermediates as formal steps (A2)', () => {
    const pdBand = contractApprovalChain('labour', 10_000_000).map((s) => s.appointmentId);
    expect(pdBand).toEqual(['dpm', 'spm', 'sm_contracts_pd', 'dpd', 'pd']);
    const comdBand = contractApprovalChain('labour', 25_000_000).map((s) => s.appointmentId);
    expect(comdBand).toEqual(['dpm', 'spm', 'sm_contracts_pd', 'dpd', 'pd', 'sm_contracts_engrs', 'dy_comd_engrs', 'comd_engrs']);
    const dgBand = contractApprovalChain('sublet', 400_000_000).map((s) => s.appointmentId);
    expect(dgBand.slice(-4)).toEqual(['comd_engrs', 'dir_ops', 'coo_ops', 'dg']);
    expect(contractApprovalChain('sublet', 140_000_000).at(-1)!.appointmentId).toBe('pd');
  });

  it('acts through every step to approval, preserving history', () => {
    let st = newChain(contractApprovalChain('labour', 10_000_000));
    for (const who of ['DPM', 'SPM', 'SM Contracts', 'DPD', 'PD']) st = act(st, who);
    expect(st.status).toBe('approved');
    expect(st.history).toHaveLength(5);
    expect(st.history.every((h) => h.kind === 'acted')).toBe(true);
  });

  it('return-for-correction (A5) and resubmission re-routes at revised value (A4)', () => {
    let st = newChain(contractApprovalChain('labour', 14_000_000)); // PD band
    st = act(st, 'DPM');
    st = returnForCorrection(st, 'SPM', 'Rates on item 3-04 need correction');
    expect(st.status).toBe('returned');
    expect(currentStep(st)).toBeNull();
    // corrected contract now values 16 Mn — the ladder rebuilds to the Comd band
    st = resubmit(st, 'Contract Engineer', contractApprovalChain('labour', 16_000_000));
    expect(st.status).toBe('in_progress');
    expect(st.currentIndex).toBe(0);
    expect(st.steps.at(-1)!.appointmentId).toBe('comd_engrs');
    expect(st.history.map((h) => h.kind)).toEqual(['acted', 'returned', 'resubmitted']);
  });

  it('provider: submit derives kind from the contractor and final act awards (freeze point)', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const labour = await p.addSubcontractor(F, { name: 'Kerb Labour Co', trade: 'Kerbstone' });
    await p.updateSubcontractor(F, labour.id, { kind: 'labor' });
    const draft = await p.createContract(F, { title: 'Kerbstone works P2', subcontractorId: labour.id, scopeBills: ['2'], value: 12_000_000 });
    expect(draft.status).toBe('draft');
    let c = await p.submitContractApproval(F, draft.id, 'Contract Engineer');
    expect(c.chain!.steps.map((s) => s.appointmentId)).toEqual(['dpm', 'spm', 'sm_contracts_pd', 'dpd', 'pd']);
    for (const who of ['DPM', 'SPM', 'SM Contracts PD', 'DPD']) c = await p.actOnContract(F, draft.id, who);
    expect(c.status).toBe('draft'); // not yet
    c = await p.actOnContract(F, draft.id, 'Projects Director');
    expect(c.chain!.status).toBe('approved');
    expect(c.status).toBe('awarded'); // final approval awards — quantities freeze here
  });
});

describe('contracts register chain UI', () => {
  it('submits a draft, walks a step per appointment login, returns with remarks', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    await screen.findByRole('tab', { name: 'Contracts' });
    // create the draft AFTER the app booted (reconcileSeed clears entity keys on first run)
    const p = new LocalDataProvider();
    const labour = await p.addSubcontractor('proj-f14f15', { name: 'Drain Labour Co', trade: 'Drainage' });
    await p.updateSubcontractor('proj-f14f15', labour.id, { kind: 'labor' });
    const draft = await p.createContract('proj-f14f15', { title: 'Drainage works P9', subcontractorId: labour.id, scopeBills: ['3'], value: 9_000_000 });
    await user.click(screen.getByRole('tab', { name: 'Contracts' }));
    const reg = await screen.findByRole('table', { name: 'Contracts register' });
    expect(within(reg).getByText('Drainage works P9')).toBeInTheDocument();

    await user.click(within(reg).getByLabelText(`Submit ${draft.contractNo} for approval`));
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Contracts register' })).getByLabelText(`Chain ${draft.contractNo}`).textContent).toMatch(/Deputy Project Manager · step 1\/5/));

    // sign in as DPM and validate
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'Deputy Project Manager');
    await user.click(await screen.findByLabelText(`validate ${draft.contractNo}`));
    await waitFor(() => expect(screen.getByLabelText(`Chain ${draft.contractNo}`).textContent).toMatch(/Senior Project Manager · step 2\/5/));

    // SPM returns for correction with remarks
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'PM — F-14/F-15'); // holds the SPM appointment
    await user.click(await screen.findByLabelText(`Return ${draft.contractNo}`));
    const dialog = await screen.findByRole('dialog', { name: `Return ${draft.contractNo} for correction` });
    await user.type(within(dialog).getByLabelText('Return remarks'), 'BOQ rates for item 3-02 to be corrected');
    await user.click(within(dialog).getByRole('button', { name: 'Return file' }));
    await waitFor(() => expect(screen.getByText(/returned — BOQ rates/)).toBeInTheDocument());
  }, 30000);
});

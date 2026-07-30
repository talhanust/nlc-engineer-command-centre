import { describe, it, expect } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { rarApprovalChain } from './domain/apptchain';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('EPC subcontractor RAR parity (spec §5, A7)', () => {
  it('the RAR ladder is contractor-kind agnostic — byte-identical for labor, sublet and EPC', () => {
    // rarApprovalChain takes no kind argument: there is exactly one ladder, incl. Pre-Audit.
    const a = rarApprovalChain();
    const b = rarApprovalChain();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.map((s) => s.appointmentId)).toEqual(['contract_engr', 'dpm', 'spm', 'sm_contracts_pd', 'pre_audit', 'dpd', 'pd', 'sm_fin_pd']);
  });

  it('an EPC subcontractor RAR walks the identical Pre-Audit ladder to paid', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    // create an EPC subcontractor
    const sub = await p.addSubcontractor(F, { name: "EPC Partner Ltd", trade: "EPC works" });
    await p.updateSubcontractor(F, sub.id, { kind: 'epc' });
    const epcSub = (await p.listSubcontractors(F)).find((s) => s.id === sub.id)!;
    expect(epcSub.kind).toBe('epc');

    const draft = await p.createRar(F, { period: 'Oct-2026', subcontractorId: sub.id, gross: 8_000_000 });
    let r = await p.submitRarApproval(F, draft.rarNo, 'SQS');
    // identical eight-step ladder including Pre-Audit at index 4
    expect(r.chain!.steps.map((s) => s.appointmentId)).toEqual(['contract_engr', 'dpm', 'spm', 'sm_contracts_pd', 'pre_audit', 'dpd', 'pd', 'sm_fin_pd']);
    for (const who of ['CE', 'DPM', 'SPM', 'MC-PD', 'Pre-Audit', 'DPD', 'PD']) r = await p.actOnRar(F, draft.rarNo, who);
    expect(r.status).toBe('draft');
    r = await p.actOnRar(F, draft.rarNo, 'SM Finance');
    expect(r.status).toBe('paid');
  });
});

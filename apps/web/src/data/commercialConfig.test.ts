import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';
import { ipcDeductionBreakdown, computeNet, DEFAULT_COMMERCIAL_CONFIG } from '../domain/ipc';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('commercial config & retention/tax', () => {
  let p: LocalDataProvider;
  const F = 'proj-f14f15';
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('defaults the project commercial config and persists edits (clamped)', async () => {
    expect(await p.getCommercialConfig(F)).toEqual(DEFAULT_COMMERCIAL_CONFIG);
    const saved = await p.setCommercialConfig(F, { ipcRetentionPct: 8, incomeTaxPct: 6.5, gstPct: 250, rarIncomeTaxPct: 4, rarGstPct: 0 });
    expect(saved.ipcRetentionPct).toBe(8);
    expect(saved.incomeTaxPct).toBe(6.5);
    expect(saved.gstPct).toBe(100); // clamped to 100
    expect(await p.getCommercialConfig(F)).toEqual(saved);
  });

  it('caps subcontractor retention at 5% of contract value', async () => {
    const contracts = await p.listContracts(F);
    const c = contracts[0];
    await p.setContractRetention(F, c.id, 12); // request 12%
    const after = (await p.listContracts(F)).find((x) => x.id === c.id)!;
    expect(after.retentionPct).toBe(5); // capped
  });

  it('applies contract retention + project taxes to a generated RAR net', async () => {
    await p.setCommercialConfig(F, { ipcRetentionPct: 10, incomeTaxPct: 7, gstPct: 0, rarIncomeTaxPct: 7, rarGstPct: 1 });
    const contracts = await p.listContracts(F);
    const c = contracts[0];
    await p.setContractRetention(F, c.id, 4);
    const subs = await p.listSubcontractors(F);
    const rar = await p.createRar(F, { period: 'Jun-2026', subcontractorId: subs[0].id, contractId: c.id, gross: 1_000_000 });
    // 1,000,000 − 4% retention − 7% income tax − 1% gst = 880,000
    expect(Math.round(rar.netPayable)).toBe(880_000);
  });

  it('IPC deduction waterfall includes a GST line', async () => {
    const d = ipcDeductionBreakdown(1_000_000, { d: { retentionPct: 10, incomeTaxPct: 7, gstPct: 2 } });
    expect(d.retention).toBe(100_000);
    expect(d.incomeTax).toBe(70_000);
    expect(d.gst).toBe(20_000);
    expect(d.net).toBe(810_000);
    expect(computeNet(1_000_000, { retentionPct: 10, incomeTaxPct: 7, gstPct: 2 })).toBe(810_000);
  });
});

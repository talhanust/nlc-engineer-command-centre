import { describe, it, expect } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('new project is a clean slate (no seed leakage)', () => {
  it('every commercial/financial list is empty for a freshly created project', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Clean Slate Project', clientName: 'CDA', contractValue: '0' });

    // header figures
    expect(proj.billedToDate).toBe('0');
    expect(proj.receivedToDate).toBe('0');
    expect(proj.plannedPct).toBe(0);
    expect(proj.actualPct).toBe(0);

    // every derived-data source must be empty — no flagship seed bleed-through
    const lists = await Promise.all([
      p.listBoq(proj.id), p.listProgress(proj.id), p.listIpcs(proj.id), p.listRars(proj.id),
      p.listContracts(proj.id), p.listSubcontractors(proj.id), p.listDistributions(proj.id),
      p.listVariations(proj.id), p.listSalients(proj.id), p.listReceipts(proj.id),
      p.listPayments(proj.id), p.listLiabilities(proj.id), p.listSuppliers(proj.id),
      p.listDemands(proj.id), p.listSchedule(proj.id), p.listOverheads(proj.id),
      p.listBankGuarantees(proj.id), p.listProductionRuns(proj.id),
    ]);
    for (const list of lists) expect(list).toHaveLength(0);
  });

  it('a new salient persists alone — no flagship salients mixed in', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Salient Test', clientName: 'NHA', contractValue: '0' });
    await p.upsertSalient(proj.id, { label: 'Length', value: '12.5 km' });
    const salients = await p.listSalients(proj.id);
    expect(salients).toHaveLength(1);
    expect(salients[0].label).toBe('Length');
    expect(salients[0].value).toBe('12.5 km');
  });

  it('the flagship still has its generated data (seed profiles unaffected)', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    expect((await p.listRars('proj-f14f15')).length).toBeGreaterThan(0);
    expect((await p.listContracts('proj-f14f15')).length).toBeGreaterThan(0);
    expect((await p.listBoq('proj-f14f15')).length).toBeGreaterThan(0);
  });
});

describe('CA Value = BOQ Amount (single source of truth)', () => {
  it('importing a BOQ syncs the project contract value to the BOQ total', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'CA Sync Project', clientName: 'CDA', contractValue: '999' });
    expect(proj.contractValue).toBe('999');

    await p.replaceBoq(proj.id, [
      { billNo: '1', code: '1-01', description: 'Earthworks', unit: 'Cu.m', qty: 1000, rate: 500 },   // 500,000
      { billNo: '1', code: '1-02', description: 'Sub-base', unit: 'Cu.m', qty: 200, rate: 1500 },     // 300,000
    ]);
    const after = (await p.listProjects()).find((x) => x.id === proj.id)!;
    expect(after.contractValue).toBe('800000'); // 500k + 300k — one figure everywhere
  });

  it('every seeded project already has CA Value == BOQ total (no drift)', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    for (const id of ['proj-f14f15', 'proj-attock-byp', 'proj-thar-coal-rd', 'proj-i11-infra']) {
      const proj = (await p.listProjects()).find((x) => x.id === id);
      if (!proj) continue;
      const boq = await p.listBoq(id);
      const boqTotal = Math.round(boq.reduce((a, i) => a + i.amount, 0));
      expect(proj.contractValue, `CA drift on ${id}`).toBe(String(boqTotal));
    }
  });

  it('a seed-version upgrade clears stale caches and re-syncs CV to the regenerated BOQ', async () => {
    const kv = memKv();
    setKvStore(kv);
    // simulate an old session: stale single-item BOQ + mismatched stored CV
    kv.setItem('nlc-ecc.seedVersion', JSON.stringify('OLD-VERSION'));
    kv.setItem('nlc-ecc.boq.proj-margalla-rd', JSON.stringify([{ id: 'stale', projectId: 'proj-margalla-rd', billNo: '1', billName: 'b', section: 's', code: '1-01', description: 'stale', unit: 'm', qty: 100, rate: 1000, amount: 100000 }]));
    kv.setItem('nlc-ecc.projects', JSON.stringify([{ id: 'proj-margalla-rd', pdHqId: 'pd-north', clientName: 'CDA', contractValue: '21300000000', billedToDate: '0', receivedToDate: '0', plannedPct: 50, actualPct: 47 }]));
    const p = new LocalDataProvider();
    const proj = (await p.listProjects()).find((x) => x.id === 'proj-margalla-rd')!;
    const boq = await p.listBoq('proj-margalla-rd');
    const boqTotal = Math.round(boq.reduce((a, i) => a + i.amount, 0));
    expect(boq.length).toBeGreaterThan(1);              // stale BOQ was cleared + regenerated
    expect(proj.contractValue).toBe(String(boqTotal));  // CV re-synced to BOQ
  });

  it('re-importing a revised BOQ re-syncs the CA value', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'CA Resync', clientName: 'CDA', contractValue: '0' });
    await p.replaceBoq(proj.id, [{ billNo: '1', code: '1-01', description: 'x', unit: 'm', qty: 10, rate: 100 }]);
    expect((await p.listProjects()).find((x) => x.id === proj.id)!.contractValue).toBe('1000');
    await p.replaceBoq(proj.id, [{ billNo: '1', code: '1-01', description: 'x', unit: 'm', qty: 25, rate: 100 }]);
    expect((await p.listProjects()).find((x) => x.id === proj.id)!.contractValue).toBe('2500');
  });
});

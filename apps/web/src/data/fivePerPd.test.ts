import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('portfolio: five projects per PD HQ', () => {
  let p: LocalDataProvider;
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('every PD HQ commands exactly five projects', async () => {
    const nodes = await p.listNodes();
    const pdHqs = nodes.filter((n) => n.type === 'pd_hq');
    expect(pdHqs.length).toBe(5);
    for (const pd of pdHqs) {
      const under = nodes.filter((n) => n.parentId === pd.id && n.type === 'project');
      expect(under.length, `${pd.name} should have 5 projects`).toBe(5);
    }
    expect(nodes.filter((n) => n.type === 'project').length).toBe(25);
  });

  it('a newly added project carries full hypothetical data', async () => {
    // Sukkur–Hyderabad Motorway is one of the new sindh projects.
    const boq = await p.listBoq('proj-sukkur-moto');
    expect(boq.length).toBeGreaterThan(0);
    const progress = await p.listProgress('proj-sukkur-moto');
    expect(progress.length).toBeGreaterThan(0);
    const bgs = await p.listBankGuarantees('proj-sukkur-moto');
    expect(bgs.length).toBeGreaterThan(0);
    const salients = await p.listSalients('proj-sukkur-moto');
    expect(salients.length).toBeGreaterThan(0);
    // Project header figures are populated.
    const proj = (await p.listProjects()).find((x) => x.id === 'proj-sukkur-moto')!;
    expect(proj).toBeTruthy();
    expect(Number(proj.contractValue)).toBeGreaterThan(0);
  });

  it('the new projects roll up into their PD HQ attention', async () => {
    // Balochistan gained two projects; its roll-up should span up to 5.
    const roll = await p.attentionFor('pd-bln');
    expect(roll.projectCount).toBe(5);
  });
});

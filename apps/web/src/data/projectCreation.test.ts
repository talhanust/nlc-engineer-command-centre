import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider } from './LocalDataProvider';

// Local mode uses localStorage; clear between tests for isolation.
beforeEach(() => localStorage.clear());

describe('createProject — new field set', () => {
  it('persists code, dates, CA amount and coordinates; defaults progress to 0', async () => {
    const p = new LocalDataProvider();
    const created = await p.createProject({
      pdHqId: 'pd-north', name: 'Skardu Bypass', clientName: 'NHA',
      contractValue: '3500000000', projectCode: 'NLC-SKB-01',
      commencementDate: '2026-07-01', completionDate: '2027-12-31',
      lat: 35.3, lng: 75.55, location: 'Skardu',
    });
    expect(created.projectCode).toBe('NLC-SKB-01');
    expect(created.commencementDate).toBe('2026-07-01');
    expect(created.completionDate).toBe('2027-12-31');
    expect(created.contractValue).toBe('3500000000');
    expect(created.lat).toBe(35.3);
    expect(created.location).toBe('Skardu');
    // % plan / % achieved are no longer collected → default to 0
    expect(created.plannedPct).toBe(0);
    expect(created.actualPct).toBe(0);

    const back = (await p.listProjects()).find((x) => x.id === created.id);
    expect(back?.projectCode).toBe('NLC-SKB-01');
    expect(back?.lat).toBe(35.3);
  });

  it('works with only the required fields (name + CA + pd hq)', async () => {
    const p = new LocalDataProvider();
    const created = await p.createProject({
      pdHqId: 'pd-kpk', name: 'Minimal Project', clientName: '—', contractValue: '1000000',
    });
    expect(created.plannedPct).toBe(0);
    expect(created.projectCode).toBeUndefined();
    expect(created.lat).toBeUndefined();
  });
});

describe('org node location', () => {
  it('seeds HQ and PD HQ coordinates', async () => {
    const p = new LocalDataProvider();
    const nodes = await p.listNodes();
    const hq = nodes.find((n) => n.id === 'hq-nlc');
    const pd = nodes.find((n) => n.id === 'pd-kpk');
    expect(typeof hq?.lat).toBe('number');
    expect(typeof pd?.lat).toBe('number');
    expect(pd?.location).toBeTruthy();
  });

  it('updates a PD HQ location', async () => {
    const p = new LocalDataProvider();
    const updated = await p.updateNodeLocation('pd-sindh', { lat: 25.0, lng: 67.1, location: 'Karachi South' });
    expect(updated.lat).toBe(25.0);
    expect(updated.location).toBe('Karachi South');
    const back = (await p.listNodes()).find((n) => n.id === 'pd-sindh');
    expect(back?.lat).toBe(25.0);
  });
});

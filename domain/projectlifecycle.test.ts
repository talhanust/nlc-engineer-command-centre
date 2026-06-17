import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider } from '../data/LocalDataProvider';

describe('project lifecycle (provider)', () => {
  let p: LocalDataProvider;
  beforeEach(() => { localStorage.clear(); p = new LocalDataProvider(); });

  it('creates a project with its org node under a PD HQ', async () => {
    const proj = await p.createProject({
      pdHqId: 'pd-north', name: 'Ring Road Phase 2', clientName: 'NHA',
      contractValue: '5000000000', plannedPct: 12, actualPct: 9,
    });
    const projects = await p.listProjects();
    const nodes = await p.listNodes();
    expect(projects.some((x) => x.id === proj.id)).toBe(true);
    const node = nodes.find((n) => n.id === proj.id);
    expect(node?.type).toBe('project');
    expect(node?.parentId).toBe('pd-north');
  });

  it('updates progress fields', async () => {
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'X', clientName: 'C', contractValue: '100', plannedPct: 0, actualPct: 0 });
    await p.updateProject(proj.id, { actualPct: 42, billedToDate: '60', receivedToDate: '50' });
    const updated = (await p.listProjects()).find((x) => x.id === proj.id)!;
    expect(updated.actualPct).toBe(42);
    expect(updated.billedToDate).toBe('60');
  });

  it('archives and restores a project', async () => {
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Y', clientName: 'C', contractValue: '100', plannedPct: 0, actualPct: 0 });
    await p.archiveProject(proj.id);
    expect((await p.listProjects()).some((x) => x.id === proj.id)).toBe(false);
    expect((await p.listNodes()).some((n) => n.id === proj.id)).toBe(false);
    expect((await p.listArchivedProjects()).some((x) => x.id === proj.id)).toBe(true);
    await p.restoreProject(proj.id);
    expect((await p.listProjects()).some((x) => x.id === proj.id)).toBe(true);
  });

  it('adds a PD HQ under HQ Engineers', async () => {
    const pd = await p.addPdHq('PD Gilgit');
    expect(pd.type).toBe('pd_hq');
    expect(pd.parentId).toBe('hq-engrs');
    expect((await p.listNodes()).some((n) => n.id === pd.id)).toBe(true);
  });

  it('records a monthly actual', async () => {
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Z', clientName: 'C', contractValue: '100', plannedPct: 0, actualPct: 0 });
    const series = await p.listMonthlySeries(proj.id);
    const month = series[0].month;
    const next = await p.setMonthlyActual(proj.id, month, 7);
    expect(next.find((s) => s.month === month)?.actual).toBe(7);
  });

  it('saves project location via updateProject', async () => {
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Loc', clientName: 'C', contractValue: '100', plannedPct: 0, actualPct: 0 });
    await p.updateProject(proj.id, { lat: 33.69, lng: 73.06, location: 'Islamabad' });
    const got = (await p.listProjects()).find((x) => x.id === proj.id)!;
    expect(got.lat).toBe(33.69);
    expect(got.location).toBe('Islamabad');
  });

  it('adds, lists and deletes progress photos', async () => {
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'Pix', clientName: 'C', contractValue: '100', plannedPct: 0, actualPct: 0 });
    const ph = await p.addPhoto(proj.id, { url: 'https://x/y.jpg', caption: 'Pour 1', dated: '2026-06-01' });
    expect((await p.listPhotos(proj.id)).length).toBe(1);
    await p.deletePhoto(proj.id, ph.id);
    expect((await p.listPhotos(proj.id)).length).toBe(0);
  });
});

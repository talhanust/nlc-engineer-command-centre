import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider, setKvStore, type KvStore } from './LocalDataProvider';
import { validatedDayworkValue } from '../domain/dayworks';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const P = 'proj-dw';

describe('dayworks provider lifecycle', () => {
  let p: LocalDataProvider;
  beforeEach(() => { setKvStore(memKv()); p = new LocalDataProvider(); });

  it('books a draft sheet, which does not yet count toward value', async () => {
    const sheet = await p.upsertDaywork(P, {
      boqItemId: 'i1', date: '2026-07-01', ref: 'DW-01', description: 'Extra excavation',
      resources: [{ kind: 'labour', description: 'Mason', unit: 'hr', qty: 10, rate: 500 }],
      enteredBy: 'sqs',
    });
    expect(sheet.status).toBe('draft');
    expect(validatedDayworkValue(await p.listDayworks(P), 'i1')).toBe(0); // draft excluded
  });

  it('validating a sheet makes its value count for the line', async () => {
    const sheet = await p.upsertDaywork(P, {
      boqItemId: 'i1', date: '2026-07-01', description: 'x',
      resources: [{ kind: 'labour', description: 'Mason', unit: 'hr', qty: 10, rate: 500 }, { kind: 'plant', description: 'Excavator', unit: 'hr', qty: 2, rate: 3000 }],
      enteredBy: 'sqs',
    });
    await p.validateDaywork(P, sheet.id, 'pm');
    expect(validatedDayworkValue(await p.listDayworks(P), 'i1')).toBe(10 * 500 + 2 * 3000); // 11000
  });

  it('editing a validated sheet resets it to draft (must re-validate)', async () => {
    const sheet = await p.upsertDaywork(P, { boqItemId: 'i1', date: '2026-07-01', description: 'x', resources: [{ kind: 'labour', description: 'M', unit: 'hr', qty: 1, rate: 500 }], enteredBy: 'sqs' });
    await p.validateDaywork(P, sheet.id, 'pm');
    const edited = await p.upsertDaywork(P, { id: sheet.id, boqItemId: 'i1', date: '2026-07-01', description: 'x', resources: [{ kind: 'labour', description: 'M', unit: 'hr', qty: 5, rate: 500 }], enteredBy: 'sqs' });
    expect(edited.status).toBe('draft');
    expect(validatedDayworkValue(await p.listDayworks(P), 'i1')).toBe(0);
  });

  it('deletes a sheet', async () => {
    const sheet = await p.upsertDaywork(P, { boqItemId: 'i1', date: '2026-07-01', description: 'x', resources: [{ kind: 'labour', description: 'M', unit: 'hr', qty: 1, rate: 500 }] });
    await p.deleteDaywork(P, sheet.id);
    expect(await p.listDayworks(P)).toHaveLength(0);
  });

  it('audits booking and validation', async () => {
    const sheet = await p.upsertDaywork(P, { boqItemId: 'i1', date: '2026-07-01', ref: 'DW-09', description: 'x', resources: [{ kind: 'labour', description: 'M', unit: 'hr', qty: 1, rate: 500 }] });
    await p.validateDaywork(P, sheet.id, 'pm');
    const audit = await p.listAudit();
    expect(audit.some((a) => a.entity === 'Daywork' && a.ref === 'DW-09')).toBe(true);
  });
});

describe('dayworks flow into the BOQ executed value', () => {
  it('a validated daywork sheet shows as the dayworks line executed value', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'DW BOQ', clientName: 'CDA', contractValue: '0' });
    await p.replaceBoq(proj.id, [
      { billNo: '9', code: 'DW-1', description: 'Dayworks', unit: 'DW', qty: 1, rate: 0, lineType: 'dayworks' },
    ]);
    const boq = await p.listBoq(proj.id);
    const sheet = await p.upsertDaywork(proj.id, { boqItemId: boq[0].id, date: '2026-07-01', description: 'x', resources: [{ kind: 'labour', description: 'M', unit: 'hr', qty: 10, rate: 500 }] });
    await p.validateDaywork(proj.id, sheet.id, 'pm');

    const { buildBoqRows } = await import('../domain/boqrollup');
    const { dayworkValueByItem } = await import('../domain/dayworks');
    const dw = Object.fromEntries(dayworkValueByItem(await p.listDayworks(proj.id)));
    const rows = buildBoqRows(await p.listBoq(proj.id), await p.listDistributions(proj.id), await p.listProgress(proj.id), { dayworkValue: dw });
    expect(rows[0].executedValue).toBe(5000);
    expect(rows[0].status).toBe('complete');
  });
});

describe('dayworks into the IPC bill', () => {
  it('a validated daywork becomes pending IPC value, then nets off once billed', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const proj = await p.createProject({ pdHqId: 'pd-north', name: 'DW IPC', clientName: 'CDA', contractValue: '0' });
    await p.replaceBoq(proj.id, [{ billNo: '9', code: 'DW-1', description: 'Dayworks', unit: 'DW', qty: 1, rate: 0, lineType: 'dayworks' }]);
    const boq = await p.listBoq(proj.id);
    const s = await p.upsertDaywork(proj.id, { boqItemId: boq[0].id, date: '2026-07-01', description: 'x', resources: [{ kind: 'labour', description: 'M', unit: 'hr', qty: 10, rate: 500 }] });
    await p.validateDaywork(proj.id, s.id, 'pm');

    const { dayworkBilling } = await import('../domain/dayworks');
    const dwIds = [boq[0].id];

    // Before any IPC: 5000 pending.
    let pending = dayworkBilling(await p.listDayworks(proj.id), await p.listIpcs(proj.id), dwIds);
    expect(pending[0].pending).toBe(5000);

    // Bill it in an IPC (qty 1 × amount), like the UI does.
    await p.createIpc(proj.id, { period: 'M1', date: '2026-07-05', gross: 5000, lines: [{ boqItemId: boq[0].id, qty: 1, rate: 5000, amount: 5000 }] });

    // Now nothing pending — it's been certified.
    pending = dayworkBilling(await p.listDayworks(proj.id), await p.listIpcs(proj.id), dwIds);
    expect(pending).toHaveLength(0);
  });
});

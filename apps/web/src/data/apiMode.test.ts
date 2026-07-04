import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalDataProvider, setKvStore } from './LocalDataProvider';
import { RemoteKvStore } from './RemoteKvStore';

// A fake backend document store standing in for /api/state.
function installFakeServer() {
  const server = new Map<string, unknown>();
  const puts: string[] = [];
  global.fetch = vi.fn(async (url: any, opts: any = {}) => {
    const u = String(url);
    const method = opts.method ?? 'GET';
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as any);
    if (u.endsWith('/api/state') && method === 'GET') {
      return ok({ docs: Object.fromEntries(server) });
    }
    if (u.includes('/api/state/') && method === 'PUT') {
      const key = decodeURIComponent(u.split('/api/state/')[1]);
      server.set(key, JSON.parse(opts.body));
      puts.push(key);
      return ok({ ok: true });
    }
    if (u.includes('/api/state/') && method === 'DELETE') {
      server.delete(decodeURIComponent(u.split('/api/state/')[1]));
      return ok({ ok: true });
    }
    return ok({});
  }) as any;
  return { server, puts };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('api mode — provider logic over the remote KV store', () => {
  let server: Map<string, unknown>;
  let puts: string[];

  beforeEach(async () => {
    ({ server, puts } = installFakeServer());
    const remote = new RemoteKvStore('', 'demo');
    await remote.hydrate(); // empty server → seeds come from the provider
    setKvStore(remote);
  });

  it('serves seeded data through the remote store and writes seeds through', async () => {
    const p = new LocalDataProvider();
    const boq = await p.listBoq('proj-f14f15');
    expect(boq.length).toBeGreaterThan(0); // seed surfaced via the remote store
    await flush();
    expect(puts.some((k) => k.includes('boq'))).toBe(true); // seed persisted to the server
  });

  it('persists a mutation and reflects it on read (write-through)', async () => {
    const p = new LocalDataProvider();
    await p.upsertOverhead('proj-f14f15', { category: 'Test cat', month: 'Jun-26', plannedCost: 1234 });
    const oh = await p.listOverheads('proj-f14f15');
    expect(oh.some((o) => o.category === 'Test cat')).toBe(true);
    await flush();
    expect([...server.keys()].some((k) => k.includes('overheads'))).toBe(true);
  });

  it('runs a workflow transition over the remote store', async () => {
    const p = new LocalDataProvider();
    await p.advanceBoqWorkflow('proj-f14f15', 'sqs'); // first stage role
    const wf = await p.getBoqWorkflow('proj-f14f15');
    expect(wf.stageIndex).toBeGreaterThan(0);
    await flush();
    expect([...server.keys()].some((k) => k.includes('boqwf'))).toBe(true);
  });

  it('persists new commercial entities (variations) and survives a fresh hydrate', async () => {
    const p = new LocalDataProvider();
    await p.createVariation('proj-f14f15', { title: 'New culvert at km 7', type: 'addition', amount: 1_000_000 });
    await flush();
    expect([...server.keys()].some((k) => k.includes('variations'))).toBe(true);
    // New session: a fresh remote store hydrated from the same backend documents.
    const remote2 = new RemoteKvStore('', 'demo');
    await remote2.hydrate();
    setKvStore(remote2);
    const p2 = new LocalDataProvider();
    const vos = await p2.listVariations('proj-f14f15');
    expect(vos.some((v) => v.title === 'New culvert at km 7')).toBe(true);
  });

  it('persists bank guarantees and escalation indices through /api/state', async () => {
    const p = new LocalDataProvider();
    await p.addBankGuarantee('proj-f14f15', { kind: 'mob', party: 'client', bgNo: 'BG-TEST-9', bank: 'NBP', amount: 500, status: 'active' });
    await p.setEscalationComponents('proj-f14f15', [{ label: 'Steel', weight: 0.3, baseIndex: 100, currentIndex: 120 }]);
    await flush();
    expect([...server.keys()].some((k) => k.includes('bankguarantees'))).toBe(true);
    expect([...server.keys()].some((k) => k.includes('escindices'))).toBe(true);
    const remote2 = new RemoteKvStore('', 'demo');
    await remote2.hydrate();
    setKvStore(remote2);
    const p2 = new LocalDataProvider();
    expect((await p2.listBankGuarantees('proj-f14f15')).some((b) => b.bgNo === 'BG-TEST-9')).toBe(true);
    expect((await p2.listEscalationComponents('proj-f14f15')).some((c) => c.label === 'Steel')).toBe(true);
  });
});

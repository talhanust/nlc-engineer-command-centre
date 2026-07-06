import { describe, it, expect } from 'vitest';
import { itemFreezes, distributionChangeBlocked } from './domain/distributionFreeze';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import type { BoqItem, Contract, Distribution } from './data/types';

function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const boq = (id: string, qty: number): BoqItem =>
  ({ id, projectId: 'p', billNo: '1', billName: 'b', section: 's', code: id, description: id, unit: 'Cu.m', qty, rate: 100, amount: qty * 100 });
const contract = (subId: string, status: Contract['status']): Contract =>
  ({ id: `c-${subId}`, projectId: 'p', contractNo: subId, title: 't', subcontractorId: subId, scopeBills: ['1'], value: 1, status });
const dist = (boqItemId: string, subcontractorId: string, allocatedQty: number): Distribution =>
  ({ boqItemId, projectId: 'p', mode: 'sublet', subcontractorId, allocatedQty });

describe('distribution freeze math (spec §4)', () => {
  it('freezes only quantities distributed to AWARDED contractors', () => {
    const items = [boq('a', 100)];
    const contracts = [contract('sub1', 'awarded'), contract('sub2', 'draft')];
    const dists = [dist('a', 'sub1', 40), dist('a', 'sub2', 30)];
    const f = itemFreezes(items, contracts, dists).get('a')!;
    expect(f.frozenQty).toBe(40);       // sub2 draft does not freeze
    expect(f.remainingQty).toBe(60);
    expect(f.frozenBy).toEqual(['sub1']);
  });

  it('blocks reducing or reassigning a frozen allocation, allows awarding the remainder', () => {
    const items = [boq('a', 100)];
    const contracts = [contract('sub1', 'awarded')];
    const dists = [dist('a', 'sub1', 40)];
    const freeze = itemFreezes(items, contracts, dists).get('a');
    // reduce sub1's frozen 40 → 20: blocked
    expect(distributionChangeBlocked(dist('a', 'sub1', 20), dist('a', 'sub1', 40), freeze)).toMatch(/frozen/);
    // reassign sub1's allocation to sub2: blocked
    expect(distributionChangeBlocked(dist('a', 'sub2', 40), dist('a', 'sub1', 40), freeze)).toMatch(/frozen/);
    // award the remaining 60 to sub2 (new allocation): allowed
    expect(distributionChangeBlocked(dist('a', 'sub2', 60), undefined, freeze)).toBeNull();
    // over-allocate remainder (70 > 60 left): blocked
    expect(distributionChangeBlocked(dist('a', 'sub2', 70), undefined, freeze)).toMatch(/remains/);
  });
});

describe('setDistribution enforcement (provider)', () => {
  it('throws when a change touches a frozen allocation', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    const items = await p.listBoq(F);
    const subs = await p.listSubcontractors(F);
    const target = items[0];
    const sub = subs.find((s) => s.kind === 'sublet') ?? subs[0];

    // award a contract to `sub` and distribute part of the item to them
    const c = await p.createContract(F, { title: 'Sublet A', subcontractorId: sub.id, scopeBills: [target.billNo], value: 5_000_000, awardDate: '2026-07-01' });
    expect(c.status).toBe('awarded');
    await p.setDistribution(F, { boqItemId: target.id, projectId: F, mode: 'sublet', subcontractorId: sub.id, allocatedQty: Math.min(10, target.qty) });

    const freezes = await p.listItemFreezes(F);
    expect(freezes.find((f) => f.boqItemId === target.id)?.frozenQty).toBeGreaterThan(0);

    // reducing that frozen allocation now throws
    await expect(
      p.setDistribution(F, { boqItemId: target.id, projectId: F, mode: 'sublet', subcontractorId: sub.id, allocatedQty: 1 }),
    ).rejects.toThrow(/frozen/);
  });
});

import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('lock enforcement UI', () => {
  it('locking the BOQ disables the Import button', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    // drive the BOQ lock to 'locked' directly through the provider
    await p.submitBaselineLock(F, 'boq', 'SQS');
    for (const who of ['PE', 'DPM', 'SPM', 'Mgr Plans']) await p.actOnBaselineLock(F, 'boq', who);
    const lock = await p.getBaselineLock(F, 'boq');
    expect(lock.status).toBe('locked');

    render(<MemoryRouter initialEntries={[`/node/${F}/commercial`]}><App /></MemoryRouter>);
    const banner = await screen.findByRole('status', { name: 'BOQ lock' });
    await waitFor(() => expect(within(banner).getByText(/Locked by/)).toBeInTheDocument());
    // onChange(true) has propagated once the banner shows Locked; Import is now disabled
    await waitFor(() => expect(screen.getByRole('button', { name: /Import/ })).toBeDisabled(), { timeout: 3000 });
  }, 30000);
});

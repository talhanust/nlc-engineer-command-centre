import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { LocalDataProvider, setKvStore, type KvStore } from './data/LocalDataProvider';
import { baselineLockChain, baselineRevisionChain, newChain, act } from './domain/apptchain';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}
function memKv(): KvStore {
  const m = new Map<string, string>();
  return { getItem: (k) => (m.has(k) ? m.get(k)! : null), setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('baseline lock ladders (spec §3)', () => {
  it('BOQ locks at Manager Plans after project validation', () => {
    expect(baselineLockChain('boq').map((s) => s.appointmentId)).toEqual(['planning_engr', 'dpm', 'spm', 'sm_plans_pd']);
    expect(baselineLockChain('boq').at(-1)!.label).toMatch(/locks/);
  });
  it('mapping validation includes procurement and terminates at SM Plans', () => {
    const ids = baselineLockChain('mapping').map((s) => s.appointmentId);
    expect(ids).toEqual(['planning_engr', 'proc_engr', 'dpm', 'spm', 'sm_proc_pd', 'sm_plans_pd']);
  });
  it('schedule is the shortest ladder', () => {
    expect(baselineLockChain('schedule').map((s) => s.appointmentId)).toEqual(['dpm', 'spm', 'sm_plans_pd']);
  });
  it('revision always requires Comd Engrs authorisation', () => {
    for (const k of ['boq', 'schedule', 'mapping'] as const) {
      expect(baselineRevisionChain(k).at(-1)!.appointmentId).toBe('comd_engrs');
    }
  });
});

describe('baseline lock provider', () => {
  it('submit → validate ladder → locked; then revision runs a Comd ladder and re-lock bumps revisionNo', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    let lock = await p.getBaselineLock(F, 'boq');
    expect(lock.status).toBe('open');
    expect(lock.revisionNo).toBe(0);

    lock = await p.submitBaselineLock(F, 'boq', 'SQS');
    expect(lock.status).toBe('locking');
    expect(lock.chain!.steps).toHaveLength(4);
    for (const who of ['Planning Engr', 'DPM', 'SPM']) {
      lock = await p.actOnBaselineLock(F, 'boq', who);
      expect(lock.status).toBe('locking');
    }
    lock = await p.actOnBaselineLock(F, 'boq', 'Manager Plans');
    expect(lock.status).toBe('locked');
    expect(lock.lockedBy).toBe('Manager Plans');
    expect(lock.revisionNo).toBe(0);

    // revision
    lock = await p.requestBaselineRevision(F, 'boq', 'SPM');
    expect(lock.status).toBe('revising');
    expect(lock.chain!.steps.at(-1)!.appointmentId).toBe('comd_engrs');
    for (const who of ['SPM', 'SM Plans', 'Comd Engrs']) lock = await p.actOnBaselineLock(F, 'boq', who);
    expect(lock.status).toBe('locked');
    expect(lock.revisionNo).toBe(1); // re-lock after revision bumps the counter
  });

  it('return-for-correction holds the lock in progress', async () => {
    setKvStore(memKv());
    const p = new LocalDataProvider();
    const F = 'proj-f14f15';
    await p.submitBaselineLock(F, 'schedule', 'PE');
    let lock = await p.actOnBaselineLock(F, 'schedule', 'DPM');
    lock = await p.returnBaselineLock(F, 'schedule', 'SPM', 'Activity IDs mismatch the WBS codes');
    expect(lock.chain!.status).toBe('returned');
    lock = await p.getBaselineLock(F, 'schedule');
    expect(lock.status).toBe('locking'); // not yet locked
  });

  it('pure engine: acting the full mapping ladder approves', () => {
    let st = newChain(baselineLockChain('mapping'));
    for (let i = 0; i < st.steps.length; i += 1) st = act(st, `s${i}`);
    expect(st.status).toBe('approved');
  });
});

describe('baseline lock banner UI', () => {
  it('shows the BOQ lock banner and submits for lock', async () => {
    setKvStore(window.localStorage as unknown as KvStore);
    localStorage.clear();
    const user = userEvent.setup();
    renderAt('/node/proj-f14f15/commercial');
    // BOQ is the default commercial sub-tab
    const banner = await screen.findByRole('status', { name: 'BOQ lock' });
    expect(within(banner).getByText(/Draft — not yet locked/)).toBeInTheDocument();
    // sign in as SQS to start the lock
    await user.selectOptions(screen.getAllByLabelText('Switch user')[0], 'Senior Quantity Surveyor');
    await user.click(await within(await screen.findByRole('status', { name: 'BOQ lock' })).findByLabelText('Submit boq for lock'));
    await waitFor(() => expect(within(screen.getByRole('status', { name: 'BOQ lock' })).getByText(/Locking in progress/)).toBeInTheDocument());
  }, 30000);
});

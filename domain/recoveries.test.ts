import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataProvider } from '../data/LocalDataProvider';
import { transitionRole, IPC_STATUS_LABEL } from './ipc';

describe('IPC chain — spec roles + labels', () => {
  it('labels statuses in spec terms and names the responsible role', () => {
    expect(IPC_STATUS_LABEL.draft).toMatch(/SQS/);
    expect(IPC_STATUS_LABEL.submitted).toMatch(/consultant/i);
    expect(transitionRole('draft')).toBe('pm');   // PM validates & submits
    expect(transitionRole('approved')).toBe('fm'); // FM records receipt
  });
});

describe('RAR recoveries-first gate', () => {
  let p: LocalDataProvider;
  beforeEach(() => { localStorage.clear(); p = new LocalDataProvider(); });

  it('blocks the FM pay step until due recoveries are netted', async () => {
    // seeded RAR-02 on the flagship; give its subcontractor an outstanding advance
    const rars = await p.listRars('proj-f14f15');
    const rar = rars[0];
    await p.addAdvance('proj-f14f15', {
      dated: '2026-05-01', kind: 'mob', direction: 'sub_disbursement',
      subcontractorId: rar.subcontractorId, amount: 5_000_000,
    });
    // drive the interim chain to the FM pay stage
    await p.advanceRarChain('proj-f14f15', rar.rarNo, 'pm');
    await p.advanceRarChain('proj-f14f15', rar.rarNo, 'preaudit');
    await p.advanceRarChain('proj-f14f15', rar.rarNo, 'pd');
    await expect(p.advanceRarChain('proj-f14f15', rar.rarNo, 'fm')).rejects.toThrow(/recoveries/i);
    // net recoveries, then payment proceeds
    await p.setRarRecoveriesNetted('proj-f14f15', rar.rarNo, true);
    const paid = await p.advanceRarChain('proj-f14f15', rar.rarNo, 'fm');
    expect(paid.status).toBe('paid');
  });
});

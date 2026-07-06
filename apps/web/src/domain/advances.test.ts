import { describe, it, expect } from 'vitest';
import { advanceSummary, bgExpiryStatus, bgActiveCover } from './advances';
import type { Advance, BankGuarantee } from '../data/types';

const adv = (over: Partial<Advance>): Advance => ({
  id: 'a', projectId: 'p', kind: 'mob', direction: 'client_receipt', amount: 0, dated: '2026-01-01', ...over,
});

describe('advances domain', () => {
  it('summarises two-sided advances by kind', () => {
    const advs = [
      adv({ kind: 'mob', direction: 'client_receipt', amount: 1000 }),
      adv({ kind: 'mob', direction: 'sub_disbursement', amount: 400 }),
      adv({ kind: 'secure', direction: 'client_receipt', amount: 999 }),
    ];
    const s = advanceSummary(advs, 'mob', 200);
    expect(s.received).toBe(1000);
    expect(s.disbursed).toBe(400);
    expect(s.recovered).toBe(200);
    expect(s.outstandingClient).toBe(800);
    expect(s.outstandingSub).toBe(400);
  });

  it('classifies BG expiry and sums active cover', () => {
    const today = new Date('2026-06-18T00:00:00');
    expect(bgExpiryStatus('2026-12-31', today)).toBe('active');
    expect(bgExpiryStatus('2026-07-10', today)).toBe('expiring');
    expect(bgExpiryStatus('2026-01-01', today)).toBe('expired');
    expect(bgExpiryStatus(undefined, today)).toBe('none');
    const bgs: BankGuarantee[] = [
      { id: '1', projectId: 'p', kind: 'mob', party: 'client', bgNo: 'A', bank: 'X', amount: 100, status: 'active' },
      { id: '2', projectId: 'p', kind: 'mob', party: 'client', bgNo: 'B', bank: 'X', amount: 50, status: 'released' },
    ];
    expect(bgActiveCover(bgs, 'mob')).toBe(100);
  });
});

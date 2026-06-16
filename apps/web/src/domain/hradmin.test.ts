import { describe, it, expect } from 'vitest';
import { expiryStatus, expiringCredentials, daysToExpiry } from './credentials';
import { diffEstablishment } from './estabversion';
import { nextTransferStage } from './postingchain';
import type { HrCredential, HrUnit } from '../data/types';

const TODAY = new Date('2026-06-16T00:00:00');

describe('credential expiry', () => {
  it('classifies expiry windows', () => {
    expect(expiryStatus(undefined, TODAY)).toBe('none');
    expect(expiryStatus('2026-06-10', TODAY)).toBe('expired');
    expect(expiryStatus('2026-07-10', TODAY)).toBe('expiring'); // within 90d
    expect(expiryStatus('2027-01-01', TODAY)).toBe('valid');
  });
  it('computes days and sorts attention list', () => {
    expect(daysToExpiry('2026-06-26', TODAY)).toBe(10);
    const creds: HrCredential[] = [
      { id: 'a', nodeId: 'n', personId: 'p', personName: 'A', kind: 'PEC', ref: 'X', expires: '2027-01-01' },
      { id: 'b', nodeId: 'n', personId: 'p', personName: 'B', kind: 'License', ref: 'Y', expires: '2026-06-10' },
      { id: 'c', nodeId: 'n', personId: 'p', personName: 'C', kind: 'Medical', ref: 'Z', expires: '2026-07-01' },
    ];
    const att = expiringCredentials(creds, TODAY);
    expect(att.map((c) => c.id)).toEqual(['b', 'c']); // expired first, then soonest
  });
});

describe('establishment diff', () => {
  const base: HrUnit[] = [
    { id: 'u1', nodeId: 'n', parentId: null, title: 'PM', auth: 1, held: 1, order: 0 },
    { id: 'u2', nodeId: 'n', parentId: 'u1', title: 'QS', auth: 4, held: 3, order: 0 },
    { id: 'u3', nodeId: 'n', parentId: 'u1', title: 'Old Sec', auth: 2, held: 2, order: 1 },
  ];
  const current: HrUnit[] = [
    { id: 'u1', nodeId: 'n', parentId: null, title: 'PM', auth: 1, held: 1, order: 0 },
    { id: 'u2', nodeId: 'n', parentId: 'u1', title: 'QS', auth: 6, held: 4, order: 0 }, // changed
    { id: 'u4', nodeId: 'n', parentId: 'u1', title: 'New Sec', auth: 3, held: 0, order: 2 }, // added
  ];
  it('detects added / removed / changed and totals deltas', () => {
    const d = diffEstablishment(base, current);
    expect(d.added.map((x) => x.id)).toEqual(['u4']);
    expect(d.removed.map((x) => x.id)).toEqual(['u3']);
    expect(d.changed.map((x) => x.id)).toEqual(['u2']);
    expect(d.changed[0]).toMatchObject({ authFrom: 4, authTo: 6, heldFrom: 3, heldTo: 4 });
    // auth: base 7 → current 10 = +3 ; held: base 6 → current 5 = -1
    expect(d.authDelta).toBe(3);
    expect(d.heldDelta).toBe(-1);
  });
});

describe('posting chain', () => {
  it('walks stages and stops at terminals', () => {
    expect(nextTransferStage('raised')).toBe('recommended');
    expect(nextTransferStage('approved')).toBe('effected');
    expect(nextTransferStage('effected')).toBeNull();
    expect(nextTransferStage('rejected')).toBeNull();
  });
});

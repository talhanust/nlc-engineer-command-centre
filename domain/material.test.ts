import { describe, it, expect } from 'vitest';
import { reconcileMaterials } from './material';
import type { Crv, MaterialIssue } from '../data/types';

function crv(code: string, qty: number): Crv {
  return { id: 'c', projectId: 'p', crvNo: 'CRV-01', seq: 1, poId: 'po', received: [{ code, qtyReceived: qty }], overReceipt: false };
}
function issue(code: string, qty: number): MaterialIssue {
  return { id: 'i', projectId: 'p', dated: '2026-06-01', materialCode: code, qty, issuedTo: 'work' };
}

describe('material reconciliation', () => {
  it('computes balance on hand = received − issued', () => {
    const rows = reconcileMaterials([crv('M-CEM', 20000)], [issue('M-CEM', 14500)]);
    expect(rows[0]).toEqual({ code: 'M-CEM', received: 20000, issued: 14500, balance: 5500 });
  });

  it('flags a negative balance when issues exceed receipts', () => {
    const rows = reconcileMaterials([], [issue('M-CEM', 5000)]);
    expect(rows[0].balance).toBe(-5000);
  });

  it('merges multiple CRVs and issues per code', () => {
    const rows = reconcileMaterials(
      [crv('STEEL', 100), crv('STEEL', 50)],
      [issue('STEEL', 30), issue('STEEL', 20)],
    );
    const steel = rows.find((r) => r.code === 'STEEL')!;
    expect(steel.received).toBe(150);
    expect(steel.issued).toBe(50);
    expect(steel.balance).toBe(100);
  });
});

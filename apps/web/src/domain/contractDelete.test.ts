import { describe, it, expect } from 'vitest';
import type { Contract, Rar } from '../data/types';
import { canDeleteContract } from './contractDelete';

const contract = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', projectId: 'p', contractNo: 'NLC/P/SC-01', title: 'Earthworks',
  subcontractorId: 's1', scopeBills: ['1'], value: 1000, status: 'draft', ...over,
});

const rar = (rarNo: string, contractId?: string): Rar => ({
  id: `r-${rarNo}`, projectId: 'p', rarNo, seq: 1, period: 'M1', status: 'submitted',
  subcontractorId: 's1', contractId, gross: 100, netPayable: 90, lines: [],
} as Rar);

describe('canDeleteContract', () => {
  it('allows deleting a draft with nothing billed against it', () => {
    const r = canDeleteContract(contract(), []);
    expect(r.allowed).toBe(true);
    expect(r.blockedReason).toBeUndefined();
    expect(r.rarCount).toBe(0);
  });

  it('BLOCKS deletion when a RAR is billed against it', () => {
    const r = canDeleteContract(contract(), [rar('RAR-01', 'c1')]);
    expect(r.allowed).toBe(false);
    expect(r.rarCount).toBe(1);
    expect(r.blockedReason).toContain('RAR-01');
    // Points at the remedy rather than just refusing.
    expect(r.blockedReason).toMatch(/Remove the RARs first|close the contract/);
  });

  it('blocks on a paid RAR just as firmly as a draft one', () => {
    const paid = { ...rar('RAR-02', 'c1'), status: 'paid' } as Rar;
    expect(canDeleteContract(contract(), [paid]).allowed).toBe(false);
  });

  it('ignores RARs billed against a DIFFERENT contract', () => {
    const r = canDeleteContract(contract(), [rar('RAR-01', 'other'), rar('RAR-02', undefined)]);
    expect(r.allowed).toBe(true);
    expect(r.rarCount).toBe(0);
  });

  it('names every blocking RAR, capped so the message stays readable', () => {
    const many = ['01', '02', '03', '04', '05', '06', '07'].map((n) => rar(`RAR-${n}`, 'c1'));
    const r = canDeleteContract(contract(), many);
    expect(r.rarCount).toBe(7);
    expect(r.blockedReason).toContain('RAR-05');
    expect(r.blockedReason).toContain('…');
    expect(r.blockedReason).not.toContain('RAR-06');
  });

  it('warns that locked BOQ quantities will be released', () => {
    const c = contract({ lines: [{ boqItemId: 'b1', qty: 10, rate: 5 }, { boqItemId: 'b2', qty: 2, rate: 5 }] });
    const r = canDeleteContract(c, []);
    expect(r.releasedLines).toBe(2);
    expect(r.warnings.join(' ')).toMatch(/released/);
  });

  it('warns that an awarded contract records a real commitment, but still allows it', () => {
    const r = canDeleteContract(contract({ status: 'awarded', awardDate: '2026-01-01' }), []);
    expect(r.allowed).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/awarded/);
  });

  it('warns that an in-progress contract is not a draft', () => {
    const r = canDeleteContract(contract({ status: 'in_progress' }), []);
    expect(r.warnings.join(' ')).toMatch(/in progress/);
  });

  it('warns when an approval chain would go with it', () => {
    const c = contract({ chain: { stage: 'pd', history: [] } as unknown as Contract['chain'] });
    expect(canDeleteContract(c, []).warnings.join(' ')).toMatch(/approval chain/);
  });

  it('gives no warnings for a clean draft', () => {
    expect(canDeleteContract(contract(), []).warnings).toHaveLength(0);
  });
});

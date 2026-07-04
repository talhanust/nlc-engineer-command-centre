import { describe, it, expect } from 'vitest';
import { computeRarPayment, releaseWithheld, retentionRelease } from './billing';

describe('RAR payment computation', () => {
  it('sublet pays 70%, withholds 30% when IPC not approved', () => {
    const p = computeRarPayment(1000, 'sublet', false, 0.1);
    expect(p.payableNow).toBe(700);
    expect(p.withheld).toBe(300);
    expect(p.retention).toBe(100);
  });

  it('labor pays 95%, withholds 5% when IPC not approved', () => {
    const p = computeRarPayment(1000, 'labor', false, 0.1);
    expect(p.payableNow).toBe(950);
    expect(p.withheld).toBe(50);
  });

  it('pays full gross less retention when IPC approved', () => {
    const p = computeRarPayment(1000, 'sublet', true, 0.1);
    expect(p.payableNowPct).toBe(100);
    expect(p.payableNow).toBe(900); // 1000 - 100 retention
    expect(p.withheld).toBe(0);
  });
});

describe('withheld release + retention split', () => {
  it('sublet release deducts retention; labor does not', () => {
    expect(releaseWithheld(300, 'sublet', 100).released).toBe(200);
    expect(releaseWithheld(50, 'labor', 100).retentionDeducted).toBe(0);
  });

  it('retention releases half with final bill, half after DLP', () => {
    const r = retentionRelease(100);
    expect(r.withFinalBill).toBe(50);
    expect(r.afterDlp).toBe(50);
  });
});

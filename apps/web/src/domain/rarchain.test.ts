import { describe, it, expect } from 'vitest';
import { rarChain, pendingRarStage, advanceRar, isRarPaid, RAR_FINAL_CHAIN } from './rarchain';

describe('RAR interim chain', () => {
  it('runs PM → Pre-Audit → PD → FM and pays', () => {
    let s = { isFinal: false, stageIndex: 0 };
    expect(pendingRarStage(s)?.role).toBe('pm');
    expect(advanceRar(s, 'pd').error).toBeTruthy(); // wrong role
    s = advanceRar(s, 'pm').state;
    s = advanceRar(s, 'preaudit').state;
    s = advanceRar(s, 'pd').state;
    s = advanceRar(s, 'fm').state;
    expect(isRarPaid(s)).toBe(true);
  });
});

describe('RAR final-bill chain', () => {
  it('routes through HQ Engrs to CFO payment authority then FM', () => {
    expect(rarChain(true)).toBe(RAR_FINAL_CHAIN);
    const roles = ['pm', 'preaudit', 'pd', 'sdo_tech', 'manager_contracts', 'snr_manager_contracts', 'dy_comd_engrs', 'comd_engrs', 'cfo', 'fm'];
    let s = { isFinal: true, stageIndex: 0 };
    for (const r of roles) {
      expect(pendingRarStage(s)?.role).toBe(r);
      s = advanceRar(s, r).state;
    }
    expect(isRarPaid(s)).toBe(true);
  });

  it('has the CFO issue the payment authority before FM pays', () => {
    const cfoIdx = RAR_FINAL_CHAIN.findIndex((x) => x.role === 'cfo');
    const fmIdx = RAR_FINAL_CHAIN.findIndex((x) => x.role === 'fm');
    expect(RAR_FINAL_CHAIN[cfoIdx].action).toBe('payment_authority');
    expect(cfoIdx).toBeLessThan(fmIdx);
  });
});

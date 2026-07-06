import { describe, it, expect } from 'vitest';
import { APPOINTMENTS, properChannel, contractApprover, appointment } from './appointments';

describe('appointment catalogue (Requirements v2 §1)', () => {
  it('covers all four command levels with intact reporting lines', () => {
    const levels = new Set(APPOINTMENTS.map((a) => a.level));
    expect([...levels].sort()).toEqual(['hq_engrs', 'hq_nlc', 'pd_hq', 'project']);
    for (const a of APPOINTMENTS) {
      if (a.reportsTo) expect(appointment(a.reportsTo), `${a.id} reports to unknown ${a.reportsTo}`).toBeDefined();
    }
  });

  it('walks the proper channel from SQS to DG', () => {
    const chain = properChannel('sqs').map((a) => a.id);
    expect(chain).toEqual(['sqs', 'dpm', 'spm', 'pd', 'comd_engrs', 'coo_ops', 'dg']);
  });

  it('routes contract approval by type and value (15/30 labour, 150/300 sublet, Mn)', () => {
    expect(contractApprover('labour', 15_000_000)).toBe('pd');
    expect(contractApprover('labour', 16_000_000)).toBe('comd_engrs');
    expect(contractApprover('labour', 31_000_000)).toBe('dg');
    expect(contractApprover('sublet', 150_000_000)).toBe('pd');
    expect(contractApprover('sublet', 299_000_000)).toBe('comd_engrs');
    expect(contractApprover('sublet', 300_000_001)).toBe('dg');
  });
});

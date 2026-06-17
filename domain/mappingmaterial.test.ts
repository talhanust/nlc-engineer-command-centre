import { describe, it, expect } from 'vitest';
import { INITIAL_MAPPING_WORKFLOW, pendingMappingStage, advanceMappingWf, amendMappingWf } from './mappingapproval';
import { materialRecovery, issueValue, totalBalanceToRecover } from './materialrecovery';
import type { MaterialIssue } from '../data/types';

describe('mapping approval', () => {
  it('runs PM → PD and locks; amend re-runs', () => {
    let s = INITIAL_MAPPING_WORKFLOW;
    expect(pendingMappingStage(s)?.role).toBe('pm');
    expect(advanceMappingWf(s, 'pd').error).toBeTruthy();
    s = advanceMappingWf(s, 'pm').state;
    s = advanceMappingWf(s, 'pd').state;
    expect(s.locked).toBe(true);
    s = amendMappingWf(s).state;
    expect(s.locked).toBe(false);
    expect(s.revision).toBe(1);
  });
});

describe('material recovery', () => {
  const issues: MaterialIssue[] = [
    { id: 'a', projectId: 'p', dated: '2026-05-01', materialCode: 'M-CEM', qty: 100, issuedTo: 'x', contractorId: 'c1', rate: 1000, recovered: 40000 },
    { id: 'b', projectId: 'p', dated: '2026-05-02', materialCode: 'M-CEM', qty: 50, issuedTo: 'y', contractorId: 'c1', rate: 1000, recovered: 0 },
    { id: 'c', projectId: 'p', dated: '2026-05-03', materialCode: 'M-STEEL', qty: 10, issuedTo: 'z', contractorId: 'c2', rate: 5000, recovered: 0 },
  ];

  it('computes issued value, recovered, and balance per contractor', () => {
    const rows = materialRecovery(issues);
    const c1 = rows.find((r) => r.contractorId === 'c1')!;
    expect(issueValue(issues[0])).toBe(100000);
    expect(c1.issuedValue).toBe(150000); // (100+50)*1000
    expect(c1.recovered).toBe(40000);
    expect(c1.balance).toBe(110000);
  });

  it('totals the balance to recover across contractors', () => {
    expect(totalBalanceToRecover(issues)).toBe(110000 + 50000); // c1 110k + c2 50k
  });
});

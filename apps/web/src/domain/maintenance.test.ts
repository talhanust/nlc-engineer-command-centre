import { describe, it, expect } from 'vitest';
import { MAINTENANCE_CHAIN, pendingMaintStage, advanceMaint, isMaintComplete } from './maintenance';

describe('maintenance request chain', () => {
  it('routes PM → Manager Procurement → FM and completes', () => {
    let i = 0;
    expect(pendingMaintStage(i)?.role).toBe('pm');
    expect(advanceMaint(i, 'fm').error).toBeTruthy(); // wrong role
    for (const r of ['pm', 'manager_procurement', 'fm']) {
      expect(pendingMaintStage(i)?.role).toBe(r);
      i = advanceMaint(i, r).stageIndex;
    }
    expect(isMaintComplete(i)).toBe(true);
    expect(i).toBe(MAINTENANCE_CHAIN.length);
  });
});

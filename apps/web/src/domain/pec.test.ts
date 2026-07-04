import { describe, it, expect } from 'vitest';
import { canAwardByPec, pecLimit, pecLimitLabel } from './pec';

describe('PEC award gate', () => {
  it('C-A has no limit', () => {
    expect(pecLimit('C-A')).toBeNull();
    expect(canAwardByPec('C-A', 5_000_000_000)).toBe(true);
  });

  it('enforces the category ceiling', () => {
    expect(canAwardByPec('C-5', 60_000_000)).toBe(true);   // ≤ 65 Mn
    expect(canAwardByPec('C-5', 80_000_000)).toBe(false);  // > 65 Mn
    expect(canAwardByPec('C-3', 400_000_000)).toBe(true);  // ≤ 500 Mn
  });

  it('blocks award when category is unset', () => {
    expect(canAwardByPec(undefined, 1)).toBe(false);
    expect(pecLimitLabel(undefined)).toMatch(/not set/);
  });
});

import { describe, it, expect } from 'vitest';
import { dataHealth, type DataHealthInput } from './dataHealth';

const base: DataHealthInput = {
  boqCount: 10, boqValue: 1000, unmappedCount: 0, unmappedValue: 0,
  scheduleCount: 6, negativeStockCodes: 0, pendingProgress: 0,
};

describe('dataHealth', () => {
  it('is all-ok when everything reconciles', () => {
    const h = dataHealth(base);
    expect(h.worst).toBe('ok');
    expect(h.issues).toBe(0);
    expect(h.checks.find((c) => c.id === 'mapping')!.level).toBe('ok');
  });

  it('warns on a missing schedule baseline', () => {
    const h = dataHealth({ ...base, scheduleCount: 0 });
    expect(h.checks.find((c) => c.id === 'schedule')!.level).toBe('warning');
    expect(h.worst).toBe('warning');
  });

  it('warns on unmapped BOQ, escalating to critical past half the value', () => {
    const warn = dataHealth({ ...base, unmappedCount: 3, unmappedValue: 200 });
    expect(warn.checks.find((c) => c.id === 'mapping')!.level).toBe('warning');
    const crit = dataHealth({ ...base, unmappedCount: 6, unmappedValue: 600 });
    expect(crit.checks.find((c) => c.id === 'mapping')!.level).toBe('critical');
    expect(crit.worst).toBe('critical');
  });

  it('flags negative stock as critical and pending progress as warning', () => {
    const h = dataHealth({ ...base, negativeStockCodes: 2, pendingProgress: 4 });
    expect(h.checks.find((c) => c.id === 'stock')!.level).toBe('critical');
    expect(h.checks.find((c) => c.id === 'progress')!.level).toBe('warning');
    expect(h.issues).toBe(2);
    expect(h.worst).toBe('critical');
  });

  it('skips the mapping check entirely when there is no BOQ', () => {
    const h = dataHealth({ ...base, boqCount: 0, boqValue: 0 });
    expect(h.checks.find((c) => c.id === 'mapping' || c.id === 'schedule')).toBeUndefined();
  });
});

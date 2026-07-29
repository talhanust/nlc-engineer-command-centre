import { describe, it, expect } from 'vitest';
import type { Contract, ProgressUpdate } from '../data/types';
import { computeTermination, executedByItem, checkDetermination } from './contractTermination';

const contract = (lines: Array<[string, number, number]>): Contract => ({
  id: 'c1', projectId: 'p', contractNo: 'NLC/X/SC-01', title: 'T', subcontractorId: 's1',
  scopeBills: ['1'], status: 'in_progress', kind: 'sublet',
  value: lines.reduce((s, [, q, r]) => s + q * r, 0),
  lines: lines.map(([boqItemId, qty, rate]) => ({ boqItemId, qty, rate })),
});

const prog = (boqItemId: string, executedQty: number, status: 'draft' | 'validated' = 'validated'): ProgressUpdate =>
  ({ id: `pr-${boqItemId}-${executedQty}`, projectId: 'p', boqItemId, period: 'M1', executedQty, status });

describe('computeTermination — lock executed, release the rest', () => {
  it('keeps the executed quantity and releases the unexecuted', () => {
    const t = computeTermination(contract([['i1', 1000, 90]]), new Map([['i1', 400]]));
    expect(t.perLine[0].executedQty).toBe(400);
    expect(t.perLine[0].releasedQty).toBe(600);
    expect(t.executedValue).toBe(400 * 90);
    expect(t.releasedValue).toBe(600 * 90);
    // The contract's own lines shrink to what was built.
    expect(t.keptLines).toEqual([{ boqItemId: 'i1', qty: 400, rate: 90 }]);
  });

  it('releases everything when nothing was executed', () => {
    const t = computeTermination(contract([['i1', 1000, 90]]), new Map());
    expect(t.executedValue).toBe(0);
    expect(t.releasedValue).toBe(1000 * 90);
    expect(t.keptLines).toHaveLength(0);
    expect(t.fullyReleased).toBe(true);
  });

  it('keeps everything when the line is fully executed', () => {
    const t = computeTermination(contract([['i1', 1000, 90]]), new Map([['i1', 1000]]));
    expect(t.releasedValue).toBe(0);
    expect(t.keptLines[0].qty).toBe(1000);
    expect(t.fullyReleased).toBe(false);
  });

  it('never releases a negative quantity when executed exceeds awarded', () => {
    // Over-measurement is a variation; termination caps executed at awarded.
    const t = computeTermination(contract([['i1', 1000, 90]]), new Map([['i1', 1200]]));
    expect(t.perLine[0].executedQty).toBe(1000);
    expect(t.perLine[0].releasedQty).toBe(0);
    expect(t.releasedValue).toBe(0);
  });

  it('handles a multi-line contract, releasing each line independently', () => {
    const t = computeTermination(
      contract([['i1', 1000, 90], ['i2', 500, 200], ['i3', 200, 50]]),
      new Map([['i1', 1000], ['i2', 100]]), // i1 full, i2 partial, i3 none
    );
    expect(t.executedValue).toBe(1000 * 90 + 100 * 200);
    expect(t.releasedValue).toBe(400 * 200 + 200 * 50);
    expect(t.keptLines.map((l) => l.boqItemId)).toEqual(['i1', 'i2']); // i3 fully released, drops off
  });
});

describe('executedByItem — only validated work locks', () => {
  it('sums validated progress and ignores drafts', () => {
    const m = executedByItem([prog('i1', 300), prog('i1', 100), prog('i1', 999, 'draft')]);
    expect(m.get('i1')).toBe(400); // drafts excluded
  });
});

describe('checkDetermination — completing a contract normally', () => {
  const c = (lines: Array<[string, number, number]>): Contract => ({
    id: 'c1', projectId: 'p', contractNo: 'NLC/X/SC-01', title: 'T', subcontractorId: 's1',
    scopeBills: ['1'], status: 'in_progress', kind: 'sublet',
    value: lines.reduce((s, [, q, r]) => s + q * r, 0),
    lines: lines.map(([boqItemId, qty, rate]) => ({ boqItemId, qty, rate })),
  });

  it('is complete when every awarded quantity is executed', () => {
    const d = checkDetermination(c([['i1', 1000, 90], ['i2', 500, 200]]),
      new Map([['i1', 1000], ['i2', 500]]));
    expect(d.complete).toBe(true);
    expect(d.outstanding).toHaveLength(0);
    expect(d.executedValue).toBe(d.awardedValue);
    expect(d.outstandingValue).toBe(0);
  });

  it('is NOT complete while any quantity is outstanding, and names the shortfall', () => {
    const d = checkDetermination(c([['i1', 1000, 90], ['i2', 500, 200]]),
      new Map([['i1', 1000], ['i2', 300]]));
    expect(d.complete).toBe(false);
    expect(d.outstanding).toEqual([{ boqItemId: 'i2', awardedQty: 500, executedQty: 300, shortfall: 200 }]);
    expect(d.outstandingValue).toBe(200 * 200);
  });

  it('treats over-measurement as complete (capped at awarded)', () => {
    const d = checkDetermination(c([['i1', 1000, 90]]), new Map([['i1', 1200]]));
    expect(d.complete).toBe(true);
    expect(d.executedValue).toBe(1000 * 90);
  });
});

import { describe, it, expect } from 'vitest';
import { rowWindow } from './GanttChart';

describe('rowWindow — Gantt row virtualization', () => {
  it('renders only the viewport plus overscan', () => {
    const w = rowWindow(0, 480, 24, 5000); // 20 visible rows
    expect(w.first).toBe(0);
    expect(w.last).toBe(26); // 20 + overscan
    expect(w.padTop).toBe(0);
    expect(w.padBottom).toBe((5000 - 26) * 24);
  });

  it('keeps overscan rows above once scrolled', () => {
    const w = rowWindow(2400, 480, 24, 5000); // 100 rows scrolled past
    expect(w.first).toBe(94);
    expect(w.last).toBe(126);
    expect(w.padTop).toBe(94 * 24);
  });

  it('total height is preserved so the scrollbar never lies', () => {
    const rowH = 24;
    const count = 682;
    const w = rowWindow(1000, 560, rowH, count);
    const rendered = (w.last - w.first) * rowH;
    expect(w.padTop + rendered + w.padBottom).toBe(count * rowH);
  });

  it('clamps at the end of the list', () => {
    const w = rowWindow(100_000, 480, 24, 100);
    expect(w.last).toBe(100);
    expect(w.padBottom).toBe(0);
    expect(w.first).toBeLessThanOrEqual(100);
  });

  it('never renders more rows than exist', () => {
    const w = rowWindow(0, 2000, 24, 5);
    expect(w.first).toBe(0);
    expect(w.last).toBe(5);
    expect(w.padBottom).toBe(0);
  });

  it('survives zero rows, zero height and negative scroll', () => {
    expect(rowWindow(0, 500, 24, 0)).toEqual({ first: 0, last: 0, padTop: 0, padBottom: 0 });
    expect(rowWindow(-50, 0, 24, 10).first).toBe(0);
    expect(rowWindow(0, 0, 0, 10)).toEqual({ first: 0, last: 0, padTop: 0, padBottom: 0 });
  });

  it('a taller row height shows fewer rows', () => {
    const small = rowWindow(0, 480, 16, 1000);
    const large = rowWindow(0, 480, 36, 1000);
    expect(large.last - large.first).toBeLessThan(small.last - small.first);
  });
});

import { describe, it, expect } from 'vitest';
import { typeSalient, relativeUpdated } from './salientValue';

describe('typeSalient', () => {
  it('classifies an explicit percentage and exposes the bar value', () => {
    const t = typeSalient('Physical progress', '62%');
    expect(t.type).toBe('percent');
    expect(t.pct).toBe(62);
    expect(t.display).toBe('62%');
  });

  it('clamps an out-of-range percentage', () => {
    expect(typeSalient('x', '140%').pct).toBe(100);
  });

  it('classifies a date by label or by value shape', () => {
    expect(typeSalient('Completion', 'Aug 2026 (contractual)').type).toBe('date');
    expect(typeSalient('Mobilization', 'Sep 2025').type).toBe('date');
    expect(typeSalient('x', '2026-08-20').type).toBe('date');
    expect(typeSalient('x', '20/08/2026').type).toBe('date');
  });

  it('classifies money by currency token or money-ish label', () => {
    expect(typeSalient('x', 'Rs 2,518.7 Mn').type).toBe('money');
    expect(typeSalient('Contract value', '4,109,500,000').type).toBe('money');
    expect(typeSalient('x', '$1.2M').type).toBe('money');
  });

  it('leaves ordinary text alone', () => {
    expect(typeSalient('Client', 'FGEHA').type).toBe('text');
    expect(typeSalient('Consultant', 'NESPAK').type).toBe('text');
    expect(typeSalient('Scope', 'Sectors F-14 & F-15 development works').type).toBe('text');
  });

  it('does not mistake a plain number with a text label for money', () => {
    // No currency token and no money-ish label → text, not money.
    expect(typeSalient('Lot', '12').type).toBe('text');
  });
});

describe('relativeUpdated', () => {
  const now = new Date('2026-07-30T12:00:00Z');
  it('shows recent saves relatively', () => {
    expect(relativeUpdated('2026-07-30T11:59:40Z', now)).toBe('just now');
    expect(relativeUpdated('2026-07-30T11:30:00Z', now)).toBe('30m ago');
    expect(relativeUpdated('2026-07-30T06:00:00Z', now)).toBe('6h ago');
    expect(relativeUpdated('2026-07-27T12:00:00Z', now)).toBe('3d ago');
  });
  it('shows an absolute date once older than a month', () => {
    expect(relativeUpdated('2026-05-01T12:00:00Z', now)).toMatch(/May 2026/);
  });
  it('returns null for a missing or bad timestamp', () => {
    expect(relativeUpdated(undefined, now)).toBeNull();
    expect(relativeUpdated('not-a-date', now)).toBeNull();
  });
});

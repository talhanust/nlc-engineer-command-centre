import type { ScheduleBaseline } from '../data/types';

/**
 * Human label for a frozen programme: "Original · 2026-07-10", "Rev 2 · …".
 * Lives in the domain because both the UI and the workbook export need it, and a
 * report must name the programme it measured against.
 */
export function baselineLabel(b: ScheduleBaseline): string {
  const name = b.revision === 0 ? 'Original' : b.revision != null ? `Rev ${b.revision}` : 'Re-baseline';
  return `${name} · ${b.capturedAt}`;
}

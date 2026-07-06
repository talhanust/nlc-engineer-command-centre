import type { ScheduleActivity } from '../data/types';

const DAY = 86400000;

export type LookaheadStatus = 'in_progress' | 'upcoming' | 'overdue';

export interface LookaheadRow {
  activity: ScheduleActivity;
  status: LookaheadStatus;
  daysToStart: number; // negative once started
}

/**
 * Rolling lookahead: activities active or starting within `weeks` of `asOf`.
 * Completed activities (finished before asOf) are excluded. An activity whose
 * planned start is already past but not yet finished counts as in-progress;
 * one that should have started and finished but spans asOf is in-progress too.
 */
export function lookahead(activities: ScheduleActivity[], asOf: Date, weeks: number): LookaheadRow[] {
  const now = asOf.getTime();
  const windowEnd = now + weeks * 7 * DAY;
  const rows: LookaheadRow[] = [];
  for (const a of activities) {
    const start = new Date(a.plannedStart).getTime();
    const finish = new Date(a.plannedFinish).getTime();
    if (finish < now) continue; // completed
    if (start > windowEnd) continue; // beyond the window
    let status: LookaheadStatus;
    if (start <= now && finish >= now) status = 'in_progress';
    else if (start > now) status = 'upcoming';
    else status = 'overdue';
    rows.push({ activity: a, status, daysToStart: Math.round((start - now) / DAY) });
  }
  return rows.sort((x, y) => x.daysToStart - y.daysToStart);
}

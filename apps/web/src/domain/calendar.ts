import type { BankGuarantee } from '../data/types';
import { formatMoney } from './money';

export type CalEventKind = 'bg_expiry' | 'retention_completion' | 'retention_dlp';
export type CalSeverity = 'overdue' | 'soon' | 'upcoming' | 'later';

export interface CalEvent {
  id: string;
  date: string;
  kind: CalEventKind;
  title: string;
  detail: string;
  amount?: number;
  daysUntil: number;
  severity: CalSeverity;
  sub: string;
}

export const DEFAULT_DLP_DAYS = 365;

function daysTo(date: string, today: Date): number {
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}
function sev(days: number): CalSeverity {
  if (days < 0) return 'overdue';
  if (days <= 30) return 'soon';
  if (days <= 90) return 'upcoming';
  return 'later';
}
function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Forward calendar of bank-guarantee expiries and scheduled retention releases. */
export function commercialCalendar(args: {
  bgs: BankGuarantee[]; completionDate?: string; retentionHeld?: number; dlpDays?: number; today?: Date;
}): CalEvent[] {
  const today = args.today ?? new Date();
  const dlpDays = args.dlpDays ?? DEFAULT_DLP_DAYS;
  const events: CalEvent[] = [];

  for (const b of args.bgs) {
    if (!b.expires || b.status !== 'active') continue;
    const d = daysTo(b.expires, today);
    events.push({ id: `bg-${b.id}`, date: b.expires, kind: 'bg_expiry', title: `${b.bgNo} expires`, detail: `${b.bank} · ${formatMoney(b.amount)}`, amount: b.amount, daysUntil: d, severity: sev(d), sub: 'adv' });
  }

  const held = args.retentionHeld ?? 0;
  if (args.completionDate && held > 0) {
    const dc = daysTo(args.completionDate, today);
    events.push({ id: 'ret-comp', date: args.completionDate, kind: 'retention_completion', title: 'Retention release — substantial completion', detail: '50% of held retention', amount: held * 0.5, daysUntil: dc, severity: sev(dc), sub: 'retention' });
    const dlpDate = addDays(args.completionDate, dlpDays);
    const dd = daysTo(dlpDate, today);
    events.push({ id: 'ret-dlp', date: dlpDate, kind: 'retention_dlp', title: 'Retention release — DLP expiry', detail: `remaining 50% after ${dlpDays}-day DLP`, amount: held * 0.5, daysUntil: dd, severity: sev(dd), sub: 'retention' });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export interface CalHorizons { overdue: CalEvent[]; soon: CalEvent[]; upcoming: CalEvent[]; later: CalEvent[] }
export function groupByHorizon(events: CalEvent[]): CalHorizons {
  return {
    overdue: events.filter((e) => e.severity === 'overdue'),
    soon: events.filter((e) => e.severity === 'soon'),
    upcoming: events.filter((e) => e.severity === 'upcoming'),
    later: events.filter((e) => e.severity === 'later'),
  };
}

export const HORIZON_LABEL: Record<keyof CalHorizons, string> = {
  overdue: 'Overdue', soon: 'Next 30 days', upcoming: 'Next 90 days', later: 'Later',
};

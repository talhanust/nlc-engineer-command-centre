import type { Ipc, Rar, Epc, IpcStatus, RarStatus } from '../data/types';
import { IPC_STATUS_LABEL } from './ipc';
import { RAR_STATUS_LABEL } from './rar';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';
export type DocKind = 'IPC' | 'RAR' | 'EPC';

export interface AgingDoc {
  id: string;
  kind: DocKind;
  ref: string;
  stage: string;
  owner: string;
  value: number;
  days: number;
  threshold: number;
  ratio: number;
  urgency: Urgency;
}

export const STAGE_THRESHOLD_DAYS = 14;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse a billing period like "May-2026" / "Jan 2026" to a Date (1st of month). */
export function periodToDate(period: string): Date | null {
  const m = /([A-Za-z]{3})[^0-9]*(\d{4})/.exec(period.trim());
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (mon === undefined) return null;
  return new Date(Number(m[2]), mon, 1);
}

function daysBetween(from: Date | null, to: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

export function urgencyOf(ratio: number): Urgency {
  if (ratio >= 2) return 'critical';
  if (ratio >= 1.5) return 'high';
  if (ratio >= 1) return 'medium';
  return 'low';
}

function ipcOwner(s: IpcStatus): string {
  if (s === 'draft') return 'NLC SQS';
  if (s === 'submitted' || s === 'vetted') return 'Consultant';
  return 'Client (FGEHA)';
}
function rarOwner(s: RarStatus): string {
  if (s === 'draft') return 'Subcontractor';
  if (s === 'submitted' || s === 'verified') return 'NLC QS';
  return 'NLC Finance';
}

/** All in-pipeline (not yet paid) IPC/RAR/EPC documents with days-in-stage + urgency. */
export function buildAging(ipcs: Ipc[], rars: Rar[], epcs: Epc[], today: Date = new Date()): AgingDoc[] {
  const out: AgingDoc[] = [];
  const push = (id: string, kind: DocKind, ref: string, stage: string, owner: string, value: number, from: Date | null) => {
    const days = daysBetween(from, today);
    const ratio = +(days / STAGE_THRESHOLD_DAYS).toFixed(2);
    out.push({ id, kind, ref, stage, owner, value, days, threshold: STAGE_THRESHOLD_DAYS, ratio, urgency: urgencyOf(ratio) });
  };
  for (const i of ipcs) if (i.status !== 'paid') push(i.id, 'IPC', i.ipcNo, IPC_STATUS_LABEL[i.status], ipcOwner(i.status), i.gross, i.date ? new Date(i.date) : periodToDate(i.period));
  for (const r of rars) if (r.status !== 'paid') push(r.id, 'RAR', r.rarNo, RAR_STATUS_LABEL[r.status], rarOwner(r.status), r.gross, periodToDate(r.period));
  for (const e of epcs) if (e.status !== 'paid') push(e.id, 'EPC', e.epcNo, IPC_STATUS_LABEL[e.status], ipcOwner(e.status), e.amount, periodToDate(e.period));
  return out.sort((a, b) => b.ratio - a.ratio);
}

export interface AgingTotals { count: number; value: number; critical: number; high: number; medium: number; breached: number }
export function agingTotals(docs: AgingDoc[]): AgingTotals {
  return docs.reduce<AgingTotals>((a, d) => ({
    count: a.count + 1,
    value: a.value + d.value,
    critical: a.critical + (d.urgency === 'critical' ? 1 : 0),
    high: a.high + (d.urgency === 'high' ? 1 : 0),
    medium: a.medium + (d.urgency === 'medium' ? 1 : 0),
    breached: a.breached + (d.ratio >= 1 ? 1 : 0),
  }), { count: 0, value: 0, critical: 0, high: 0, medium: 0, breached: 0 });
}

export const URGENCY_LABEL: Record<Urgency, string> = { low: 'On track', medium: 'Due', high: 'High', critical: 'Critical' };

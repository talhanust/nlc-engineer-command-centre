import type { Ipc, Rar, Epc, Distribution, BoqItem, Subcontractor, BankGuarantee } from '../data/types';
import { perContractorRows } from './reconcile';
import { buildAging } from './aging';
import { bgExpiryStatus } from './advances';

export type AlertSeverity = 'critical' | 'warning';
export interface Alert { id: string; severity: AlertSeverity; title: string; detail: string; sub: string }

const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—');

/** Aggregate commercial health signals into actionable alerts (worst first). */
export function commercialAlerts(args: {
  ipcs: Ipc[]; rars: Rar[]; epcs: Epc[]; dists: Distribution[]; boq: BoqItem[]; subs: Subcontractor[]; bgs: BankGuarantee[]; today?: Date;
}): Alert[] {
  const alerts: Alert[] = [];
  const today = args.today ?? new Date();

  for (const r of perContractorRows(args.rars, args.dists, args.boq, args.subs)) {
    if (r.overClaimed) {
      alerts.push({ id: `oc-${r.code}`, severity: 'warning', title: `${r.name} over-claimed`, detail: `RAR gross exceeds distributed cost (coverage ${pct(r.coverage)})`, sub: 'recon' });
    }
  }

  for (const d of buildAging(args.ipcs, args.rars, args.epcs, today)) {
    if (d.urgency === 'critical') alerts.push({ id: `ag-${d.id}`, severity: 'critical', title: `${d.ref} critically aged`, detail: `${d.stage} · ${d.days}d in stage (${d.ratio.toFixed(1)}× threshold)`, sub: 'aging' });
    else if (d.urgency === 'high') alerts.push({ id: `ag-${d.id}`, severity: 'warning', title: `${d.ref} aging`, detail: `${d.stage} · ${d.days}d in stage`, sub: 'aging' });
  }

  for (const b of args.bgs) {
    const e = bgExpiryStatus(b.expires, today);
    if (e === 'expired') alerts.push({ id: `bg-${b.id}`, severity: 'critical', title: `${b.bgNo} expired`, detail: `${b.bank}${b.expires ? ` · ${b.expires}` : ''}`, sub: 'adv' });
    else if (e === 'expiring') alerts.push({ id: `bg-${b.id}`, severity: 'warning', title: `${b.bgNo} expiring soon`, detail: `${b.bank}${b.expires ? ` · ${b.expires}` : ''}`, sub: 'adv' });
  }

  return alerts.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));
}

export function alertCounts(alerts: Alert[]): { critical: number; warning: number; total: number } {
  return {
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    total: alerts.length,
  };
}

// ---------------------------------------------------------------------------
// Alert lifecycle (req 3i(2)): alerts route to a responsible role and are
// trackable from flag → acknowledged → resolved (or muted with reason).
// ---------------------------------------------------------------------------

import type { AlertState, AlertStatus, MaterialIssue, MachineryUsage } from '../data/types';
import { totalBalanceToRecover } from './materialrecovery';
import { totalMachineryToRecover } from './machineryRecovery';

/** Responsible role per alert stream (routing, req 3i(2)). */
export const ALERT_OWNER: Record<string, string> = {
  recon: 'pm',                // over-claimed contractors → Project Manager
  aging: 'pd',                // aged approvals → Project Director
  adv: 'fm',                  // BG / advance exposure → Finance Manager
  planner: 'pm',              // divergence & unmapped scope → Project Manager
  rar: 'manager_contracts',   // unrecovered contractor balances → Manager Contracts
  procurement: 'pm',          // lead-time risk → Project Manager
};

export interface TriagedAlert extends Alert {
  owner: string;
  status: AlertStatus;
  note?: string;
  updatedAt?: string;
}

/** Merge computed alerts with persisted triage states (default open). */
export function mergeAlertStates(alerts: Alert[], states: AlertState[]): TriagedAlert[] {
  const byId = new Map(states.map((s) => [s.alertId, s]));
  return alerts.map((a) => {
    const s = byId.get(a.id);
    return { ...a, owner: ALERT_OWNER[a.sub] ?? 'pm', status: s?.status ?? 'open', note: s?.note, updatedAt: s?.updatedAt };
  });
}

/** Alerts still demanding attention (open or acknowledged). */
export function activeAlerts(alerts: TriagedAlert[]): TriagedAlert[] {
  return alerts.filter((a) => a.status === 'open' || a.status === 'ack');
}

/** Unrecovered material / machinery balances (req 3i(1)). */
export function recoveryAlerts(issues: MaterialIssue[], machinery: MachineryUsage[]): Alert[] {
  const out: Alert[] = [];
  const mat = totalBalanceToRecover(issues);
  if (mat > 0) out.push({
    id: 'ur-material', severity: 'warning',
    title: 'Unrecovered NLC material with contractors',
    detail: `PKR ${Math.round(mat).toLocaleString('en-PK')} issued value outstanding — recover via RARs`, sub: 'rar',
  });
  const mach = totalMachineryToRecover(machinery);
  if (mach > 0) out.push({
    id: 'ur-machinery', severity: 'warning',
    title: 'Unrecovered NLC machinery usage',
    detail: `PKR ${Math.round(mach).toLocaleString('en-PK')} hire value outstanding — recover via RARs`, sub: 'rar',
  });
  return out;
}

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

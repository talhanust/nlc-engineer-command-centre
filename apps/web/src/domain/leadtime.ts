import type { BoqItem, BoqMaterialLink, BoqWbsLink, Crv, MaterialIssue, ProgressUpdate, ScheduleActivity } from '../data/types';
import { reconcileMaterials } from './material';
import { cumulativeExecuted } from './progress';
import { linksByItem } from './mapping';
import type { Alert } from './alerts';

/**
 * Procurement lead-time planner (req 3c(6)). Material requirement is DERIVED
 * from the plan: remaining BOQ qty × consumption coeff, per material. Stock on
 * hand (CRV received − issued) offsets it; the shortfall must be ordered by
 * need-by − lead-time. Need-by comes from the earliest planned start of the
 * activities mapped (BOQ↔WBS) to the items consuming that material.
 */

export const DEFAULT_LEAD_DAYS = 30;

export type LeadStatus = 'ok' | 'order_now' | 'late';

export interface LeadTimeRow {
  materialRef: string;
  requiredQty: number;   // Σ remaining item qty × coeff
  onHand: number;        // CRV received − issued
  shortfall: number;     // max(0, required − onHand)
  leadDays: number;      // max over the material's links (default 30)
  needBy: string | null; // earliest planned start among mapped, unfinished activities
  orderBy: string | null;// needBy − leadDays
  status: LeadStatus;
  items: string[];       // consuming BOQ item codes
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function materialLeadPlan(args: {
  items: BoqItem[];
  matLinks: BoqMaterialLink[];
  wbsLinks: BoqWbsLink[];
  sched: ScheduleActivity[];
  progress: ProgressUpdate[];
  crvs: Crv[];
  issues: MaterialIssue[];
  asOf: string;
}): LeadTimeRow[] {
  const { items, matLinks, wbsLinks, sched, progress, crvs, issues, asOf } = args;
  const itemOf = new Map(items.map((i) => [i.id, i]));
  const stock = new Map(reconcileMaterials(crvs, issues).map((r) => [r.code, r.balance]));
  const wbsByItem = linksByItem(wbsLinks.filter((l) => l.confidence === 'confirmed'));
  const actOf = new Map(sched.map((a) => [a.activityId, a]));
  const now = Date.parse(asOf);

  // group material links per materialRef
  const byMat = new Map<string, BoqMaterialLink[]>();
  for (const l of matLinks) {
    const arr = byMat.get(l.materialRef) ?? [];
    arr.push(l);
    byMat.set(l.materialRef, arr);
  }

  const rows: LeadTimeRow[] = [];
  for (const [materialRef, links] of byMat) {
    let requiredQty = 0;
    let needByTs: number | null = null;
    const codes: string[] = [];
    for (const l of links) {
      const item = itemOf.get(l.boqItemId);
      if (!item || l.coeff <= 0) continue;
      const remaining = Math.max(0, item.qty - cumulativeExecuted(progress, item.id));
      if (remaining <= 0) continue;
      requiredQty += remaining * l.coeff;
      codes.push(item.code);
      // need-by: earliest planned start of this item's mapped activities that are not already finished
      for (const w of wbsByItem.get(item.id) ?? []) {
        const act = actOf.get(w.activityId);
        if (!act || act.isMilestone) continue;
        const start = Date.parse(act.plannedStart);
        const finish = Date.parse(act.plannedFinish);
        if (!Number.isFinite(start) || finish < now) continue; // activity already past
        const anchor = Math.max(start, now); // work still to do starts no earlier than today
        if (needByTs === null || anchor < needByTs) needByTs = anchor;
      }
    }
    if (requiredQty <= 0) continue;
    const onHand = Math.max(0, stock.get(materialRef) ?? 0);
    const shortfall = Math.max(0, +(requiredQty - onHand).toFixed(3));
    const leadDays = Math.max(...links.map((l) => l.leadDays ?? DEFAULT_LEAD_DAYS));
    const orderByTs = needByTs !== null ? needByTs - leadDays * DAY : null;
    let status: LeadStatus = 'ok';
    if (shortfall > 0 && needByTs !== null) {
      if (needByTs <= now) status = 'late';
      else if (orderByTs !== null && orderByTs <= now) status = 'order_now';
    }
    rows.push({
      materialRef, requiredQty: +requiredQty.toFixed(3), onHand, shortfall, leadDays,
      needBy: needByTs !== null ? iso(needByTs) : null,
      orderBy: orderByTs !== null ? iso(orderByTs) : null,
      status, items: codes,
    });
  }
  return rows.sort((a, b) => (a.status === b.status ? b.shortfall - a.shortfall : a.status === 'late' ? -1 : a.status === 'order_now' && b.status === 'ok' ? -1 : 1));
}

/** Lead-time-at-risk alerts (req 3c(6), 3i(1)). */
export function leadTimeAlerts(rows: LeadTimeRow[]): Alert[] {
  return rows
    .filter((r) => r.status !== 'ok')
    .map((r) => ({
      id: `lt-${r.materialRef}`,
      severity: r.status === 'late' ? 'critical' as const : 'warning' as const,
      title: r.status === 'late'
        ? `${r.materialRef}: procurement late for planned work`
        : `${r.materialRef}: order now to hold the schedule`,
      detail: `shortfall ${r.shortfall.toLocaleString('en-PK')} (need ${r.requiredQty.toLocaleString('en-PK')}, on hand ${r.onHand.toLocaleString('en-PK')}) · lead ${r.leadDays}d · need-by ${r.needBy ?? '—'}`,
      sub: 'procurement',
    }));
}

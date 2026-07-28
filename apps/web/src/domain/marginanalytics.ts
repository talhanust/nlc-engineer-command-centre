import type { BoqItem, Allocation, ProgressUpdate, Subcontractor, Ipc, Rar } from '../data/types';

export interface ContractorValue { id: string; name: string; value: number }
export interface MarginRiskItem { code: string; description: string; ratio: number; contractor: string }

export interface MarginAnalytics {
  grossRevenue: number;   // executed value at BOQ rate
  scCost: number;         // sublet COMMITTED cost (== committedCost.sublet; kept for callers)
  loCost: number;         // labour COMMITTED cost
  grossMargin: number;    // revenue − INCURRED cost (the realised margin so far)
  marginPct: number;
  netWorkingCapital: number; // paid IPC net − paid RAR net
  topContractors: ContractorValue[];
  riskItems: MarginRiskItem[];

  // --- committed vs incurred: the distinction cost control turns on ---
  //
  // COMMITTED is the money the org is contractually on the hook for the moment a
  // contract is awarded — allocation rate × allocation qty. It moves at award,
  // before a single unit is built, which is exactly why it is the number that
  // warns of an over-subscribed budget in time to act.
  //
  // INCURRED is what has actually been earned by the subcontractor — executed
  // quantity × the sublet rate. It moves only as work is measured.
  //
  // The gap (committed − incurred) is remaining commitment: money promised but not
  // yet consumed. A committed figure ABOVE the client revenue on the same scope is
  // an over-subscription — the org has promised to pay out more than it is paid.
  committedCost: { sublet: number; labour: number; total: number };
  incurredCost: { sublet: number; labour: number; total: number };
  remainingCommitment: number; // committed.total − incurred.total
  /** Client-side revenue on the committed scope, at BOQ rates. */
  committedRevenue: number;
  /** committedRevenue − committedCost.total. Negative ⇒ over-subscribed. */
  committedMargin: number;
}

export function marginAnalytics(
  boq: BoqItem[], allocs: Allocation[], progress: ProgressUpdate[], subs: Subcontractor[], ipcs: Ipc[], rars: Rar[],
  riskThreshold = 0.9,
): MarginAnalytics {
  const rateOf = new Map(boq.map((b) => [b.id, b.rate]));
  const descOf = new Map(boq.map((b) => [b.id, b.description]));
  const codeOf = new Map(boq.map((b) => [b.id, b.code]));
  const subName = new Map(subs.map((s) => [s.id, s.name]));

  let grossRevenue = 0;
  for (const p of progress) grossRevenue += p.executedQty * (rateOf.get(p.boqItemId) ?? 0);

  // Executed quantity per BOQ item, so incurred cost can be measured against the
  // sublet rate the contractor is actually paid.
  const execByItem = new Map<string, number>();
  for (const p of progress) execByItem.set(p.boqItemId, (execByItem.get(p.boqItemId) ?? 0) + p.executedQty);

  let scCommitted = 0, loCommitted = 0;
  let scIncurred = 0, loIncurred = 0;
  let committedRevenue = 0;
  const byContractor = new Map<string, number>();
  const riskItems: MarginRiskItem[] = [];
  for (const a of allocs) {
    const committed = a.rate * a.qty;
    const boqRate = rateOf.get(a.boqItemId) ?? 0;
    // Incurred is capped at the committed quantity: measuring beyond the awarded
    // quantity is a variation, not extra cost against this commitment.
    const execQty = Math.min(execByItem.get(a.boqItemId) ?? 0, a.qty);
    const incurred = a.rate * execQty;

    if (a.executionType === 'sublet') { scCommitted += committed; scIncurred += incurred; }
    if (a.executionType === 'labor') { loCommitted += committed; loIncurred += incurred; }
    if (a.executionType !== 'nlc_direct') committedRevenue += boqRate * a.qty;

    if (a.contractorId) byContractor.set(a.contractorId, (byContractor.get(a.contractorId) ?? 0) + committed);
    if (a.executionType !== 'nlc_direct' && boqRate > 0 && a.rate / boqRate > riskThreshold) {
      riskItems.push({ code: codeOf.get(a.boqItemId) ?? '—', description: descOf.get(a.boqItemId) ?? '', ratio: +(a.rate / boqRate).toFixed(3), contractor: a.contractorId ? (subName.get(a.contractorId) ?? '—') : '—' });
    }
  }
  // scCost/loCost keep their historical meaning (committed) so existing callers
  // are unaffected; the gross margin now reflects INCURRED cost — the margin
  // realised on work actually done, not on work merely promised.
  const scCost = scCommitted, loCost = loCommitted;
  const committedCost = { sublet: scCommitted, labour: loCommitted, total: scCommitted + loCommitted };
  const incurredCost = { sublet: scIncurred, labour: loIncurred, total: scIncurred + loIncurred };
  const grossMargin = grossRevenue - incurredCost.total;
  const committedMargin = committedRevenue - committedCost.total;
  const ipcIn = ipcs.filter((i) => i.status === 'paid').reduce((s, i) => s + i.netPayable, 0);
  const rarOut = rars.filter((r) => r.status === 'paid').reduce((s, r) => s + r.netPayable, 0);

  const topContractors = [...byContractor.entries()]
    .map(([id, value]) => ({ id, name: subName.get(id) ?? id, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    grossRevenue, scCost, loCost, grossMargin,
    marginPct: grossRevenue > 0 ? +((grossMargin / grossRevenue) * 100).toFixed(1) : 0,
    committedCost, incurredCost,
    remainingCommitment: committedCost.total - incurredCost.total,
    committedRevenue,
    committedMargin,
    netWorkingCapital: ipcIn - rarOut,
    topContractors,
    riskItems: riskItems.sort((a, b) => b.ratio - a.ratio),
  };
}

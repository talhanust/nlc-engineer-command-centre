import type { BoqItem, Allocation, ProgressUpdate, Subcontractor, Ipc, Rar } from '../data/types';

export interface ContractorValue { id: string; name: string; value: number }
export interface MarginRiskItem { code: string; description: string; ratio: number; contractor: string }

export interface MarginAnalytics {
  grossRevenue: number;   // executed value at BOQ rate
  scCost: number;         // sublet allocation cost
  loCost: number;         // labour allocation cost
  grossMargin: number;
  marginPct: number;
  netWorkingCapital: number; // paid IPC net − paid RAR net
  topContractors: ContractorValue[];
  riskItems: MarginRiskItem[];
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

  let scCost = 0, loCost = 0;
  const byContractor = new Map<string, number>();
  const riskItems: MarginRiskItem[] = [];
  for (const a of allocs) {
    const value = a.rate * a.qty;
    if (a.executionType === 'sublet') scCost += value;
    if (a.executionType === 'labor') loCost += value;
    if (a.contractorId) byContractor.set(a.contractorId, (byContractor.get(a.contractorId) ?? 0) + value);
    const boqRate = rateOf.get(a.boqItemId) ?? 0;
    if (a.executionType !== 'nlc_direct' && boqRate > 0 && a.rate / boqRate > riskThreshold) {
      riskItems.push({ code: codeOf.get(a.boqItemId) ?? '—', description: descOf.get(a.boqItemId) ?? '', ratio: +(a.rate / boqRate).toFixed(3), contractor: a.contractorId ? (subName.get(a.contractorId) ?? '—') : '—' });
    }
  }
  const grossMargin = grossRevenue - scCost - loCost;
  const ipcIn = ipcs.filter((i) => i.status === 'paid').reduce((s, i) => s + i.netPayable, 0);
  const rarOut = rars.filter((r) => r.status === 'paid').reduce((s, r) => s + r.netPayable, 0);

  const topContractors = [...byContractor.entries()]
    .map(([id, value]) => ({ id, name: subName.get(id) ?? id, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    grossRevenue, scCost, loCost, grossMargin,
    marginPct: grossRevenue > 0 ? +((grossMargin / grossRevenue) * 100).toFixed(1) : 0,
    netWorkingCapital: ipcIn - rarOut,
    topContractors,
    riskItems: riskItems.sort((a, b) => b.ratio - a.ratio),
  };
}

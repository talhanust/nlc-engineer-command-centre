import type { Ipc, Rar, RarIpcLink } from '../data/types';

export interface IpcRecon {
  ipcNo: string;
  gross: number;
  recovered: number; // sub-recoveries applied against this IPC
  net: number; // gross net of recoveries
}

export interface RarRecon {
  rarNo: string;
  subcontractorId: string;
  gross: number;
  recovered: number; // amount recovered against client IPCs
  outstanding: number;
}

export interface Reconciliation {
  ipcRows: IpcRecon[];
  rarRows: RarRecon[];
  totals: { ipcGross: number; recovered: number; rarGross: number; outstanding: number };
}

/**
 * Reconcile subcontractor RARs against client IPCs through recovery links.
 * Each link applies `amount` from a RAR against an IPC; per IPC we sum applied
 * recoveries, per RAR we sum what's been recovered and what remains outstanding.
 */
export function reconcileRarIpc(ipcs: Ipc[], rars: Rar[], links: RarIpcLink[]): Reconciliation {
  const byIpc = new Map<string, number>();
  const byRar = new Map<string, number>();
  for (const l of links) {
    byIpc.set(l.ipcId, (byIpc.get(l.ipcId) ?? 0) + l.amount);
    byRar.set(l.rarId, (byRar.get(l.rarId) ?? 0) + l.amount);
  }

  const ipcRows: IpcRecon[] = ipcs
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((i) => {
      const recovered = byIpc.get(i.id) ?? 0;
      return { ipcNo: i.ipcNo, gross: i.gross, recovered, net: i.gross - recovered };
    });

  const rarRows: RarRecon[] = rars
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((r) => {
      const recovered = byRar.get(r.id) ?? 0;
      return { rarNo: r.rarNo, subcontractorId: r.subcontractorId, gross: r.gross, recovered, outstanding: r.gross - recovered };
    });

  return {
    ipcRows,
    rarRows,
    totals: {
      ipcGross: ipcRows.reduce((a, r) => a + r.gross, 0),
      recovered: ipcRows.reduce((a, r) => a + r.recovered, 0),
      rarGross: rarRows.reduce((a, r) => a + r.gross, 0),
      outstanding: rarRows.reduce((a, r) => a + r.outstanding, 0),
    },
  };
}

import type { Distribution, BoqItem, Subcontractor } from '../data/types';

export interface ReconKpis {
  nlcRevenue: number; distributedCost: number; rarBooked: number; rarPaid: number;
  overallCoverage: number; workingCapital: number;
}
export interface PerIpcRow { ipcNo: string; period: string; gross: number; distCost: number; linkedRars: string[]; coverage: number; linked: boolean }
export interface PerContractorRow { code: string; name: string; type: string; distCost: number; rarGross: number; rarPaid: number; coverage: number; overClaimed: boolean }
export interface IpcSuggestion { ipcNo: string; ipcId: string; score: number }
export interface LinkerRow { rarNo: string; rarId: string; contractor: string; currentLinks: string[]; suggestions: IpcSuggestion[]; gross: number }

/** Cost of work distributed to subs/labour (sublet distributions × BoQ rate). */
export function distributedCost(dists: Distribution[], boq: BoqItem[]): { byContractor: Map<string, number>; total: number } {
  const rate = new Map(boq.map((b) => [b.id, b.rate]));
  const byContractor = new Map<string, number>();
  let total = 0;
  for (const d of dists) {
    if (d.mode !== 'sublet' || !d.subcontractorId) continue;
    const c = d.allocatedQty * (rate.get(d.boqItemId) ?? 0);
    byContractor.set(d.subcontractorId, (byContractor.get(d.subcontractorId) ?? 0) + c);
    total += c;
  }
  return { byContractor, total };
}

export function reconKpis(ipcs: Ipc[], rars: Rar[], dists: Distribution[], boq: BoqItem[]): ReconKpis {
  const nlcRevenue = ipcs.reduce((s, i) => s + i.gross, 0);
  const dc = distributedCost(dists, boq).total;
  const rarBooked = rars.reduce((s, r) => s + r.gross, 0);
  const rarPaid = rars.filter((r) => r.status === 'paid').reduce((s, r) => s + r.netPayable, 0);
  return { nlcRevenue, distributedCost: dc, rarBooked, rarPaid, overallCoverage: dc > 0 ? rarBooked / dc : 0, workingCapital: dc - rarPaid };
}

export function perIpcRows(ipcs: Ipc[], rars: Rar[], links: RarIpcLink[]): PerIpcRow[] {
  const rarById = new Map(rars.map((r) => [r.id, r]));
  const byIpc = new Map<string, RarIpcLink[]>();
  for (const l of links) { const a = byIpc.get(l.ipcId) ?? []; a.push(l); byIpc.set(l.ipcId, a); }
  return ipcs.slice().sort((a, b) => a.seq - b.seq).map((i) => {
    const ls = byIpc.get(i.id) ?? [];
    const distCost = ls.reduce((s, l) => s + l.amount, 0);
    return { ipcNo: i.ipcNo, period: i.period, gross: i.gross, distCost, linkedRars: ls.map((l) => rarById.get(l.rarId)?.rarNo ?? l.rarId), coverage: i.gross > 0 ? distCost / i.gross : 0, linked: ls.length > 0 };
  });
}

export function perContractorRows(rars: Rar[], dists: Distribution[], boq: BoqItem[], subs: Subcontractor[]): PerContractorRow[] {
  const dc = distributedCost(dists, boq).byContractor;
  const rarG = new Map<string, number>(); const rarP = new Map<string, number>();
  for (const r of rars) {
    rarG.set(r.subcontractorId, (rarG.get(r.subcontractorId) ?? 0) + r.gross);
    if (r.status === 'paid') rarP.set(r.subcontractorId, (rarP.get(r.subcontractorId) ?? 0) + r.netPayable);
  }
  return subs.map((s, idx) => {
    const distCost = dc.get(s.id) ?? 0;
    const rarGross = rarG.get(s.id) ?? 0;
    const rarPaid = rarP.get(s.id) ?? 0;
    return {
      code: `SUB-${String(idx + 1).padStart(2, '0')}`, name: s.name, type: s.kind === 'labor' ? 'labour-only' : 'subcontractor',
      distCost, rarGross, rarPaid, coverage: distCost > 0 ? rarGross / distCost : (rarGross > 0 ? Infinity : 0), overClaimed: rarGross > distCost && rarGross > 0,
    };
  }).filter((r) => r.rarGross > 0 || r.distCost > 0);
}

/** Top-N IPCs that share BoQ items with a RAR's line items. */
export function suggestIpcsForRar(rar: Rar, ipcs: Ipc[], topN = 3): IpcSuggestion[] {
  const items = new Set((rar.lines ?? []).map((l) => l.boqItemId));
  if (items.size === 0) return [];
  return ipcs
    .map((i) => ({ ipcNo: i.ipcNo, ipcId: i.id, score: (i.lines ?? []).filter((l) => items.has(l.boqItemId)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function linkerRows(rars: Rar[], ipcs: Ipc[], links: RarIpcLink[], subs: Subcontractor[]): LinkerRow[] {
  const subName = new Map(subs.map((s) => [s.id, s.name]));
  const ipcNoById = new Map(ipcs.map((i) => [i.id, i.ipcNo]));
  const byRar = new Map<string, RarIpcLink[]>();
  for (const l of links) { const a = byRar.get(l.rarId) ?? []; a.push(l); byRar.set(l.rarId, a); }
  return rars.slice().sort((a, b) => a.seq - b.seq).map((r) => ({
    rarNo: r.rarNo, rarId: r.id, contractor: subName.get(r.subcontractorId) ?? r.subcontractorId,
    currentLinks: (byRar.get(r.id) ?? []).map((l) => ipcNoById.get(l.ipcId) ?? l.ipcId),
    suggestions: suggestIpcsForRar(r, ipcs), gross: r.gross,
  }));
}

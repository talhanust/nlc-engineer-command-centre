import type { BoqItem, Distribution, ProgressUpdate, Ipc, IpcLine, Rar, RarLine, Variation, BankGuarantee, Subcontractor, ScheduleActivity } from '../types';
import type { EscalationComponent } from '../../domain/escalation';
import { DEFAULT_PBS_COMPONENTS } from '../../domain/escalation';
import { computeNet } from '../../domain/ipc';
import { BILLS, SUB_PROFILES, SUB_NAMES } from './catalog';

export interface SeedProfile {
  id: string;
  cv: number;          // contract value
  billed: number;      // billed-to-date (drives cumulative IPC certification)
  plannedPct: number;
  actualPct: number;
  start: string;       // commencement date (YYYY-MM-DD)
}

export interface GeneratedSeed {
  boq: BoqItem[];
  subs: Subcontractor[];
  distributions: Distribution[];
  progress: ProgressUpdate[];
  ipcs: Ipc[];
  rars: Rar[];
  variations: Variation[];
  bgs: BankGuarantee[];
  escalation: EscalationComponent[];
  schedule: ScheduleActivity[];
}

// --- deterministic PRNG (mulberry32 seeded from a string) -------------------
function rng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const round = (n: number) => Math.round(n);
const money = (qty: number, rate: number) => round(qty * rate);
function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10);
}
function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}-${d.getFullYear()}`;
}

function build(profile: SeedProfile): GeneratedSeed {
  const r = rng(profile.id);
  const pid = profile.id;

  // --- BOQ: scale each bill to share × contract value ----------------------
  const boq: BoqItem[] = [];
  let bi = 0;
  for (const bill of BILLS) {
    const target = profile.cv * bill.share;
    const wsum = bill.items.reduce((s, it) => s + it.weight, 0);
    bill.items.forEach((it, k) => {
      const itemTarget = target * (it.weight / wsum);
      const qty = Math.max(1, round(itemTarget / it.rate));
      boq.push({
        id: `boq-${pid}-${bi}`, projectId: pid, billNo: bill.no, billName: bill.name, section: it.section,
        code: `${bill.no}-${String(k + 1).padStart(2, '0')}`, description: it.desc, unit: it.unit, qty, rate: it.rate, amount: money(qty, it.rate),
      });
      bi++;
    });
  }

  // --- Subcontractors ------------------------------------------------------
  const subs: Subcontractor[] = SUB_PROFILES.map((sp, i) => ({
    id: `sub-${pid}-${i + 1}`, projectId: pid, name: SUB_NAMES[(Math.floor(r() * 1000) + i) % SUB_NAMES.length],
    trade: sp.trade, kind: sp.kind, pecCategory: sp.pec, enlistment: `NLC/EN/${String(100 + i).padStart(3, '0')}`,
    performanceSecurity: round(profile.cv * 0.002 * (1 + r())),
  }));
  const subForBill = (billNo: string) => subs.find((_, i) => SUB_PROFILES[i].bills.includes(billNo));

  // --- Distributions: bills with a matching sub are sublet, else self ------
  const distributions: Distribution[] = boq.map((item) => {
    const sub = subForBill(item.billNo);
    const sublet = !!sub && r() < 0.8; // most matched bills are sublet
    return {
      boqItemId: item.id, projectId: pid,
      mode: sublet ? 'sublet' : 'self', subcontractorId: sublet ? sub!.id : undefined, allocatedQty: item.qty,
    };
  });

  // --- Progress: executed ≈ actual% of qty, with mild per-item jitter ------
  const frac = profile.actualPct / 100;
  const period0 = monthLabel(addMonths(profile.start, 2));
  const progress: ProgressUpdate[] = boq.map((item, i) => ({
    id: `pr-${pid}-${i}`, projectId: pid, boqItemId: item.id, period: period0,
    executedQty: round(item.qty * Math.min(1, frac * (0.7 + 0.6 * r()))), status: 'validated',
  }));
  const executedOf = new Map(progress.map((p) => [p.boqItemId, p.executedQty]));

  // --- IPCs (client billing) with itemwise lines ---------------------------
  // Certify executed value across K monthly IPCs, cumulative ≈ billed-to-date.
  const K = 5;
  const ipcs: Ipc[] = [];
  let cum = 0;
  const ipcStatuses: Ipc['status'][] = ['paid', 'paid', 'approved', 'vetted', 'submitted'];
  for (let j = 0; j < K; j++) {
    const lines: IpcLine[] = [];
    // each IPC certifies a rotating ~60% subset of items, a slice of their executed qty
    boq.forEach((item, idx) => {
      if ((idx + j) % 5 === 0) return; // skip ~20% for variety
      const exec = executedOf.get(item.id) ?? 0;
      if (exec <= 0) return;
      const sliceQty = round((exec / K) * (0.8 + 0.4 * r()));
      if (sliceQty <= 0) return;
      lines.push({ boqItemId: item.id, qty: sliceQty, rate: item.rate, amount: money(sliceQty, item.rate) });
    });
    const gross = lines.reduce((s, l) => s + l.amount, 0);
    if (gross <= 0) continue;
    cum += gross;
    ipcs.push({
      id: `ipc-${pid}-${j + 1}`, projectId: pid, ipcNo: `IPC-${String(j + 1).padStart(2, '0')}`, seq: j + 1,
      period: monthLabel(addMonths(profile.start, 3 + j * 2)), date: addMonths(profile.start, 3 + j * 2),
      status: ipcStatuses[j] ?? 'draft', gross, netPayable: computeNet(gross), cumGross: cum, lines,
    });
  }

  // --- RARs (subcontractor billing) with itemwise lines --------------------
  const rars: Rar[] = [];
  const subletItems = boq.filter((it) => distributions.find((d) => d.boqItemId === it.id)?.mode === 'sublet');
  const rarStatuses: Rar['status'][] = ['paid', 'approved', 'verified', 'submitted'];
  let rarSeq = 0;
  subs.filter((s) => SUB_PROFILES[subs.indexOf(s)]?.kind === 'sublet').forEach((sub) => {
    const items = subletItems.filter((it) => distributions.find((d) => d.boqItemId === it.id)?.subcontractorId === sub.id);
    if (items.length === 0) return;
    rarSeq++;
    const lines: RarLine[] = items.slice(0, 6).map((it) => {
      const exec = executedOf.get(it.id) ?? 0;
      const qty = Math.max(1, round(exec * (0.4 + 0.3 * r())));
      // sublet rate ~88% of BoQ rate (NLC margin)
      const rate = round(it.rate * 0.88);
      return { boqItemId: it.id, qty, rate, amount: money(qty, rate) };
    });
    const gross = lines.reduce((s, l) => s + l.amount, 0);
    rars.push({
      id: `rar-${pid}-${rarSeq}`, projectId: pid, rarNo: `RAR-${String(rarSeq).padStart(2, '0')}`, seq: rarSeq,
      period: monthLabel(addMonths(profile.start, 4 + rarSeq)), date: addMonths(profile.start, 4 + rarSeq),
      status: rarStatuses[(rarSeq - 1) % rarStatuses.length], subcontractorId: sub.id, gross, netPayable: computeNet(gross), lines,
    });
  });

  // --- Variations ----------------------------------------------------------
  const variations: Variation[] = [
    { id: `vo-${pid}-1`, projectId: pid, voNo: 'VO-01', seq: 1, title: 'Additional culvert at major crossing', type: 'addition', amount: round(profile.cv * 0.009), status: 'approved', date: addMonths(profile.start, 6) },
    { id: `vo-${pid}-2`, projectId: pid, voNo: 'VO-02', seq: 2, title: 'Omission of secondary drain reach', type: 'omission', amount: -round(profile.cv * 0.002), status: 'recommended', date: addMonths(profile.start, 8) },
    { id: `vo-${pid}-3`, projectId: pid, voNo: 'VO-03', seq: 3, title: 'Rate revision — bitumen escalation', type: 'rate_change', amount: round(profile.cv * 0.005), status: 'submitted', date: addMonths(profile.start, 9) },
  ];

  // --- Bank guarantees -----------------------------------------------------
  const bgs: BankGuarantee[] = [
    { id: `bg-${pid}-1`, projectId: pid, kind: 'mob', party: 'client', bgNo: `BG/MOB/${pid.slice(-4)}`, bank: 'National Bank of Pakistan', amount: round(profile.cv * 0.10), issued: profile.start, expires: addMonths(profile.start, 18), status: 'active' },
    { id: `bg-${pid}-2`, projectId: pid, kind: 'secure', party: 'sub', subcontractorId: subs[0]?.id, bgNo: `BG/SEC/${pid.slice(-4)}`, bank: 'Habib Bank Ltd', amount: round(profile.cv * 0.05), issued: addMonths(profile.start, 1), expires: addMonths(profile.start, 14), status: 'active' },
  ];

  // --- Escalation indices (PBS basket) -------------------------------------
  const escalation: EscalationComponent[] = DEFAULT_PBS_COMPONENTS.map((c) => ({ ...c }));

  // --- Schedule (baseline activity pattern, scaled) ------------------------
  const schedule: ScheduleActivity[] = [
    { id: `sch-${pid}-1`, projectId: pid, activityId: 'A-1000', name: 'Mobilization', wbs: '1.1', durationDays: 28, plannedStart: addMonths(profile.start, 0), plannedFinish: addMonths(profile.start, 1), isMilestone: false },
    { id: `sch-${pid}-2`, projectId: pid, activityId: 'A-2000', name: 'Earthwork', wbs: '2.1', durationDays: 120, plannedStart: addMonths(profile.start, 1), plannedFinish: addMonths(profile.start, 5), isMilestone: false },
    { id: `sch-${pid}-3`, projectId: pid, activityId: 'A-3000', name: 'Sub-base & base course', wbs: '2.2', durationDays: 145, plannedStart: addMonths(profile.start, 4), plannedFinish: addMonths(profile.start, 9), isMilestone: false },
    { id: `sch-${pid}-4`, projectId: pid, activityId: 'A-4000', name: 'Drainage / sewerage / water / electric', wbs: '2.3', durationDays: 160, plannedStart: addMonths(profile.start, 5), plannedFinish: addMonths(profile.start, 11), isMilestone: false },
    { id: `sch-${pid}-5`, projectId: pid, activityId: 'A-5000', name: 'Asphalt & ancillary works', wbs: '2.4', durationDays: 60, plannedStart: addMonths(profile.start, 10), plannedFinish: addMonths(profile.start, 12), isMilestone: false },
    { id: `sch-${pid}-6`, projectId: pid, activityId: 'M-1', name: 'Substantial completion', wbs: '3.0', durationDays: 0, plannedStart: addMonths(profile.start, 30), plannedFinish: addMonths(profile.start, 30), isMilestone: true },
  ];

  return { boq, subs, distributions, progress, ipcs, rars, variations, bgs, escalation, schedule };
}

const cache = new Map<string, GeneratedSeed>();
/** Deterministic, memoised commercial seed for a project profile. */
export function seedFor(profile: SeedProfile): GeneratedSeed {
  const hit = cache.get(profile.id);
  if (hit) return hit;
  const g = build(profile);
  cache.set(profile.id, g);
  return g;
}

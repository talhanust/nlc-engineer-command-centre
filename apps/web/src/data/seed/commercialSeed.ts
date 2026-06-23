import type { BoqItem, Distribution, ProgressUpdate, Ipc, IpcLine, Rar, RarLine, Variation, BankGuarantee, Subcontractor, ScheduleActivity, Resource, OverheadLine, FinancialReceipt, FinancialPayment, FinancialLiability, Supplier, Demand, Salient, ProductionRun, MaterialIssue, InventoryItem, PolRecord, FixedAsset, Contract } from '../types';
import type { EscalationComponent } from '../../domain/escalation';
import { DEFAULT_PBS_COMPONENTS } from '../../domain/escalation';
import { computeNet } from '../../domain/ipc';
import { BILLS, SUB_PROFILES, SUB_NAMES, RESOURCE_POOL, OVERHEAD_CATEGORIES } from './catalog';

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
  resources: Resource[];
  overheads: OverheadLine[];
  receipts: FinancialReceipt[];
  payments: FinancialPayment[];
  liabilities: FinancialLiability[];
  suppliers: Supplier[];
  demands: Demand[];
  salients: Salient[];
  production: ProductionRun[];
  issues: MaterialIssue[];
  inventory: InventoryItem[];
  pol: PolRecord[];
  fixedAssets: FixedAsset[];
  contracts: Contract[];
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
// Demo "now" — the cash-flow / S-curve axis is a fixed 12-month window ending
// Aug-2026 with Jun-2026 as "now". Anchor financial months here so IPC periods,
// receipts and payments land inside that window (short 'Mmm-YY' form).
const NOW_ISO = '2026-06-15';
const monthsBefore = (k: number): string => monthLabel(addMonths(NOW_ISO, -k)).replace(/-20/, '-');

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
      period: monthLabel(addMonths(NOW_ISO, -(K - 1 - j) * 2)), date: addMonths(NOW_ISO, -(K - 1 - j) * 2),
      status: ipcStatuses[j] ?? 'draft', gross, netPayable: computeNet(gross), cumGross: cum, lines,
    });
  }

  // --- Contracts (one package per sublet subcontractor) --------------------
  const contracts: Contract[] = [];
  subs.forEach((sub, idx) => {
    const sp = SUB_PROFILES[idx];
    if (!sp || sp.kind !== 'sublet') return;
    const subItems = boq.filter((it) => distributions.find((d) => d.boqItemId === it.id)?.subcontractorId === sub.id);
    const value = subItems.reduce((s, it) => s + Math.round(it.amount * 0.88), 0);
    if (value <= 0) return;
    const seq = contracts.length + 1;
    contracts.push({
      id: `ctr-${pid}-${seq}`, projectId: pid, contractNo: `NLC/${pid.replace('proj-', '').toUpperCase()}/SC-${String(seq).padStart(2, '0')}`,
      title: `${sp.trade} package`, subcontractorId: sub.id, scopeBills: sp.bills, value, awardDate: addMonths(profile.start, 1),
      status: seq === 1 ? 'in_progress' : 'awarded',
    });
  });
  const contractOf = (subId: string) => contracts.find((c) => c.subcontractorId === subId)?.id;

  // --- RARs (subcontractor billing) with itemwise lines --------------------
  const rars: Rar[] = [];
  const subletItems = boq.filter((it) => distributions.find((d) => d.boqItemId === it.id)?.mode === 'sublet');
  const rarStatuses: Rar['status'][] = ['paid', 'approved', 'submitted', 'verified'];
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
      status: rarStatuses[(rarSeq - 1) % rarStatuses.length], subcontractorId: sub.id, contractId: contractOf(sub.id), gross, netPayable: computeNet(gross), lines,
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

  // --- Resources (store / plant / equipment) -------------------------------
  const scale = Math.max(0.4, Math.min(2.5, profile.cv / 15_000_000_000));
  const resources: Resource[] = RESOURCE_POOL.map((rp, i) => ({
    id: `res-${pid}-${i + 1}`, projectId: pid, resourceClass: rp.resourceClass, name: rp.name, unit: rp.unit,
    qty: rp.resourceClass === 'store' ? round(rp.qty * scale * (0.8 + 0.4 * r())) : Math.max(1, round(rp.qty * scale)),
  }));

  // --- Overheads (monthly, last 4 months) ----------------------------------
  const overheads: OverheadLine[] = [];
  for (let m = 0; m < 4; m++) {
    const month = monthsBefore((3 - m) * 1);
    OVERHEAD_CATEGORIES.forEach((oc, k) => {
      overheads.push({ id: `ovh-${pid}-${m}-${k}`, projectId: pid, category: oc.category, month, plannedCost: round(profile.cv * oc.monthly * (0.9 + 0.2 * r())) });
    });
  }

  // --- Financial: receipts (from IPCs) + a mobilization advance -----------
  const receipts: FinancialReceipt[] = [
    { id: `rcpt-${pid}-mob`, projectId: pid, month: monthsBefore(8), source: 'Mobilization advance', amount: round(profile.cv * 0.10) },
    ...ipcs.filter((i) => i.status === 'paid' || i.status === 'approved').map((i, k) => ({
      id: `rcpt-${pid}-${k}`, projectId: pid, month: i.period.replace(/-20/, '-'), source: i.ipcNo, amount: i.netPayable,
    })),
  ];

  // --- Financial: payments (monthly cost by category) ----------------------
  const payments: FinancialPayment[] = [];
  const monthlyCost = (profile.billed * 0.82) / 4;
  const catSplit: Array<[FinancialPayment['category'], number]> = [['materials', 0.42], ['labour', 0.16], ['plant', 0.14], ['subcontract', 0.20], ['overhead', 0.08]];
  for (let m = 0; m < 4; m++) {
    const month = monthsBefore((3 - m) * 1);
    catSplit.forEach(([cat, w], k) => payments.push({ id: `pay-${pid}-${m}-${k}`, projectId: pid, month, category: cat, amount: round(monthlyCost * w * (0.85 + 0.3 * r())) }));
  }

  // --- Financial: liabilities ----------------------------------------------
  const retentionHeld = ipcs.reduce((s, i) => s + (i.gross - i.netPayable) * 0.6, 0);
  const outstandingRar = rars.filter((x) => x.status !== 'paid').reduce((s, x) => s + x.netPayable, 0);
  const liabilities: FinancialLiability[] = [
    { id: `liab-${pid}-ret`, projectId: pid, kind: 'Retention held by client', amount: round(retentionHeld) },
    { id: `liab-${pid}-rar`, projectId: pid, kind: 'Outstanding RAR (subcontractors)', amount: round(outstandingRar) },
    { id: `liab-${pid}-pay`, projectId: pid, kind: 'Trade payables', amount: round(profile.cv * 0.012 * (0.6 + r())) },
  ];

  // --- Suppliers -----------------------------------------------------------
  const SUPPLIER_POOL: Supplier['kind'][] = ['material', 'machinery', 'both'];
  const supplierNames = ['Attock Cement Ltd', 'Bestway Cement', 'Pak Steel Mills', 'Amreli Steels', 'Descon Equipment', 'Al-Haj Machinery', 'Lucky Bitumen', 'Sinotruk Pakistan'];
  const suppliers: Supplier[] = supplierNames.slice(0, 5).map((name, i) => ({ id: `sup-${pid}-${i + 1}`, projectId: pid, name, kind: SUPPLIER_POOL[i % 3] }));

  // --- Demands (procurement) -----------------------------------------------
  const cementBoq = boq.find((b) => b.description.includes('concrete')) ?? boq[0];
  const demands: Demand[] = [
    { id: `dmd-${pid}-1`, projectId: pid, demandNo: 'DMD-01', seq: 1, type: 'material', justification: 'Cement & aggregate for RCC works', totalEstimated: round(profile.cv * 0.02), chainType: 'proc_demand_material', currentStage: 2, items: [
      { code: 'M-CEM', description: 'OPC cement, 53-grade', unit: 'bag', qty: round(20000 * scale), estimatedRate: 1250, boqItemId: cementBoq?.id },
      { code: 'M-AGG', description: 'Crushed stone aggregate', unit: 'cu.ft', qty: round(120000 * scale), estimatedRate: 95 },
    ], history: [{ stageIndex: 0, action: 'raise', role: 'pm', at: addMonths(profile.start, 3) }, { stageIndex: 1, action: 'recommend', role: 'manager_contracts', at: addMonths(profile.start, 3) }] },
    { id: `dmd-${pid}-2`, projectId: pid, demandNo: 'DMD-02', seq: 2, type: 'machinery_hire', justification: 'Hire of pavers and rollers for asphalt phase', totalEstimated: round(profile.cv * 0.008), chainType: 'machinery_demand', currentStage: 1, items: [
      { code: 'P-PAV', description: 'Asphalt paver (hire)', unit: 'month', qty: 4, estimatedRate: 2_800_000 },
    ], history: [{ stageIndex: 0, action: 'raise', role: 'pm', at: addMonths(profile.start, 7) }] },
  ];

  // --- Salients ------------------------------------------------------------
  const fmtPk = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
  const finish = addMonths(profile.start, 30);
  const salients: Salient[] = [
    { id: `sal-${pid}-1`, projectId: pid, label: 'Contract value', value: fmtPk(profile.cv) },
    { id: `sal-${pid}-2`, projectId: pid, label: 'Scope', value: 'Infrastructure development (roads & services)' },
    { id: `sal-${pid}-3`, projectId: pid, label: 'Commencement', value: profile.start },
    { id: `sal-${pid}-4`, projectId: pid, label: 'Completion (contractual)', value: finish },
    { id: `sal-${pid}-5`, projectId: pid, label: 'Physical progress', value: `${profile.actualPct}%` },
    { id: `sal-${pid}-6`, projectId: pid, label: 'Billed to date', value: fmtPk(profile.billed) },
  ];

  // --- Production runs ------------------------------------------------------
  const products: Array<[string, string, number]> = [['Asphalt wearing course', 'Cft', 9000], ['Asphalt base course', 'Cft', 12000], ['RCC (batching plant)', 'Cft', 6000], ['Aggregate base course', 'Cft', 15000]];
  const production: ProductionRun[] = products.map(([product, unit, base], i) => {
    const planned = round(base * scale * (0.8 + 0.4 * r()));
    return { id: `prod-${pid}-${i}`, projectId: pid, dated: addMonths(profile.start, 8 + i), product, unit, plannedQty: planned, actualQty: round(planned * (0.82 + 0.2 * r())) };
  });

  // --- Material issues (with recovery linkage) -----------------------------
  const issues: MaterialIssue[] = [
    { id: `iss-${pid}-1`, projectId: pid, dated: addMonths(profile.start, 6), materialCode: 'M-CEM', qty: round(6000 * scale), issuedTo: 'Bill 2 — Culverts', contractorId: subs[2]?.id, rate: 1250, recovered: round(6000 * scale * 1250 * 0.4) },
    { id: `iss-${pid}-2`, projectId: pid, dated: addMonths(profile.start, 7), materialCode: 'M-STL', qty: round(45000 * scale), issuedTo: 'Bill 4 — Storm water drain', contractorId: subs[3]?.id, rate: 245, recovered: round(45000 * scale * 245 * 0.3) },
    { id: `iss-${pid}-3`, projectId: pid, dated: addMonths(profile.start, 8), materialCode: 'M-BIT', qty: round(80000 * scale), issuedTo: 'Bill 1 — Surfacing', rate: 285 },
  ];

  // --- Inventory (plant / equipment / vehicles) ----------------------------
  const invPool: Array<[InventoryItem['kind'], string]> = [['plant', 'Asphalt batching plant'], ['plant', 'Concrete batching plant'], ['equipment', 'Excavator CAT 320'], ['equipment', 'Motor grader'], ['equipment', 'Vibratory roller'], ['vehicle', 'Dump truck (Hino)'], ['vehicle', 'Water bowser']];
  const statuses: InventoryItem['status'][] = ['operational', 'operational', 'idle', 'breakdown'];
  const inventory: InventoryItem[] = invPool.map(([kind, name], i) => ({
    id: `inv-${pid}-${i}`, projectId: pid, kind, ownership: i % 3 === 0 ? 'hired' : 'integral', name,
    regNo: `${pid.slice(-3).toUpperCase()}-${1000 + i}`, status: statuses[Math.floor(r() * statuses.length)], utilizationPct: round(45 + r() * 50),
  }));

  // --- POL (fuel) ----------------------------------------------------------
  const pol: PolRecord[] = [];
  for (let m = 0; m < 3; m++) {
    const month = monthsBefore((2 - m) * 1);
    const proc = round(40000 * scale * (0.8 + 0.4 * r()));
    pol.push({ id: `pol-${pid}-${m}`, projectId: pid, month, fuel: 'diesel', procured: proc, issued: round(proc * 0.92), idealConsumption: 3.2, actualConsumption: round((3.2 + r() * 0.8) * 100) / 100 });
  }

  // --- Fixed assets --------------------------------------------------------
  const fixedAssets: FixedAsset[] = [
    { id: `fa-${pid}-1`, projectId: pid, category: 'Site establishment', description: 'Project camp & site offices', value: round(profile.cv * 0.004), acquired: addMonths(profile.start, 0) },
    { id: `fa-${pid}-2`, projectId: pid, category: 'Plant', description: 'Batching plant (integral)', value: round(profile.cv * 0.006), acquired: addMonths(profile.start, 1) },
    { id: `fa-${pid}-3`, projectId: pid, category: 'Survey & IT', description: 'Survey instruments & site IT', value: round(profile.cv * 0.001), acquired: addMonths(profile.start, 1) },
  ];

  return { boq, subs, distributions, progress, ipcs, rars, variations, bgs, escalation, schedule, resources, overheads, receipts, payments, liabilities, suppliers, demands, salients, production, issues, inventory, pol, fixedAssets, contracts };
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

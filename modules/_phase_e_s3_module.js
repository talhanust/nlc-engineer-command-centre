/* ============================================================
   §DEMO-DATA  Hypothetical multi-project seeder  (Phase E — S3)
   ============================================================
   Seeds several demo projects across all five PD HQs so the command
   hierarchy, portfolio, cash-flow aggregation, registers and per-project
   BOQ/baseline live-wiring all show real numbers. Deterministic (seeded
   PRNG → stable across reloads), opt-in (a Settings button), reversible
   (every demo project is tagged demo:true; Remove deletes them).

   Per project it sets: node .boq (+ client.contractValue), .scurve, .schedule,
   and the partition stash data.commercial.ipcs + data.financial.receipts/
   payments + data.execution.monthly — exactly the fields computeAllKpis /
   computeCashFlowByMonth / the rollups read.
   ============================================================ */

function _rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
var _DEMO_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function _demoMonthLabel(d) { return _DEMO_MON[d.getMonth()] + '-' + String(d.getFullYear()).slice(2); }
function _demoIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _demoAddMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28)); }

var _DEMO_PROJECTS = [
  { pd: 'pd-north', name: 'G-13/G-14 Sector Development, Islamabad', value: 14260000000, start: [2026, 1], dur: 1080, client: 'Federal Government Employees Housing Authority (FGEHA)', consultant: 'NESPAK (Pvt) Ltd', ref: 'NLC/ECC/2026/N-014' },
  { pd: 'pd-north', name: 'E-12 Infrastructure Works, Islamabad', value: 8640000000, start: [2026, 2], dur: 900, client: 'Capital Development Authority (CDA)', consultant: 'ACE-EA (JV)', ref: 'NLC/ECC/2026/N-022' },
  { pd: 'pd-centre', name: 'Lahore Ring Road — Northern Loop', value: 31500000000, start: [2025, 10], dur: 1260, client: 'National Highway Authority (NHA)', consultant: 'NESPAK (Pvt) Ltd', ref: 'NLC/ECC/2025/C-101' },
  { pd: 'pd-centre', name: 'Faisalabad Eastern Bypass', value: 12030000000, start: [2026, 0], dur: 1020, client: 'National Highway Authority (NHA)', consultant: 'EA Consulting (Pvt) Ltd', ref: 'NLC/ECC/2026/C-118' },
  { pd: 'pd-kpk', name: 'Peshawar Northern Bypass', value: 9410000000, start: [2026, 3], dur: 960, client: 'National Highway Authority (NHA)', consultant: 'NDC (Pvt) Ltd', ref: 'NLC/ECC/2026/K-007' },
  { pd: 'pd-sindh', name: 'Karachi Malir Expressway Link', value: 27850000000, start: [2025, 11], dur: 1200, client: 'Sindh Infrastructure Development Co.', consultant: 'NESPAK (Pvt) Ltd', ref: 'NLC/ECC/2025/S-088' },
  { pd: 'pd-sindh', name: 'Hyderabad Bypass Widening', value: 6720000000, start: [2026, 2], dur: 840, client: 'National Highway Authority (NHA)', consultant: 'MM Pakistan (Pvt) Ltd', ref: 'NLC/ECC/2026/S-093' },
  { pd: 'pd-bln', name: 'Quetta Western Corridor', value: 10330000000, start: [2026, 1], dur: 1080, client: 'National Highway Authority (NHA)', consultant: 'ACE (Pvt) Ltd', ref: 'NLC/ECC/2026/B-003' },
];
var _DEMO_BILLS = ['ROAD WORK', 'CULVERTS', 'STORM WATER DRAIN', 'WATER SUPPLY NETWORK', 'SEWERAGE SYSTEM', 'LANDSCAPING'];
var _DEMO_UNITS = ['1000 Cft', '100 Cft', 'Cft', 'Rft', 'Sft', '100 Kg', 'Each'];

function _demoBoq(rng, name, target) {
  const nBills = 4 + Math.floor(rng() * 2);                 // 4-5 bills
  const items = []; const bills = {}; let seq = 1; const raw = [];
  for (let b = 1; b <= nBills; b++) {
    bills[b] = _DEMO_BILLS[(b - 1) % _DEMO_BILLS.length];
    const nItems = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < nItems; k++) {
      const qty = Math.round((500 + rng() * 90000) * 100) / 100;
      const rate = Math.round((50 + rng() * 45000) * 100) / 100;
      const it = {
        id: 'I' + String(seq++).padStart(4, '0'), bill_no: b, bill_name: bills[b],
        section: bills[b] + ' — Section ' + (k + 1), sr_no: String(k + 1), item_code: 'D' + b + '.' + (k + 1),
        description: bills[b] + ' item ' + (k + 1), unit: _DEMO_UNITS[Math.floor(rng() * _DEMO_UNITS.length)],
        quantity: qty, rate: rate, amount: qty * rate,
      };
      items.push(it); raw.push(it.amount);
    }
  }
  const rawTotal = raw.reduce((s, a) => s + a, 0) || 1;       // scale amounts so Σ == target
  const scale = target / rawTotal; let acc = 0;
  items.forEach((it, i) => {
    if (i === items.length - 1) it.amount = target - acc;
    else { it.amount = Math.round(it.amount * scale); acc += it.amount; }
    it.rate = it.quantity ? Math.round((it.amount / it.quantity) * 100) / 100 : it.rate;
  });
  return { project: name, bills: bills, items: items, total_contract_value: target };
}

function _demoScurve(start, n) {                              // smooth ramp to ~100 cumulative
  const out = []; const d0 = new Date(start[0], start[1], 1);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const planned = Math.round((100 / (1 + Math.exp(-8 * (x - 0.5)))) * 10) / 10;   // logistic 0→~100
    out.push({ month: _demoMonthLabel(_demoAddMonths(d0, i)), planned: planned });
  }
  return out;
}

function _demoSchedule(rng, name, start) {
  const d0 = new Date(start[0], start[1], 1);
  const A = (id, nm, dur, off, wbs, parent, ms) => ({ id, name: nm, dur, ps: _demoIso(_demoAddMonths(d0, off)), pf: _demoIso(_demoAddMonths(d0, off + Math.ceil(dur / 30))), wbs, parent: parent || null, milestone: !!ms });
  return [
    A('A1000', name, 1080, 0, 0, null, false),
    A('A1100', 'Contractual', 30, 0, 1, 'A1000', false),
    A('A1101', 'Letter of Acceptance', 0, 0, 2, 'A1100', true),
    A('A1200', 'Mobilization', 60, 1, 1, 'A1000', false),
    A('A1201', 'Site Mobilization Complete', 0, 3, 2, 'A1200', true),
    A('A1300', 'Earthworks & Grading', 240, 3, 1, 'A1000', false),
    A('A1400', 'Road Works & Pavement', 360, 8, 1, 'A1000', false),
    A('A1500', 'Drainage & Utilities', 300, 10, 1, 'A1000', false),
    A('A1900', 'Substantial Completion', 0, 36, 2, 'A1000', true),
  ];
}

/* commercial + financial + execution for the partition stash */
function _demoData(rng, contractValue, scurve, start, now) {
  const d0 = new Date(start[0], start[1], 1);
  let elapsed = 0;
  for (let i = 0; i < scurve.length; i++) { if (_demoAddMonths(d0, i) <= now) elapsed = i + 1; else break; }
  elapsed = Math.max(1, Math.min(elapsed, scurve.length));
  const billedToDate = contractValue * (scurve[Math.min(elapsed, scurve.length) - 1].planned / 100) * (0.55 + rng() * 0.2);
  const nIpc = Math.max(2, Math.min(6, Math.floor(elapsed / 2) + 1));
  const ipcs = []; const receipts = []; const payments = []; const monthly = {};
  const retention = 0.10, tax = 0.07;
  // mobilization advance — standard up-front client receipt, so every project shows early cash inflow
  receipts.push({ amount: Math.round(contractValue * (0.04 + rng() * 0.03)), paidAt: _demoIso(_demoAddMonths(d0, 1)), ref: 'MOB-ADV', type: 'mob_advance' });
  let cumGross = 0;
  for (let i = 0; i < nIpc; i++) {
    const mo = Math.floor((i + 1) * elapsed / (nIpc + 1));
    const dt = _demoAddMonths(d0, mo);
    const gross = Math.round(billedToDate / nIpc * (0.7 + rng() * 0.6));
    cumGross += gross;
    const vettedGross = Math.round(gross * (0.95 + rng() * 0.04));
    const net = Math.round(vettedGross * (1 - retention - tax));
    let status;                                              // older IPCs further along the pipeline
    const age = nIpc - i;
    if (age >= 4) status = 'paid'; else if (age === 3) status = 'approved'; else if (age === 2) status = 'vetted'; else status = (rng() > 0.5 ? 'submitted' : 'draft');
    const ipc = {
      ipcNo: 'IPC-' + String(i + 1).padStart(2, '0'), seq: i + 1, period: _demoMonthLabel(dt),
      status: status, gross: gross, vettedGross: vettedGross, vettedNetPayable: net, netPayable: net,
      cumGross: cumGross, submissionDate: _demoIso(dt), draftedAt: _demoIso(dt), createdAt: _demoIso(dt),
    };
    ipcs.push(ipc);
    if (status === 'paid') {
      const pd = _demoAddMonths(dt, 1);
      receipts.push({ amount: net, paidAt: _demoIso(pd), ref: ipc.ipcNo, type: 'ipc' });
    }
  }
  for (let m = 0; m < elapsed; m++) {                         // monthly cost payments → cash-flow outflow
    const dt = _demoAddMonths(d0, m);
    const pay = Math.round(billedToDate / elapsed * (0.45 + rng() * 0.3));
    if (pay > 0) payments.push({ amount: pay, paidAt: _demoIso(dt), category: 'material', desc: 'Monthly construction cost' });
    monthly[scurve[m].month] = Math.round(scurve[m].planned * (0.78 + rng() * 0.18) * 10) / 10;   // actual slightly behind plan
  }
  // RARs — subcontractor running account bills (subset of certified work)
  const SUB_TYPES = ['labour', 'material', 'machinery'];
  const subcontractors = [
    { id: 'SUB-01', name: 'Frontier Works Org. (FWO)', type: 'subcontractor' },
    { id: 'SUB-02', name: 'Descon Engineering Ltd', type: 'subcontractor' },
  ];
  const rars = [];
  const nRar = elapsed >= 3 ? (2 + Math.floor(rng() * 2)) : 1;
  let rarCum = 0;
  for (let i = 0; i < nRar; i++) {
    const mo = Math.floor((i + 1) * elapsed / (nRar + 1));
    const dt = _demoAddMonths(d0, mo);
    const gross = Math.round(billedToDate / (nRar + 2) * (0.6 + rng() * 0.5));
    const net = Math.round(gross * 0.92);
    rarCum += gross;
    const age = nRar - i;
    let status, paidAmount = 0;
    if (age >= 3) { status = 'paid'; paidAmount = net; } else if (age === 2) { status = 'approved'; } else { status = (rng() > 0.5 ? 'verified' : 'submitted'); }
    rars.push({
      rarNo: 'RAR-' + String(i + 1).padStart(2, '0'), seq: i + 1,
      subId: subcontractors[i % subcontractors.length].id, subType: SUB_TYPES[i % SUB_TYPES.length],
      period: _demoMonthLabel(dt), status: status, gross: gross, netPayable: net, paidAmount: paidAmount,
      cumGross: rarCum, submissionDate: _demoIso(dt), createdAt: _demoIso(dt),
    });
  }
  return { ipcs, receipts, payments, monthly, rars, subcontractors };
}

function seedDemoData() {
  if (!state.org || typeof addProject !== 'function') return 0;
  if (state.org.demoSeeded) return 0;
  const now = new Date();
  let made = 0;
  _DEMO_PROJECTS.forEach((spec, i) => {
    const p = addProject(spec.pd, { name: spec.name });
    if (!p) return;
    const rng = _rng(0x9e3779b9 ^ (i + 1) * 2654435761);
    const nMonths = 14 + Math.floor(rng() * 6);
    const scurve = _demoScurve(spec.start, nMonths);
    p.boq = _demoBoq(rng, spec.name, spec.value);
    p.scurve = scurve;
    p.schedule = _demoSchedule(rng, spec.name, spec.start);
    const startD = new Date(spec.start[0], spec.start[1], 9);
    const finishD = _demoAddMonths(startD, Math.round((spec.dur || 1080) / 30));
    p.client = p.client || {};
    p.client.contractValue = spec.value;
    p.client.name = spec.client || 'FGEHA';
    p.client.designConsultant = spec.consultant || '';
    p.client.contractRef = spec.ref || '';
    p.client.window = { start: _demoIso(startD), end: _demoIso(finishD), durationDays: spec.dur || 1080 };
    p.demo = true;
    const dd = _demoData(rng, spec.value, scurve, spec.start, now);
    p.data = p.data || {};
    p.data.commercial = p.data.commercial || {};
    p.data.commercial.ipcs = dd.ipcs;
    p.data.commercial.ipcSeq = dd.ipcs.length;
    p.data.commercial.rars = dd.rars;
    p.data.commercial.rarSeq = dd.rars.length;
    p.data.commercial.subcontractors = dd.subcontractors;
    p.data.financial = p.data.financial || {};
    p.data.financial.receipts = dd.receipts;
    p.data.financial.payments = dd.payments;
    p.data.execution = p.data.execution || {};
    p.data.execution.monthly = dd.monthly;
    made++;
  });
  if (typeof migrateAccessControl === 'function') { try { migrateAccessControl(); } catch (e) {} }
  state.org.demoSeeded = true;
  audit('org.demo.seed', 'org', null, null, { projects: made }, 'Seeded ' + made + ' demo projects across PD HQs');
  saveState();
  return made;
}

function removeDemoData() {
  if (!state.org || !state.org.projects) return 0;
  const demoIds = Object.values(state.org.projects).filter(p => p.demo).map(p => p.id);
  if (!demoIds.length) { state.org.demoSeeded = false; return 0; }
  // never strand the user on a demo project
  if (demoIds.indexOf(state.org.activeProjectId) >= 0 && typeof switchActiveProject === 'function') {
    if (state.org.projects['proj-f14f15']) switchActiveProject('proj-f14f15');
  }
  demoIds.forEach(id => { delete state.org.projects[id]; });
  state.org.demoSeeded = false;
  if (state.org.activeNodeId && demoIds.indexOf(state.org.activeNodeId) >= 0) state.org.activeNodeId = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
  audit('org.demo.remove', 'org', null, null, { projects: demoIds.length }, 'Removed ' + demoIds.length + ' demo projects');
  saveState();
  return demoIds.length;
}

/* ---- UI ---- */
function renderDemoControls() {
  const host = document.getElementById('demoHost');
  if (!host || !state.org) return;
  const demoCount = Object.values(state.org.projects).filter(p => p.demo).length;
  if (demoCount > 0) {
    host.innerHTML = '<div class="demo-status">' + demoCount + ' demo projects loaded across PD HQs. Open the <b>Command</b> module (or Portfolio) to see the roll-ups.</div>' +
      '<div class="boq-intake-actions"><button class="btn btn-danger" onclick="clearDemoData()">Remove demo data</button></div>';
  } else {
    host.innerHTML = '<div class="demo-status">Load a set of hypothetical projects (with BOQs, baselines, IPCs and cash flow) across all five PD HQs to see the command hierarchy in action. Reversible.</div>' +
      '<div class="boq-intake-actions"><button class="btn btn-primary" onclick="loadDemoData()">Load demo data</button></div>';
  }
}
function loadDemoData() {
  const n = seedDemoData();
  if (typeof toast === 'function') toast(n ? ('Loaded ' + n + ' demo projects') : 'Demo data already loaded', n ? 'success' : 'info');
  if (n && typeof setActiveNode === 'function') { try { setActiveNode((typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc'); } catch (e) {} }
  if (typeof refreshAll === 'function') refreshAll();
  if (typeof renderDemoControls === 'function') renderDemoControls();
}
function clearDemoData() {
  const n = removeDemoData();
  if (typeof toast === 'function') toast(n ? ('Removed ' + n + ' demo projects') : 'No demo data to remove', 'info');
  if (typeof refreshAll === 'function') refreshAll();
  if (typeof renderDemoControls === 'function') renderDemoControls();
}

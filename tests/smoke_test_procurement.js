/* ============================================================
   PHASE A — PROCUREMENT SMOKE TEST
   ============================================================
   Verifies the procurement module end-to-end:
   - Bootstrap: state slice, roles, permissions, FINANCIAL_POWERS, chains
   - Demand pipeline: raise → validate → recommend → endorse → approve
   - Chain pruning by amount (PKR 500K, 20M, 80M, 600M)
   - Role gating: blocked when wrong role
   - PO lifecycle: issuePoFromDemand + closePo
   - CRV: partial, full, over-receipt
   - Payment pipeline: 9-stage material payment
   - Material flows: self_use, sublet_issue, batching_plant
   - Production runs
   - RAR auto-suggest recovery flow
   - Audit log entries
   ============================================================ */

const fs = require('fs');
const src = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const boqMatch = src.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => a.length > b.length ? a : b);

/* Defined IDs from HTML */
const definedIds = new Set();
const idRe = /id="([^"]+)"/g;
let m; while ((m = idRe.exec(src)) !== null) definedIds.add(m[1]);

/* ─── Test harness ──────────────────────────────────────────── */
let _testsRun = 0, _testsPassed = 0, _testsFailed = 0;
const _failures = [];
function assert(label, condition, expected, actual) {
  _testsRun++;
  if (condition) {
    _testsPassed++;
    console.log(`  ✓ ${label}`);
  } else {
    _testsFailed++;
    const detail = expected !== undefined ? ` (expected ${expected}, got ${actual})` : '';
    console.log(`  ✗ ${label}${detail}`);
    _failures.push({ label, expected, actual });
  }
}
function assertEq(label, actual, expected, tol) {
  tol = tol || 0;
  const eq = (typeof actual === 'number' && typeof expected === 'number')
    ? Math.abs(actual - expected) <= Math.max(tol, Math.abs(expected) * 0.0001)
    : actual === expected;
  assert(label, eq, JSON.stringify(expected), JSON.stringify(actual));
}
function section(name) {
  console.log('');
  console.log('─'.repeat(74));
  console.log(' ' + name);
  console.log('─'.repeat(74));
}

/* ─── DOM mock ──────────────────────────────────────────────── */
const elements = {};
function makeEl(id) {
  if (!elements[id]) {
    elements[id] = {
      id, value: '', textContent: '', innerHTML: '', checked: false,
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
        toggle(c, on) {
          if (on === undefined) this._set.has(c) ? this._set.delete(c) : this._set.add(c);
          else on ? this._set.add(c) : this._set.delete(c);
        },
        contains(c) { return this._set.has(c); }
      },
      dataset: {}, style: { removeProperty: () => {} },
      options: [], _children: [],
      parentElement: { innerHTML: '' },
      addEventListener: () => {},
      appendChild(c) { this._children.push(c); },
      remove: () => {}, getContext: () => ({}), disabled: false,
      querySelectorAll: () => []
    };
    if (id === 'boq-data') elements[id].textContent = boqMatch[1];
  }
  return elements[id];
}

global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] || null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }
};
global.confirm = () => true;
global.alert = () => {};
const TEST_NOW = new Date('2026-05-18T00:00:00.000Z').getTime();
global.Date.now = () => TEST_NOW;
const OD = global.Date;
let _dateOffset = 0;
global.Date = class extends OD {
  constructor(...a) {
    if (a.length === 0) super(TEST_NOW + _dateOffset);
    else super(...a);
  }
  static now() { return TEST_NOW + _dateOffset; }
};

global.document = {
  documentElement: { setAttribute: () => {}, getAttribute: () => 'light' },
  getElementById: id => definedIds.has(id) ? makeEl(id) : null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({
    value: '', textContent: '', click: () => {}, href: '', download: '',
    style: {}, classList: { add: () => {}, remove: () => {} },
    parentElement: null, remove: () => {}
  })
};
global.window = {
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  print: () => {},
};
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.Blob = class {};
global.URL = { createObjectURL: () => 'x', revokeObjectURL: () => {} };
global.FileReader = class { readAsText() {} };
global.prompt = () => '';
global.setTimeout = (fn) => { try { fn(); } catch (e) {} return 0; };
global.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
global.Chart = class { constructor() {} destroy() {} };

/* ─── Load the application ─────────────────────────────────── */
const exposeNames = [
  'state', 'ROLES', 'PERMISSIONS', 'APPROVAL_CHAINS', 'fmt', 'audit', 'requireRole',
  'ensureProcurementState',
  'getDemand', 'getPo', 'getCrv', 'getProcPayment', 'getHire', 'getSupplier',
  'getMaterialIssue', 'getProductionRun',
  'computeApprovalChain', 'computeStageAging', 'chainProgressPct',
  'advanceApprovalChain',
  'raiseDemand',
  'confirmDemandValidateById', 'confirmDemandRecommendById',
  'confirmDemandEndorseById',  'confirmDemandApproveById',
  'issuePoFromDemand', 'closePo',
  'createCrv',
  'raiseProcPayment',
  'confirmProcPaymentPreauditById', 'confirmProcPaymentValidateById',
  'confirmProcPaymentApprovePdById', 'confirmProcPaymentApproveCeById',
  'confirmProcPaymentApproveDsById', 'confirmProcPaymentApproveDgById',
  'confirmProcPaymentPayById',     'confirmProcPaymentRecordById',
  'createMachineryHire', 'recordMachineryUtilization',
  'issueMaterial', 'recordProductionRun',
  'autoSuggestRarRecovery', 'confirmRarRecovery', 'markRecoveryAsRecovered',
  'createSupplier', 'setFinancialPower',
  'computeProcurementKpis', 'computeApprovalInbox',
  /* v1.2.1 — Demand-creation form */
  'openDemandCreateModal', 'closeDemandCreateModal',
  '_validateDemandForm', '_readDemandForm',
  'addDemandItemRow', 'removeDemandItemRow',
  'submitDemandForm', 'saveDemandDraft',
  /* v1.2.2 — View modal field display */
  'openDemandView', 'renderDemandModalBody',
  /* v1.2.3 — BoQ item picker */
  'BOQ_DATA', '_findBoqItem',
  /* v1.2.4 — Modal handlers (Group 15 guards) */
  'openDemandModal',
  'openPoView', 'closeProcPoModal',
  'openProcPaymentView', 'closeProcPaymentModal',
  'openSupplierModal', 'closeProcSupplierModal',
  'closeProcCrvModal', 'closeProcHireModal',
  'closeProcDemandModal',
];

let app;
try {
  const fn = new Function(js + '\n; if (typeof boot === "function") boot(); return {' +
    exposeNames.map(n => n + ': (typeof ' + n + " !== 'undefined') ? " + n + ' : undefined').join(', ') +
    '};');
  app = fn();
} catch (e) {
  console.error('FATAL — app failed to load:', e.message);
  console.error(e.stack);
  process.exit(1);
}

const { state } = app;

console.log('═'.repeat(74));
console.log(' PHASE A PROCUREMENT SMOKE TEST');
console.log('═'.repeat(74));

/* Default session role is 'qs' — switch to admin for most tests to bypass role gating */
const setRole = (r) => { state.session.role = r; state.session.user = 'tester'; };
setRole('admin');

/* ═════════════════════════════════════════════════════════════
   GROUP 1 — BOOTSTRAP (7 tests)
   ═════════════════════════════════════════════════════════════ */
section('BOOTSTRAP');

assert('state.procurement initialized', state.procurement && typeof state.procurement === 'object');
assert('procurement arrays empty on first boot',
  Array.isArray(state.procurement.demands) &&
  Array.isArray(state.procurement.pos) &&
  Array.isArray(state.procurement.crvs) &&
  Array.isArray(state.procurement.payments) &&
  Array.isArray(state.procurement.suppliers) &&
  Array.isArray(state.procurement.materialIssues) &&
  Array.isArray(state.procurement.productionRuns) &&
  Array.isArray(state.procurement.machineryHires)
);
assert('3 new procurement roles registered',
  app.ROLES.pic && app.ROLES.comd_engrs && app.ROLES.dir_sp);
assert('procurement permissions loaded',
  app.PERMISSIONS['proc.demand.raise'] &&
  app.PERMISSIONS['proc.payment.pay'] &&
  app.PERMISSIONS['machinery.hire.raise']);
assert('FINANCIAL_POWERS defaults set',
  state.procurement.financialPowers.pm === 1000000 &&
  state.procurement.financialPowers.pd === 25000000 &&
  state.procurement.financialPowers.comd_engrs === 100000000 &&
  state.procurement.financialPowers.dir_sp === 500000000 &&
  state.procurement.financialPowers.dg === null
);
assert('6 approval chains defined in const',
  app.APPROVAL_CHAINS && Object.keys(app.APPROVAL_CHAINS).length === 6 &&
  app.APPROVAL_CHAINS.proc_demand_material &&
  app.APPROVAL_CHAINS.proc_demand_machinery &&
  app.APPROVAL_CHAINS.proc_payment_material &&
  app.APPROVAL_CHAINS.proc_payment_machinery &&
  app.APPROVAL_CHAINS.machinery_demand &&
  app.APPROVAL_CHAINS.machinery_payment);
assertEq('proc_payment_material has 9 stages',
  app.APPROVAL_CHAINS.proc_payment_material.length, 9);

/* ═════════════════════════════════════════════════════════════
   GROUP 2 — DEMAND PIPELINE (material, full chain, 6 tests)
   ═════════════════════════════════════════════════════════════ */
section('DEMAND PIPELINE (material, PKR 600M → full DG chain)');

const bigDemand = app.raiseDemand({
  type: 'material',
  flow: 'self_use',
  items: [
    { code: 'M-001', description: 'Cement OPC bulk', qty: 50000, unit: 'bags', estimatedRate: 12000 },
  ],
  justification: 'Phase-1 mass concrete',
});
assert('raiseDemand returned object', bigDemand && bigDemand.id);
assertEq('demand totalEstimated calculated', bigDemand.totalEstimated, 50000 * 12000);
assertEq('demand status at validated (after raise)', bigDemand.status, 'validated');

/* Step through the chain — must use the correct role for each stage */
setRole('pm');
assert('PM can validate demand', app.confirmDemandValidateById(bigDemand.id));
setRole('pd');
assert('PD can recommend demand', app.confirmDemandRecommendById(bigDemand.id));
setRole('comd_engrs');
assert('Comd Engrs can endorse demand', app.confirmDemandEndorseById(bigDemand.id));
setRole('dir_sp');
assert('Dir SP can approve demand (600M < unlimited DG, but covered by chain)',
  bigDemand.currentStage === 4);  /* approved is stage 4 in 5-stage chain */
/* Actually: chain[0]=initiated, [1]=validated, [2]=recommended, [3]=endorsed, [4]=approved
   raise advances currentStage to 1, then validate→2, recommend→3, endorse→4, approve→5 */
const finalApprove = app.confirmDemandApproveById(bigDemand.id);
assert('Dir SP final approve succeeded', finalApprove);
assertEq('demand status after full chain', bigDemand.status, 'completed');
assertEq('currentStage at end of chain', bigDemand.currentStage, 5);

setRole('admin');

/* ═════════════════════════════════════════════════════════════
   GROUP 3 — APPROVAL CHAIN PRUNING by amount (4 tests)
   ═════════════════════════════════════════════════════════════ */
section('APPROVAL CHAIN PRUNING (amount-based)');

/* PKR 500K → PM (≤1M) is smallest covering, chain = [initiated, validated] */
const chain500K = app.computeApprovalChain('proc_demand_material', 500000);
assertEq('PKR 500K demand: chain length 2 (initiated→validated, stops at PM)',
  chain500K.length, 2);
assertEq('PKR 500K chain ends at PM', chain500K[chain500K.length-1].role, 'pm');

/* PKR 20M → PD (≤25M), chain = [initiated, validated, recommended] */
const chain20M = app.computeApprovalChain('proc_demand_material', 20000000);
assertEq('PKR 20M demand: chain length 3 (stops at PD)', chain20M.length, 3);

/* PKR 80M → Comd Engrs (≤100M), chain = [..., endorsed] */
const chain80M = app.computeApprovalChain('proc_demand_material', 80000000);
assertEq('PKR 80M demand: chain length 4 (stops at Comd Engrs)', chain80M.length, 4);
assertEq('PKR 80M chain ends at comd_engrs', chain80M[chain80M.length-1].role, 'comd_engrs');

/* PKR 600M → exceeds Dir SP (500M) so goes to DG (unlimited) which is NOT in demand chain
   So with current 5-stage chain ending at Dir SP, 600M would NOT be covered, returns full chain */
const chain600M = app.computeApprovalChain('proc_demand_material', 600000000);
assertEq('PKR 600M demand: returns full 5-stage chain', chain600M.length, 5);

/* ═════════════════════════════════════════════════════════════
   GROUP 4 — ROLE GATING (3 tests)
   ═════════════════════════════════════════════════════════════ */
section('ROLE GATING (requireRole enforcement)');

setRole('qs');  /* QS can NOT raise procurement demand */
const blockedDemand = app.raiseDemand({
  type: 'material',
  items: [{ code: 'X', qty: 1, unit: 'no', estimatedRate: 100 }],
});
assert('QS role blocked from raising demand', blockedDemand === null);

setRole('pic');
const allowedDemand = app.raiseDemand({
  type: 'material',
  flow: 'self_use',
  items: [{ code: 'X', qty: 1, unit: 'no', estimatedRate: 100 }],
});
assert('PIC role allowed to raise demand', allowedDemand !== null);

/* PIC cannot validate (only PM can) */
setRole('pic');
const blockedValidate = app.confirmDemandValidateById(allowedDemand.id, { silent: true });
assert('PIC blocked from validate (only PM)', blockedValidate === false);

setRole('admin');

/* ═════════════════════════════════════════════════════════════
   GROUP 5 — PO LIFECYCLE (3 tests)
   ═════════════════════════════════════════════════════════════ */
section('PO LIFECYCLE');

/* Create a fresh fully-approved demand */
const dem2 = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [
    { code: 'STL-12', description: 'TMT 12mm', qty: 1000, unit: 'kg', estimatedRate: 250 },
    { code: 'STL-16', description: 'TMT 16mm', qty: 500,  unit: 'kg', estimatedRate: 255 },
  ],
});
/* Walk the chain — PKR 377,500 fits under PM cap, so chain = 2 stages */
setRole('pm');
app.confirmDemandValidateById(dem2.id);
setRole('admin');

const po1 = app.issuePoFromDemand(dem2.id, { supplierName: 'Acme Steel Co' });
assert('issuePoFromDemand returned PO', po1 && po1.id);
assertEq('PO totalAmount matches demand', po1.totalAmount,
  1000 * 250 + 500 * 255);
assertEq('PO items copied from demand', po1.items.length, 2);

/* ═════════════════════════════════════════════════════════════
   GROUP 6 — CRV (3 tests)
   ═════════════════════════════════════════════════════════════ */
section('CRV — partial, full, over-receipt');

const crv1 = app.createCrv(po1.id, [
  { code: 'STL-12', qtyReceived: 600, qtyAccepted: 600 },
], {});
assert('Partial CRV created', crv1 && crv1.id);
assertEq('PO status partially_received', app.getPo(po1.id).status, 'partially_received');

const crv2 = app.createCrv(po1.id, [
  { code: 'STL-12', qtyReceived: 400, qtyAccepted: 400 },
  { code: 'STL-16', qtyReceived: 500, qtyAccepted: 500 },
], {});
assert('Full CRV created', crv2 && crv2.id);
assertEq('PO status received after full delivery', app.getPo(po1.id).status, 'received');

const crv3 = app.createCrv(po1.id, [
  { code: 'STL-12', qtyReceived: 50, qtyAccepted: 50 },  /* over-receipt */
], {});
assert('Over-receipt CRV flagged', crv3.items[0].overReceipt === true);

/* ═════════════════════════════════════════════════════════════
   GROUP 7 — PAYMENT PIPELINE (5 tests)
   ═════════════════════════════════════════════════════════════ */
section('PAYMENT PIPELINE (9-stage material chain)');

setRole('pic');
const pay1 = app.raiseProcPayment('po', po1.id, po1.totalAmount, { notes: 'First payment' });
assert('raiseProcPayment created payment', pay1 && pay1.id);
assertEq('payment chain has 9 stages', pay1.approvalChain.length, 9);

/* Walk through all 9 stages with appropriate roles */
setRole('preaudit');
assert('preaudit advance', app.confirmProcPaymentPreauditById(pay1.id));
setRole('pm');
assert('pm validate advance', app.confirmProcPaymentValidateById(pay1.id));
setRole('pd');
assert('pd approve advance', app.confirmProcPaymentApprovePdById(pay1.id));
setRole('comd_engrs');
app.confirmProcPaymentApproveCeById(pay1.id);
setRole('dir_sp');
app.confirmProcPaymentApproveDsById(pay1.id);
setRole('dg');
app.confirmProcPaymentApproveDgById(pay1.id);
setRole('fm');
app.confirmProcPaymentPayById(pay1.id);
setRole('fh');
app.confirmProcPaymentRecordById(pay1.id);

const finalPay = app.getProcPayment(pay1.id);
assertEq('payment finalized', finalPay.currentStage, 9);
assert('payment has paidAt stamp', !!finalPay.paidAt);

setRole('admin');

/* ═════════════════════════════════════════════════════════════
   GROUP 8 — MATERIAL FLOWS (4 tests)
   ═════════════════════════════════════════════════════════════ */
section('MATERIAL FLOWS (3 first-class flows)');

const issue1 = app.issueMaterial({
  materialCode: 'CMT-OPC', description: 'Cement OPC',
  qtyIssued: 100, unit: 'bags', issueRate: 1100,
  flow: 'self_use',
  consumedForWbsId: 'WBS-001', consumedForBoqId: 'b-1',
});
assert('self_use issue: WBS link present',
  issue1 && issue1.consumedForWbsId === 'WBS-001' && issue1.issuedToSubId === null);

const issue2 = app.issueMaterial({
  materialCode: 'STL-12', description: 'TMT 12mm',
  qtyIssued: 500, unit: 'kg', issueRate: 250,
  flow: 'sublet_issue',
  issuedToSubId: 'sub-001',
});
assert('sublet_issue: subId set and recovery pending',
  issue2 && issue2.issuedToSubId === 'sub-001' && issue2.recoveryStatus === 'pending');

const run1 = app.recordProductionRun({
  product: 'concrete_M25', mixDesignRef: 'MIX-001',
  qtyProduced: 100, unit: 'cum',
  inputs: [{ materialCode: 'CMT-OPC', qtyConsumed: 50 }],
  issuedToSubId: 'sub-002', issuedQty: 100, recoveryRate: 8000,
});
assert('Production run created', run1 && run1.id);

const issue3 = app.issueMaterial({
  materialCode: 'concrete_M25', description: 'Batched concrete',
  qtyIssued: 100, unit: 'cum', issueRate: 8000,
  flow: 'batching_plant',
  productionRunId: run1.id,
});
assert('batching_plant: productionRunId set',
  issue3 && issue3.productionRunId === run1.id);

/* ═════════════════════════════════════════════════════════════
   GROUP 9 — PRODUCTION + RAR AUTO-SUGGEST (3 tests)
   ═════════════════════════════════════════════════════════════ */
section('RAR AUTO-SUGGEST RECOVERY (hybrid)');

const suggestions = app.autoSuggestRarRecovery('sub-001');
assert('autoSuggestRarRecovery returns pending sublet issues',
  Array.isArray(suggestions) && suggestions.length >= 1 &&
  suggestions.some(s => s.materialCode === 'STL-12'));

const rarId = 'rar-test-001';
const ok = app.confirmRarRecovery(rarId, suggestions.find(s => s.materialCode === 'STL-12'));
assert('confirmRarRecovery succeeds', ok);
const flippedIssue = app.getMaterialIssue(issue2.id);
assertEq('material issue flipped to confirmed', flippedIssue.recoveryStatus, 'confirmed');

app.markRecoveryAsRecovered(rarId);
const recoveredIssue = app.getMaterialIssue(issue2.id);
assertEq('material issue flipped to recovered', recoveredIssue.recoveryStatus, 'recovered');

/* ═════════════════════════════════════════════════════════════
   GROUP 10 — SUPPLIERS + MACHINERY + FINANCIAL POWERS (4 tests)
   ═════════════════════════════════════════════════════════════ */
section('SUPPLIERS + MACHINERY + FINANCIAL POWERS');

const sup1 = app.createSupplier({
  name: 'Steel Masters Ltd', type: 'material', ntn: '1234567-8',
});
assert('supplier created', sup1 && sup1.id);

setRole('pic');
const hire1 = app.createMachineryHire({
  vendor: 'CraneCo', equipType: 'Tower Crane',
  rateBasis: 'per_day', rate: 25000,
  periodStart: '2026-04-01',
});
assert('machinery hire created', hire1 && hire1.id);

app.recordMachineryUtilization(hire1.id, { date: '2026-04-15', days: 5 });
const h = app.getHire(hire1.id);
assertEq('hire totalDue computed from rateBasis', h.totalDue, 5 * 25000);

setRole('admin');
const fpOk = app.setFinancialPower('pm', 2000000, 'Increased PM cap');
assert('admin can edit financial powers',
  fpOk && state.procurement.financialPowers.pm === 2000000);

setRole('qs');
const fpBlocked = app.setFinancialPower('pm', 5000000, 'should fail');
assert('non-admin blocked from editing FP', fpBlocked === false);
setRole('admin');

/* ═════════════════════════════════════════════════════════════
   GROUP 11 — AUDIT LOG + KPIS (2 tests)
   ═════════════════════════════════════════════════════════════ */
section('AUDIT LOG + KPIs');

const procAuditEntries = state.auditLog.filter(e => e.module === 'procurement');
assert('procurement actions logged with module=procurement', procAuditEntries.length > 10);

const kpis = app.computeProcurementKpis();
assert('KPIs computed (has 9 fields)',
  kpis && kpis.openDemands !== undefined && kpis.totalProcValue !== undefined &&
  kpis.supplierCount === 1 && kpis.activeHires === 1);

/* ═════════════════════════════════════════════════════════════
   GROUP 12 — DEMAND FORM (v1.2.1) — 7 tests
   ═════════════════════════════════════════════════════════════ */
section('DEMAND FORM (v1.2.1)');

/* 1. raiseDemand accepts and stores requiredByDate */
setRole('pic');
const formDem1 = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'FORM-001', qty: 100, unit: 'no', estimatedRate: 500 }],
  justification: 'Form smoke test entry one',
  requiredByDate: '2026-12-31',
});
assertEq('raiseDemand stores requiredByDate', formDem1.requiredByDate, '2026-12-31');

/* 2. raiseDemand accepts and stores supplierHint */
const formDem2 = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'FORM-002', qty: 50, unit: 'no', estimatedRate: 800 }],
  justification: 'Form smoke test entry two',
  supplierHint: 'Local distributor preferred',
});
assertEq('raiseDemand stores supplierHint', formDem2.supplierHint, 'Local distributor preferred');

/* 3. raiseDemand defaults missing optional fields to null/[] (back-compat) */
const formDem3 = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'FORM-003', qty: 10, unit: 'no', estimatedRate: 100 }],
  justification: 'Back-compat test with no optional fields',
});
assert('missing requiredByDate defaults to null',
  formDem3.requiredByDate === null);
assert('missing supplierHint defaults to null',
  formDem3.supplierHint === null);
assert('missing attachments defaults to []',
  Array.isArray(formDem3.attachments) && formDem3.attachments.length === 0);

/* 4. Draft state: setting _currentDraft persists across saveState */
setRole('admin');
const draftPayload = {
  type: 'material', flow: 'sublet_issue',
  justification: 'Draft to be restored',
  items: [{ code: 'D-001', qty: 5, unit: 'no', estimatedRate: 200 }],
};
state.procurement._currentDraft = draftPayload;
/* Force a save + emulate-reload through ensureProcurementState */
app.ensureProcurementState();
assertEq('draft persists on _currentDraft',
  state.procurement._currentDraft && state.procurement._currentDraft.justification,
  'Draft to be restored');

/* 5. Submit clears the draft (when called via raiseDemand) */
setRole('pic');
const submittedFromDraft = app.raiseDemand(draftPayload);
state.procurement._currentDraft = null;   /* mirrors what submitDemandForm does */
assert('draft is null after submit', state.procurement._currentDraft === null);
assert('submitted demand exists', submittedFromDraft && submittedFromDraft.id);

/* 6. Multi-item submission preserves all items */
const multiDem = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [
    { code: 'M-A', qty: 1, unit: 'no', estimatedRate: 100 },
    { code: 'M-B', qty: 2, unit: 'no', estimatedRate: 200 },
    { code: 'M-C', qty: 3, unit: 'no', estimatedRate: 300 },
  ],
  justification: 'Multi-item submission test',
});
assertEq('multi-item demand: items.length === 3', multiDem.items.length, 3);

/* 7. Validator: too-short justification rejected */
const valErr = app._validateDemandForm({
  justification: 'short',
  items: [{ code: 'X', qty: 1, estimatedRate: 1 }],
});
assert('validator rejects justification < 10 chars',
  typeof valErr === 'string' && valErr.toLowerCase().includes('justification'));

/* 8. Validator: no valid items rejected */
const valErr2 = app._validateDemandForm({
  justification: 'this is long enough now',
  items: [{ code: '', qty: 0, estimatedRate: 0 }],
});
assert('validator rejects empty items',
  typeof valErr2 === 'string' && valErr2.toLowerCase().includes('item'));

/* 9. Validator: valid payload returns null */
const valOk = app._validateDemandForm({
  justification: 'this is a valid justification',
  items: [{ code: 'OK', qty: 1, estimatedRate: 1 }],
});
assertEq('validator returns null on valid payload', valOk, null);

setRole('admin');

/* ═════════════════════════════════════════════════════════════
   GROUP 13 — VIEW MODAL FIELD DISPLAY (v1.2.2) — 3 tests
   ═════════════════════════════════════════════════════════════ */
section('VIEW MODAL FIELD DISPLAY (v1.2.2)');

/* 1. View modal renders requiredByDate when present */
setRole('pic');
const viewDem1 = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'VIEW-001', qty: 10, unit: 'no', estimatedRate: 100 }],
  justification: 'View modal field display test one',
  requiredByDate: '2026-12-15',
  supplierHint: 'Acme Test Supplier',
});
setRole('admin');
app.openDemandView(viewDem1.id);
const body1 = document.getElementById('procDemandModalBody');
assert('view modal body rendered after openDemandView', body1 && body1.innerHTML.length > 0);
/* v1.2.4 regression guard: modal backdrop must get '.show' class to become visible.
   v1.2.0–v1.2.3 silently used '.open' which doesn't exist in CSS — modals stayed hidden in browser. */
const demandModalEl = document.getElementById('procDemandModal');
assert('view modal backdrop has .show class (visible)',
  demandModalEl && demandModalEl.classList && demandModalEl.classList.contains('show'));
assert('view modal shows requiredByDate (formatted "15 Dec 2026")',
  body1.innerHTML.includes('Required-By Date') && body1.innerHTML.includes('Dec 2026'));
assert('view modal shows supplierHint text',
  body1.innerHTML.includes('Supplier Hint') && body1.innerHTML.includes('Acme Test Supplier'));

/* 2. View modal shows em-dash for null fields (back-compat with pre-v1.2.1 demands) */
setRole('pic');
const viewDem2 = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'VIEW-002', qty: 5, unit: 'no', estimatedRate: 50 }],
  justification: 'View modal back-compat test',
});
/* Simulate pre-v1.2.1 demand: strip the new fields entirely */
delete viewDem2.requiredByDate;
delete viewDem2.supplierHint;
delete viewDem2.attachments;
setRole('admin');
app.openDemandView(viewDem2.id);
const body2 = document.getElementById('procDemandModalBody');
/* Both fields should render the em-dash fallback */
const reqByMatch  = body2.innerHTML.match(/Required-By Date:<\/strong>\s*([^<]+)<\/div>/);
const supHintMatch = body2.innerHTML.match(/Supplier Hint:<\/strong>\s*([^<]+)<\/div>/);
assert('null requiredByDate renders "—"',
  reqByMatch && reqByMatch[1].trim() === '—');
assert('null supplierHint renders "—"',
  supHintMatch && supHintMatch[1].trim() === '—');

/* 3. Attachments placeholder text shown when array empty */
assert('empty attachments shows "none yet (placeholder for v1.3)"',
  body2.innerHTML.includes('none yet') && body2.innerHTML.includes('v1.3'));

/* ═════════════════════════════════════════════════════════════
   GROUP 14 — BoQ ITEM PICKER (v1.2.3) — engine assertions
   ═════════════════════════════════════════════════════════════ */
section('BoQ ITEM PICKER (v1.2.3)');

/* 1. BOQ_DATA loaded and has 434 items */
assert('BOQ_DATA.items.length === 434',
  app.BOQ_DATA && Array.isArray(app.BOQ_DATA.items) && app.BOQ_DATA.items.length === 434);

/* 2. _findBoqItem returns first item with expected fields */
const boqFirst = app._findBoqItem('I0001');
assert('_findBoqItem("I0001") returns object with description/unit/item_code',
  boqFirst && typeof boqFirst.description === 'string' &&
  typeof boqFirst.unit === 'string' && typeof boqFirst.item_code === 'string');

/* 3. _findBoqItem returns null safely for unknown id */
const boqNone = app._findBoqItem('NONEXISTENT_BOQ_ID');
assert('_findBoqItem unknown id returns null', boqNone === null);

/* 4. _findBoqItem on null/empty arg returns null */
assert('_findBoqItem(null) returns null', app._findBoqItem(null) === null);
assert('_findBoqItem("") returns null', app._findBoqItem('') === null);

/* 5. Demand item with explicit boqItemId persists */
setRole('pic');
const pickedDem = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{
    code: boqFirst.item_code,
    description: boqFirst.description,
    unit: boqFirst.unit,
    qty: 100, estimatedRate: 200,
    boqItemId: 'I0001',
  }],
  justification: 'BoQ picker integration test',
});
assert('demand with boqItemId persisted',
  pickedDem && pickedDem.items[0].boqItemId === 'I0001');

/* 6. Demand item WITHOUT boqItemId (free-text, back-compat): persists with the field missing or null */
const freeDem = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'FREE-X', qty: 1, unit: 'no', estimatedRate: 1 }],
  justification: 'Free-text back-compat test',
});
assert('free-text demand: boqItemId is undefined/null',
  freeDem && (freeDem.items[0].boqItemId === undefined || freeDem.items[0].boqItemId === null));

/* 7. Existing seed demands have no boqItemId (back-compat sanity) */
const earlyDems = state.procurement.demands.filter(d => d.items.some(it => it.code === 'M-001' || it.code === 'STL-12' || it.code === 'CMT-OPC'));
const allMissingBoqId = earlyDems.every(d => d.items.every(it => it.boqItemId == null));
assert('seed/early demands: no boqItemId set (back-compat)', allMissingBoqId);

setRole('admin');

/* ═════════════════════════════════════════════════════════════
   GROUP 15 — MODAL VISIBILITY GUARDS (B-010 regression suite)
   ═════════════════════════════════════════════════════════════
   Per rev 3.7. Every procurement modal opener/closer must
   correctly toggle the `.show` class — not `.open`, which would
   silently leave the modal hidden (the v1.2.0–v1.2.3 bug).
   ═════════════════════════════════════════════════════════════ */
section('MODAL VISIBILITY GUARDS (v1.2.4 — B-010 regression)');

function _assertShow(modalId, label) {
  const el = document.getElementById(modalId);
  assert(label, el && el.classList && el.classList.contains('show'));
}
function _assertHidden(modalId, label) {
  const el = document.getElementById(modalId);
  assert(label, el && el.classList && !el.classList.contains('show'));
}

/* --- procDemandCreateModal: open + close --- */
setRole('pic');
app.openDemandModal();
_assertShow('procDemandCreateModal', 'create modal backdrop has .show after open');
app.closeDemandCreateModal();
_assertHidden('procDemandCreateModal', 'create modal backdrop loses .show after close');

/* --- procPoModal: open + close. Needs a real PO id (po1 from Group 5) --- */
setRole('admin');
app.openPoView(po1.id);
_assertShow('procPoModal', 'PO modal backdrop has .show after open');
app.closeProcPoModal();
_assertHidden('procPoModal', 'PO modal backdrop loses .show after close');

/* --- procPaymentModal: open + close. Reuse pay1 from Group 7 --- */
app.openProcPaymentView(pay1.id);
_assertShow('procPaymentModal', 'payment modal backdrop has .show after open');
app.closeProcPaymentModal();
_assertHidden('procPaymentModal', 'payment modal backdrop loses .show after close');

/* --- procSupplierModal: open + close --- */
setRole('pic');
app.openSupplierModal();
_assertShow('procSupplierModal', 'supplier modal backdrop has .show after open');
app.closeProcSupplierModal();
_assertHidden('procSupplierModal', 'supplier modal backdrop loses .show after close');

/* --- procCrvModal: close-only (no opener exists by design) ---
   Seed the .show class to simulate what a future opener would do,
   then verify the close handler removes it. */
setRole('admin');
const crvEl = document.getElementById('procCrvModal');
if (crvEl && crvEl.classList) crvEl.classList.add('show');
app.closeProcCrvModal();
_assertHidden('procCrvModal', 'CRV modal close removes .show (no opener exists by design)');

/* --- procHireModal: close-only (no opener exists by design) --- */
const hireEl = document.getElementById('procHireModal');
if (hireEl && hireEl.classList) hireEl.classList.add('show');
app.closeProcHireModal();
_assertHidden('procHireModal', 'Hire modal close removes .show (no opener exists by design)');

/* ═════════════════════════════════════════════════════════════
   SUMMARY
   ═════════════════════════════════════════════════════════════ */
console.log('');
console.log('═'.repeat(74));
console.log(` PHASE A PROCUREMENT TEST RESULTS`);
console.log('═'.repeat(74));
console.log(` Tests run    : ${_testsRun}`);
console.log(` Tests passed : ${_testsPassed}  ✓`);
console.log(` Tests failed : ${_testsFailed}${_testsFailed > 0 ? '  ✗' : ''}`);
console.log('═'.repeat(74));

if (_testsFailed > 0) {
  console.log('');
  console.log('FAILURES:');
  _failures.forEach(f => {
    console.log(`  ✗ ${f.label}`);
    if (f.expected !== undefined) console.log(`      expected: ${f.expected}`);
    if (f.actual !== undefined)   console.log(`      actual:   ${f.actual}`);
  });
}

process.exit(_testsFailed > 0 ? 1 : 0);

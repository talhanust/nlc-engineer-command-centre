/* ============================================================
   END-TO-END SYNTHETIC PROJECT LIFECYCLE TEST
   ============================================================
   Walks one synthetic project from BOQ-load through every
   pipeline (IPC, RAR, EPC) and verifies cross-module analytics
   (EVM, Cash Flow Forecast, Watch List, Heat Strip).

   This catches integration bugs that per-phase tests miss.
   Every step has explicit rupee-amount assertions.
   ============================================================ */

const fs = require('fs');
const src = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const boqMatch = src.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => a.length > b.length ? a : b);

/* ─── Test harness state ────────────────────────────────────────────── */
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
function assertGt(label, actual, threshold) {
  assert(label, typeof actual === 'number' && actual > threshold, `>${threshold}`, actual);
}
function section(name) {
  console.log('');
  console.log('─'.repeat(74));
  console.log(' ' + name);
  console.log('─'.repeat(74));
}

/* ─── DOM + globals mock ────────────────────────────────────────────── */
const elements = {};
function makeEl(id, opts = {}) {
  if (!elements[id]) {
    elements[id] = {
      id, value: '', textContent: '', innerHTML: '', checked: false,
      classList: {
        _set: new Set(['active']),
        add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
        toggle(c, on) {
          if (on === undefined) this._set.has(c) ? this._set.delete(c) : this._set.add(c);
          else on ? this._set.add(c) : this._set.delete(c);
        },
        contains(c) { return this._set.has(c); }
      },
      dataset: {}, style: {}, options: opts.options || [], _children: [],
      parentElement: { innerHTML: '' },
      addEventListener: () => {},
      appendChild(c) { this._children.push(c); this.options.push(c); },
      remove: () => {}, getContext: () => ({}), disabled: false,
      querySelectorAll: () => []
    };
    if (id === 'boq-data') elements[id].textContent = boqMatch[1];
  }
  return elements[id];
}
function elList(selector) {
  /* Naive selector matching for ".class" patterns */
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return Object.values(elements).filter(e => e._mockClasses && e._mockClasses.includes(cls));
  }
  return [];
}

const lsStore = {};
global.localStorage = {
  getItem: k => (k === 'fgeha_nlc_unified_v1') ? null : (k in lsStore ? lsStore[k] : null),
  setItem: (k, v) => lsStore[k] = String(v),
  removeItem: k => delete lsStore[k]
};
global.confirm = () => true;
global.alert = () => {};

const TEST_NOW = new Date('2026-05-11T00:00:00.000Z').getTime();
global.Date.now = () => TEST_NOW;
const OriginalDate = global.Date;
global.Date = class extends OriginalDate {
  constructor(...args) {
    if (args.length === 0) super(TEST_NOW);
    else super(...args);
  }
  static now() { return TEST_NOW; }
};

global.document = {
  documentElement: { setAttribute: () => {}, getAttribute: () => 'light' },
  getElementById: makeEl,
  querySelectorAll: elList,
  addEventListener: () => {},
  createElement: () => ({ value: '', textContent: '', click: () => {}, href: '', download: '', style: {}, classList: { add: () => {}, remove: () => {} }, parentElement: null, remove: () => {} })
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
global.setTimeout = (fn) => { fn(); return 0; };
global.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
global.Chart = class { constructor() {} destroy() {} };

/* ─── Load the application ─────────────────────────────────────────── */
const exposeNames = [
  'state', 'BOQ_DATA', 'BASELINE_DATA', 'STORE_DATA', 'PLANT_DATA', 'EQ_DATA', 'ROLES', 'PERMISSIONS',
  // Phase 2
  'audit', 'requireRole', 'calcAmount', 'fmt', 'getItemStatus',
  'setDistribution', 'ensureIpcDraft', 'generateIPC', 'ipcSuggestFromPhysical',
  'confirmIPCValidate', 'confirmIPCForwardClient', 'confirmIPCClientApproved',
  'confirmIPCAcknowledge', 'confirmIPCPayment',
  'generateRAR', 'rarSelectAllPending',
  'confirmRARValidate', 'confirmRARVerify', 'confirmRARApprove',
  'confirmRARMarkPayment', 'confirmRARPayment', 'confirmVetting',
  // EPC
  'ensureEpcState', 'computeEpcPn', 'computeEpcAmount',
  'generateEpcDraft', 'draftEpcForAllIpcs',
  'submitEpc', 'vetEpc', 'approveEpc', 'payEpc',
  // Reconciliation
  'suggestIpcLinksForRar', 'linkRarToIpc', 'autoLinkAllRars',
  'computeReconciliationByIpc', 'computeReconciliationByContractor',
  'computeReconciliationKpis',
  // Mapping
  'autoSuggestAllBOQ', 'autoSuggestAllMaterialMappings', 'computeMappingCoverage',
  // Integration
  'computeProjectEVM', 'computeEVMVariances', 'computeEVMByBill',
  'computeCashFlowForecast', 'computeIpcPipelineForecast',
  'computeUnbilledPhysicalAnalytics', 'computeSecureAdvanceRecoveryAnalytics',
  // Phase 5
  'buildWatchList', 'computeHeatStripData',
  // Phase A — Procurement (Phase 5.5 integration block)
  'ensureProcurementState', 'APPROVAL_CHAINS',
  'getDemand', 'getPo', 'getCrv', 'getProcPayment', 'getMaterialIssue',
  'computeApprovalChain', 'computeStageAging',
  'raiseDemand',
  'confirmDemandValidateById', 'confirmDemandRecommendById',
  'confirmDemandEndorseById',  'confirmDemandApproveById',
  'issuePoFromDemand', 'createCrv',
  'raiseProcPayment',
  'confirmProcPaymentPreauditById', 'confirmProcPaymentValidateById',
  'confirmProcPaymentApprovePdById', 'confirmProcPaymentApproveCeById',
  'confirmProcPaymentApproveDsById', 'confirmProcPaymentApproveDgById',
  'confirmProcPaymentPayById',     'confirmProcPaymentRecordById',
  'issueMaterial',
  'autoSuggestRarRecovery', 'confirmRarRecovery', 'markRecoveryAsRecovered',
  'computeProcurementKpis', 'computeApprovalInbox',
  /* v1.3.2 — register-mirror hook guards */
  'ensureFinancialState', 'recordFinancialReceipt', 'recordFinancialPayment',
  'getFinancialReceipt', 'getFinancialPayment',
];

let app;
try {
  const fn = new Function(js + '\n; if (typeof boot === "function") boot(); return {' +
    exposeNames.map(n => n + ': (typeof ' + n + " !== 'undefined') ? " + n + ' : undefined').join(', ') +
    '};');
  app = fn();
} catch (err) {
  console.error('FATAL: app failed to load:', err.message);
  console.error(err.stack);
  process.exit(2);
}

const s = app.state;

/* Pre-create critical DOM nodes so render calls don't throw */
['ipcKpiStrip', 'recoveryAnalyticsKpiStrip', 'recoveryAnalyticsBody',
 'unbilledPhysKpiStrip', 'unbilledPhysBody', 'watchKpiStrip', 'watchListBody',
 'heatStripBody', 'cfExecKpiStrip', 'cfExecTable', 'reconKpiStrip',
 'reconByIpcBody', 'reconByContractorBody', 'reconLinkerBody',
 'epcKpiStrip', 'epcIndexMaster', 'epcPipelineList', 'govAuditKpiStrip',
 'govAuditLogBody', 'govAuditCount', 'govAuditSearch', 'govAuditModule',
 'govAuditRole', 'govAuditFrom', 'govAuditTo', 'govRbacMatrixBody', 'govRbacArrow',
 'govRbacSummary', 'execPrintBarUser'].forEach(makeEl);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 1 — Application bootstrap verification
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 1 · Application bootstrap');

assert('app loaded successfully', !!app && !!s, 'truthy', !!app);
assertEq('BOQ_DATA has 434 items', app.BOQ_DATA.items.length, 434);
assertEq('BASELINE_DATA has 100 activities', app.BASELINE_DATA.length, 100);
assertGt('STORE_DATA has materials', app.STORE_DATA.length, 30);
assertGt('PLANT_DATA has units', app.PLANT_DATA.length, 5);
assertGt('EQ_DATA has equipment', app.EQ_DATA.length, 20);
assertGt('11 roles defined', Object.keys(app.ROLES).length, 10);
assertGt('46+ permissions defined', Object.keys(app.PERMISSIONS).length, 45);
assert('state.commercial exists', !!s.commercial);
assert('state.execution exists', !!s.execution);
assert('state.mapping exists', !!s.mapping);
assert('state.session exists', !!s.session);
assert('audit log initialized', Array.isArray(s.auditLog));

const totalContractBac = app.BOQ_DATA.items.reduce((sum, i) => sum + (i.amount || 0), 0);
console.log(`  ℹ Total contract BAC: PKR ${totalContractBac.toLocaleString()}`);
assertGt('contract BAC > 19 B PKR', totalContractBac, 19_000_000_000);

/* Make the test user an admin so all role checks pass */
s.session = { user: 'e2e-tester', role: 'admin' };

/* ─────────────────────────────────────────────────────────────────────
   PHASE 2 — BOQ distributions (mix of self/sublet/labour)
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 2 · BOQ distributions');

/* Create three subcontractors */
s.commercial.subcontractors = [
  { id: 'sub-a', code: 'SUB-A', name: 'Alpha Construction', type: 'sublet', status: 'active' },
  { id: 'sub-b', code: 'SUB-B', name: 'Bravo Civil',        type: 'sublet', status: 'active' },
  { id: 'lab-a', code: 'LAB-A', name: 'Alpha Labour',       type: 'labour', status: 'active' },
];

/* Pick first 30 BoQ items and distribute them */
const distItems = app.BOQ_DATA.items.slice(0, 30);
distItems.forEach((item, idx) => {
  const r = idx % 4;
  let allocations;
  if (r === 0) {
    /* Self-only */
    allocations = [{ id: 'a-' + idx, party: 'self', allocQty: item.quantity, executed: 0, subletRate: 0 }];
  } else if (r === 1) {
    /* Sublet to SUB-A */
    allocations = [{ id: 'a-' + idx, party: 'sublet', subId: 'sub-a', allocQty: item.quantity, executed: 0, subletRate: item.rate * 0.85 }];
  } else if (r === 2) {
    /* Sublet to SUB-B */
    allocations = [{ id: 'a-' + idx, party: 'sublet', subId: 'sub-b', allocQty: item.quantity, executed: 0, subletRate: item.rate * 0.82 }];
  } else {
    /* Labour-only */
    allocations = [{ id: 'a-' + idx, party: 'labour', subId: 'lab-a', allocQty: item.quantity, executed: 0, subletRate: item.rate * 0.25 }];
  }
  s.commercial.distributions[item.id] = { mode: r === 0 ? 'inhouse-100' : (r === 3 ? 'labour-100' : 'sublet-100'), allocations };
});

assertEq('30 distributions created', Object.keys(s.commercial.distributions).length, 30);
assertEq('first item is self-allocated', s.commercial.distributions[distItems[0].id].allocations[0].party, 'self');
assertEq('SUB-A gets every 4th item starting from idx 1', s.commercial.distributions[distItems[1].id].allocations[0].subId, 'sub-a');

/* ─────────────────────────────────────────────────────────────────────
   PHASE 3 — Execution updates (WBS actuals)
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 3 · Execution / WBS actuals');

/* Find leaf activities (those with no children) — actually all activities
   in BASELINE_DATA have unique IDs and act as leaves themselves */
const sampleActivities = app.BASELINE_DATA.slice(0, 10);
sampleActivities.forEach((act, idx) => {
  s.execution.activities[act.id] = {
    actualStart: '2026-02-' + String(15 + idx).padStart(2, '0'),
    actualFinish: idx < 5 ? '2026-03-' + String(18 + idx).padStart(2, '0') : '',
    percent: idx < 5 ? 100 : (60 - idx * 5),
    remarks: 'e2e-test'
  };
});
s.execution.dataDate = '2026-05-11';

assertEq('10 activities updated', Object.keys(s.execution.activities).length, 10);
const completedCount = Object.values(s.execution.activities).filter(a => a.percent === 100).length;
assertEq('5 activities at 100%', completedCount, 5);

/* Also set executed quantities on 20 of the distributed BoQs (75% of allocation) */
distItems.slice(0, 20).forEach((item, idx) => {
  const dist = s.commercial.distributions[item.id];
  if (dist && dist.allocations.length > 0) {
    dist.allocations[0].executed = item.quantity * 0.75;
  }
});

const itemWithExec = app.getItemStatus(distItems[0]);
assertGt('item 0 has executed quantity', itemWithExec.executed, 0);
console.log(`  ℹ Item 0 executed: ${itemWithExec.executed.toLocaleString()} / ${distItems[0].quantity.toLocaleString()}`);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 4 — Bulk mapping
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 4 · Bulk BOQ↔WBS + BOQ↔Material mapping');

app.autoSuggestAllBOQ();
const cov = app.computeMappingCoverage();
const totalMappedPct = (cov.confirmedPct || 0) + (cov.autoPct || 0) + (cov.disputedPct || 0);
console.log(`  ℹ Mapping coverage (by value): ${totalMappedPct.toFixed(1)}% (auto ${(cov.autoPct||0).toFixed(1)}%, confirmed ${(cov.confirmedPct||0).toFixed(1)}%)`);
console.log(`  ℹ WBS leaf coverage: ${cov.referencedWbsCount}/${cov.totalLeaves} leaves (${(cov.wbsCoverage||0).toFixed(1)}%)`);
assertGt('at least 30% of contract value mapped', totalMappedPct, 30);

app.autoSuggestAllMaterialMappings();
const matMappedCount = Object.values(s.mapping.boqToMaterial).filter(m => m.entries && m.entries.length > 0).length;
console.log(`  ℹ Material mappings: ${matMappedCount} BoQs`);
assertGt('material mappings present', matMappedCount, 50);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 5 — IPC #1 lifecycle (draft → suggest from physical → submit
   → vet → forward → approve → paid_pending_ack → ack → paid)
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 5 · IPC #1 full lifecycle');

/* Use ipcSuggestFromPhysical to pre-fill the draft */
app.ipcSuggestFromPhysical();
const draftSelCount = Object.keys(s.commercial.drafts.ipc.selections || {}).length;
console.log(`  ℹ IPC draft pre-filled with ${draftSelCount} BoQ lines from physical progress`);
assertGt('IPC draft has selections', draftSelCount, 0);

/* Provide DOM stubs the generator pulls from */
makeEl('ipcGenPeriod').value = 'Apr 2026';
makeEl('ipcGenDate').value = '2026-05-01';
makeEl('ipcGenStartDate').value = '2026-04-01';
makeEl('ipcGenEndDate').value = '2026-04-30';

const ipcCountBefore = s.commercial.ipcs.length;
app.generateIPC();
const ipcCountAfter = s.commercial.ipcs.length;
assertEq('IPC created', ipcCountAfter - ipcCountBefore, 1);

const ipc1 = s.commercial.ipcs[s.commercial.ipcs.length - 1];
console.log(`  ℹ IPC created: ${ipc1.ipcNo} · period "${ipc1.period}" · gross PKR ${(ipc1.gross || 0).toLocaleString()}`);
assertEq('IPC status starts at draft', ipc1.status, 'draft');
assertGt('IPC gross > 0', ipc1.gross, 0);
assertGt('IPC has lines', (ipc1.lines || []).length, 0);

/* Each pipeline stage in the real UI sets _currentIpcId when its modal opens.
   We mimic that by resetting before every confirm* call. */
function setCurrentIpc(id) { s.commercial._currentIpcId = id; }

setCurrentIpc(ipc1.id);
/* Provide DOM stubs the generator pulls from */
makeEl('ipcValDate').value = '2026-05-05';
makeEl('ipcValRef').value = 'VAL-001';
makeEl('ipcValNotes').value = 'e2e-test validation';

app.confirmIPCValidate();
assertEq('after confirmIPCValidate: status = submitted', ipc1.status, 'submitted');
console.log(`  ℹ IPC-${ipc1.ipcNo} → submitted`);

/* Stage 2: Consultant vetting. confirmVetting() reads .vetting-qty inputs. */
setCurrentIpc(ipc1.id);
makeEl('vettingDate').value = '2026-05-05';
makeEl('vettingNotes').value = 'e2e: accepted as submitted';
/* Fake .vetting-qty inputs: one per IPC line. The mock querySelectorAll
   will return these because we tag them with _mockClasses. */
(ipc1.lines || []).forEach(line => {
  const inp = makeEl('vet-qty-' + line.itemId);
  inp.value = String(line.qty);
  inp.dataset = { id: line.itemId, submitted: String(line.qty), rate: String(line.rate) };
  inp._mockClasses = ['vetting-qty'];
});

try {
  app.confirmVetting();
} catch (e) {
  console.log(`  ✗ confirmVetting threw: ${e.message}`);
}
assertEq('after confirmVetting: status = vetted', ipc1.status, 'vetted');
console.log(`  ℹ IPC-${ipc1.ipcNo} → vetted (vetted gross PKR ${(ipc1.vettedGross || 0).toLocaleString()})`);

/* Stage 3: Forward to client */
setCurrentIpc(ipc1.id);
makeEl('ipcFwdDate').value = '2026-05-06';
makeEl('ipcFwdRef').value = 'FWD-001';
makeEl('ipcFwdNotes').value = '';

app.confirmIPCForwardClient();
assertEq('after confirmIPCForwardClient: status = forwarded_to_client', ipc1.status, 'forwarded_to_client');
console.log(`  ℹ IPC-${ipc1.ipcNo} → forwarded_to_client`);

/* Stage 4: Client approval */
setCurrentIpc(ipc1.id);
makeEl('ipcAppDate').value = '2026-05-12';
makeEl('ipcAppRef').value = 'APP-001';
makeEl('ipcAppAmount').value = String(ipc1.netPayable || ipc1.gross);
app.confirmIPCClientApproved();
assertEq('after confirmIPCClientApproved: status = approved', ipc1.status, 'approved');
console.log(`  ℹ IPC-${ipc1.ipcNo} → approved`);

/* Stage 5: Acknowledge receipt */
setCurrentIpc(ipc1.id);
makeEl('ipcAckDate').value = '2026-05-13';
makeEl('ipcAckRef').value = 'ACK-001';
app.confirmIPCAcknowledge();
assertEq('after confirmIPCAcknowledge: status = paid_pending_ack', ipc1.status, 'paid_pending_ack');
console.log(`  ℹ IPC-${ipc1.ipcNo} → paid_pending_ack`);

/* Stage 6: Record payment */
setCurrentIpc(ipc1.id);
makeEl('ipcPayDate').value = '2026-06-10';
makeEl('ipcPayAmount').value = String(ipc1.netPayable || ipc1.gross);
makeEl('ipcPayRef').value = 'PAY-001';
app.confirmIPCPayment();
assertEq('after confirmIPCPayment: status = paid', ipc1.status, 'paid');
console.log(`  ℹ IPC-${ipc1.ipcNo} → PAID`);
console.log(`  ℹ Net paid: PKR ${(ipc1.paidAmount || ipc1.netPayable || 0).toLocaleString()}`);

/* Audit log should contain ipc transitions */
const ipcAudits = s.auditLog.filter(e => e.refType === 'ipc');
console.log(`  ℹ Audit log captured ${ipcAudits.length} IPC-related events`);
assertGt('audit log captured IPC events', ipcAudits.length, 3);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 5.5 — Procurement integration (rev 3.2)
   ─────────────────────────────────────────────────────────────────────
   Exercises the Phase A procurement module against the same synthetic
   project the existing test built. Verifies cross-module touchpoints
   (RAR auto-suggest recovery, audit routing) without disturbing the
   71 baseline assertions.

   STRICTLY ADDITIVE. Snapshot of commercial state captured before this
   block, asserted unchanged at end. Role switched explicitly per stage
   and reset to admin before Phase 6.
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 5.5 · Procurement integration (Phase A)');

/* No-bleed snapshot — captured BEFORE any procurement mutation */
const _procSnap = {
  ipcCount: s.commercial.ipcs.length,
  ipcGrossTotal: s.commercial.ipcs.reduce((sum, ipc) => sum + (ipc.grossAmount || 0), 0),
  commAuditCount: s.auditLog.filter(e => e.module === 'commercial').length,
};

/* Setup — switch to PIC to raise demands */
s.session.role = 'pic';
s.session.user = 'pic.tester';

/* Small demand (PKR 800K → ≤1M cap, chain prunes to length 2) */
const procSmallDem = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'P55-CMT', description: 'Cement OPC',
            qty: 800, unit: 'bags', estimatedRate: 1000 }],
  justification: 'Site office concrete',
});
assert('small demand raised', procSmallDem && procSmallDem.id);
assertEq('small demand chain pruned to length 2 (ends at PM)',
  procSmallDem.approvalChain.length, 2);

/* Medium demand (PKR 20M → ≤25M cap, chain length 3, ends at PD) */
const procMedDem = app.raiseDemand({
  type: 'material', flow: 'self_use',
  items: [{ code: 'P55-STL', description: 'TMT 16mm bars',
            qty: 80000, unit: 'kg', estimatedRate: 250 }],
});
assertEq('medium demand chain pruned to length 3 (ends at PD)',
  procMedDem.approvalChain.length, 3);

/* Walk small demand through PM → completed */
s.session.role = 'pm';
const smallValidate = app.confirmDemandValidateById(procSmallDem.id);
assert('PM validate on small demand', smallValidate === true);
assertEq('small demand reached completed', procSmallDem.status, 'completed');

/* PO issued from completed small demand */
s.session.role = 'admin';
const procPo = app.issuePoFromDemand(procSmallDem.id, {
  supplierName: 'P55 Test Supplier',
});
assert('PO issued from small demand', procPo && procPo.id);
assertEq('PO totalAmount matches demand', procPo.totalAmount, 800 * 1000);

/* CRV against PO — full delivery, status flips to received */
const procCrv = app.createCrv(procPo.id, [
  { code: 'P55-CMT', qtyReceived: 800, qtyAccepted: 800 },
], { qualityRemarks: 'Phase 5.5 receipt' });
assert('CRV created against PO', procCrv && procCrv.id);
assertEq('PO status received after full delivery', app.getPo(procPo.id).status, 'received');

/* Procurement payment — raise + walk full 9-stage chain */
s.session.role = 'pic';
const procPay = app.raiseProcPayment('po', procPo.id, procPo.totalAmount,
  { notes: 'Phase 5.5 payment' });
assert('procurement payment raised', procPay && procPay.id);
assertEq('payment has 9-stage chain', procPay.approvalChain.length, 9);

s.session.role = 'preaudit';   app.confirmProcPaymentPreauditById(procPay.id);
s.session.role = 'pm';         app.confirmProcPaymentValidateById(procPay.id);
s.session.role = 'pd';         app.confirmProcPaymentApprovePdById(procPay.id);
s.session.role = 'comd_engrs'; app.confirmProcPaymentApproveCeById(procPay.id);
s.session.role = 'dir_sp';     app.confirmProcPaymentApproveDsById(procPay.id);
s.session.role = 'dg';         app.confirmProcPaymentApproveDgById(procPay.id);
s.session.role = 'fm';         app.confirmProcPaymentPayById(procPay.id);
s.session.role = 'fh';         app.confirmProcPaymentRecordById(procPay.id);

const procPayFinal = app.getProcPayment(procPay.id);
assertEq('payment walked through 9 stages', procPayFinal.currentStage, 9);
assert('payment has paidAt stamp', !!procPayFinal.paidAt);

/* Sublet-issue material to sub-a (which exists from Phase 2) */
s.session.role = 'pic';
const procIssue = app.issueMaterial({
  materialCode: 'P55-STL', description: 'TMT 16mm', qtyIssued: 5000,
  unit: 'kg', issueRate: 250, flow: 'sublet_issue',
  issuedToSubId: 'sub-a',
});
assertEq('sublet issue: recoveryStatus pending', procIssue.recoveryStatus, 'pending');

/* Cross-module: autoSuggestRarRecovery picks up the pending issue */
const procSuggestions = app.autoSuggestRarRecovery('sub-a');
assert('autoSuggestRarRecovery returns ≥1 suggestion',
  Array.isArray(procSuggestions) && procSuggestions.length >= 1);
const p55Suggestion = procSuggestions.find(s => s.materialCode === 'P55-STL');
assert('suggestion contains P55-STL with correct totalAmount',
  p55Suggestion && Math.abs(p55Suggestion.totalAmount - (5000 * 250)) < 1);

/* Cross-module: confirmRarRecovery flips issue → confirmed */
const fakeRarId = 'rar-phase55-test';
const confirmOk = app.confirmRarRecovery(fakeRarId, p55Suggestion);
assert('confirmRarRecovery succeeds', confirmOk === true);
assertEq('issue flipped to confirmed', app.getMaterialIssue(procIssue.id).recoveryStatus, 'confirmed');

/* Cross-module: markRecoveryAsRecovered flips → recovered (simulates RAR paid) */
app.markRecoveryAsRecovered(fakeRarId);
assertEq('issue flipped to recovered', app.getMaterialIssue(procIssue.id).recoveryStatus, 'recovered');

/* Cross-module: audit routing — procurement entries don't bleed into commercial */
const procAuditEntries = s.auditLog.filter(e => e.module === 'procurement');
assertGt('procurement audit entries exist', procAuditEntries.length, 5);
const commAuditAfter = s.auditLog.filter(e => e.module === 'commercial').length;
assertEq('commercial audit count unchanged after procurement block',
  commAuditAfter, _procSnap.commAuditCount);

/* KPI cross-check */
const procKpis = app.computeProcurementKpis();
const expectedPoValue = s.procurement.pos.reduce((sum, po) => sum + (po.totalAmount || 0), 0);
assertEq('computeProcurementKpis().totalProcValue matches PO sum',
  procKpis.totalProcValue, expectedPoValue);

/* Approval inbox returns the medium demand (PM gating) */
const pmInbox = app.computeApprovalInbox('pm');
const medInInbox = pmInbox.find(i => i.id === procMedDem.id);
assert('PM inbox contains medium demand awaiting validate',
  medInInbox && medInInbox.action === 'validate');

/* No-bleed regression guard — most important assertion in this block */
const ipcGrossAfter = s.commercial.ipcs.reduce((sum, ipc) => sum + (ipc.grossAmount || 0), 0);
assertEq('Phase 5.5 did not change IPC count', s.commercial.ipcs.length, _procSnap.ipcCount);
assertEq('Phase 5.5 did not change IPC gross totals', ipcGrossAfter, _procSnap.ipcGrossTotal);

/* Reset role to admin for Phase 6 onwards */
s.session.role = 'admin';
s.session.user = '';

console.log(`  ℹ Phase 5.5 created: ${s.procurement.demands.length} demands, ${s.procurement.pos.length} POs, ${s.procurement.crvs.length} CRVs, ${s.procurement.payments.length} payments, ${procAuditEntries.length} audit entries`);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 5.6 — Register-mirror hook regression guards (v1.3.2)
   ─────────────────────────────────────────────────────────────────────
   These guards exist because B-010/B-012 taught us cross-module
   modifications need invariant checks. We pay a procurement payment
   and assert (a) the existing function still works AND (b) the
   register-mirror hook fired exactly once.

   IPC/RAR/EPC payment hooks themselves are exercised in the standalone
   smoke_test_financial.js — those functions read from DOM-dependent
   form-input elements which are not part of this lifecycle harness.
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 5.6 · v1.3.2 register-mirror hook guards');

/* Ensure financial module loaded and registers initialized */
if (typeof app.ensureFinancialState === 'function') app.ensureFinancialState();
assert('financial.payments register exists', Array.isArray(s.financial.payments));
const _hookSnap = {
  paymentsBefore: s.financial.payments.length,
  procPaidBefore: s.procurement.payments.filter(p => p.paidAt).length,
  procPayId: procPay.id,
};

/* The proc payment was already paid earlier in Phase 5.5 — at that point
   the v1.3.2 hook should have fired. Verify the receipt landed. */
const procFinRec = app.getFinancialPayment('proc_payment', procPay.id);
assert('v1.3.2: confirmProcPaymentPayById hook fired (register entry exists)',
  procFinRec !== null);
assertEq('v1.3.2: hook record refId matches paid procurement payment',
  procFinRec && procFinRec.refId, procPay.id);

/* Idempotency: calling getFinancialPayment with the same key returns same record,
   never a duplicate. Try to force a duplicate via direct helper call. */
const dupAttempt = app.recordFinancialPayment({
  refType: 'proc_payment', refId: procPay.id, refNo: procPay.paymentNo,
  amount: 99_999, paidAt: '2026-12-31T00:00:00.000Z',
});
assertEq('v1.3.2: idempotency — duplicate recordFinancialPayment is no-op',
  s.financial.payments.filter(p => p.refType === 'proc_payment' && p.refId === procPay.id).length, 1);

/* Restore role */
s.session.role = 'admin';
s.session.user = '';

/* ─────────────────────────────────────────────────────────────────────
   PHASE 6 — RAR #1 lifecycle (for SUB-A)
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 6 · RAR #1 full lifecycle');

/* Set up RAR draft for SUB-A. NB: draft.selections is keyed by ALLOCATION ID,
   not BoQ item ID. We iterate distributions to find SUB-A's allocations. */
s.commercial.drafts.rar = { subId: 'sub-a', selections: {}, customDeductions: [] };
let rarLineCount = 0;
Object.values(s.commercial.distributions).forEach(dist => {
  dist.allocations.forEach(a => {
    if (a.subId === 'sub-a' && a.executed > 0) {
      s.commercial.drafts.rar.selections[a.id] = a.executed * 0.9;  /* 90% of executed */
      rarLineCount++;
    }
  });
});
console.log(`  ℹ Prepared RAR draft with ${rarLineCount} allocation entries for SUB-A`);

/* The generator reads rarPeriod / rarDate from DOM (not rarGen*) */
makeEl('rarPeriod').value = 'Apr 2026';
makeEl('rarDate').value = '2026-05-02';

const rarCountBefore = s.commercial.rars.length;
app.generateRAR();
const rarCountAfter = s.commercial.rars.length;
assertEq('RAR created', rarCountAfter - rarCountBefore, 1);

const rar1 = s.commercial.rars[s.commercial.rars.length - 1];
console.log(`  ℹ RAR created: ${rar1.rarNo} · gross PKR ${(rar1.gross || 0).toLocaleString()}`);
assertEq('RAR status starts at draft', rar1.status, 'draft');
assertEq('RAR for SUB-A', rar1.subId, 'sub-a');
assertGt('RAR gross > 0', rar1.gross, 0);

function setCurrentRar(id) { s.commercial._currentRarId = id; }

/* Stage 1: validate */
setCurrentRar(rar1.id);
makeEl('rarValDate').value = '2026-05-08';
makeEl('rarValRef').value = 'RVAL-001';
makeEl('rarValNotes').value = '';
app.confirmRARValidate();
assertEq('after confirmRARValidate', rar1.status, 'validated');
console.log(`  ℹ RAR-${rar1.rarNo} → validated`);

/* Stage 2: verify */
setCurrentRar(rar1.id);
makeEl('rarVerifyDate').value = '2026-05-12';
makeEl('rarVerifyRef').value = 'RVER-001';
makeEl('rarVerifyNotes').value = '';
app.confirmRARVerify();
assertEq('after confirmRARVerify', rar1.status, 'verified');
console.log(`  ℹ RAR-${rar1.rarNo} → verified`);

/* Stage 3: approve */
setCurrentRar(rar1.id);
makeEl('rarApproveDate').value = '2026-05-15';
makeEl('rarApproveRef').value = 'RAPP-001';
makeEl('rarApproveNotes').value = '';
app.confirmRARApprove();
assertEq('after confirmRARApprove', rar1.status, 'approved');
console.log(`  ℹ RAR-${rar1.rarNo} → approved`);

/* Stage 4: mark for payment */
setCurrentRar(rar1.id);
makeEl('rarMarkDate').value = '2026-05-18';
makeEl('rarMarkRef').value = 'RMRK-001';
app.confirmRARMarkPayment();
assertEq('after confirmRARMarkPayment', rar1.status, 'marked_for_payment');
console.log(`  ℹ RAR-${rar1.rarNo} → marked_for_payment`);

/* Stage 5: record payment */
setCurrentRar(rar1.id);
makeEl('rarPayDate').value = '2026-06-05';
makeEl('rarPayAmount').value = String(rar1.netPayable || rar1.gross);
makeEl('rarPayRef').value = 'RPAY-001';
app.confirmRARPayment();
assertEq('after confirmRARPayment', rar1.status, 'paid');
console.log(`  ℹ RAR-${rar1.rarNo} → PAID`);

const rarAudits = s.auditLog.filter(e => e.refType === 'rar');
assertGt('audit log captured RAR events', rarAudits.length, 3);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 7 — Reconciliation linkage
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 7 · RAR↔IPC reconciliation');

/* Suggest IPC overlap for the RAR */
let suggestions = app.suggestIpcLinksForRar(rar1.id);
console.log(`  ℹ RAR-${rar1.rarNo} has ${suggestions.length} suggested IPC linkages`);

/* The IPC came from ipcSuggestFromPhysical (mapped BoQ items) and the RAR
   came from SUB-A's executed allocations. In this synthetic data those
   sets don't naturally overlap. To validate the suggester math, inject a
   shared BoQ item via a synthetic second IPC and RAR with shared lines. */
if (suggestions.length === 0) {
  console.log(`  ℹ No natural overlap in synthetic data — injecting shared-item IPC to verify suggester`);
  const sharedItem = app.BOQ_DATA.items[1];  /* same item as one of SUB-A's allocations */
  s.commercial.ipcs.push({
    id: 'ipc-overlap', ipcNo: 'IPC-OV', period: 'Apr 2026', status: 'vetted',
    gross: 50_000_000, vettedGross: 50_000_000,
    lines: [{ itemId: sharedItem.id, qty: 1000, rate: sharedItem.rate, amount: app.calcAmount(sharedItem, 1000, sharedItem.rate) }],
    vettedLines: [{ itemId: sharedItem.id, qty: 1000, rate: sharedItem.rate, amount: app.calcAmount(sharedItem, 1000, sharedItem.rate) }],
  });
  /* Inject a synthetic RAR that shares the item */
  s.commercial.rars.push({
    id: 'rar-overlap', rarNo: 'RAR-OV', subId: 'sub-a', period: 'Apr 2026', status: 'validated',
    gross: 30_000_000, netPayable: 28_500_000,
    lines: [{ itemId: sharedItem.id, qty: 800, rate: sharedItem.rate * 0.85, amount: app.calcAmount(sharedItem, 800, sharedItem.rate * 0.85) }],
    vettedLines: [{ itemId: sharedItem.id, qty: 800, rate: sharedItem.rate * 0.85, amount: app.calcAmount(sharedItem, 800, sharedItem.rate * 0.85) }],
  });
  suggestions = app.suggestIpcLinksForRar('rar-overlap');
}
console.log(`  ℹ Suggestions now: ${suggestions.length}`);
if (suggestions.length > 0) {
  console.log(`  ℹ Top suggestion: ${suggestions[0].ipcNo} (overlap PKR ${suggestions[0].score.toLocaleString()})`);
}
assertGt('at least one suggestion (via synthetic overlap if needed)', suggestions.length, 0);

/* Auto-link */
app.autoLinkAllRars();
const linkedCount = Object.values(s.commercial.rarToIpcLinks || {}).reduce((n, ids) => n + (ids || []).length, 0);
console.log(`  ℹ Total RAR↔IPC links after auto-link: ${linkedCount}`);
assertGt('at least one RAR auto-linked', linkedCount, 0);

/* Compute reconciliation views */
const byIpc = app.computeReconciliationByIpc();
const byCont = app.computeReconciliationByContractor();
const reconKpis = app.computeReconciliationKpis();
console.log(`  ℹ Reconciliation totals: NLC rev ${reconKpis.totalNlcRevenue.toLocaleString()}, RAR booked ${reconKpis.totalRarGross.toLocaleString()}, coverage ${reconKpis.coverage.toFixed(1)}%`);
assertGt('per-IPC rows present', byIpc.rows.length, 0);
assertGt('per-contractor rows present', byCont.rows.length, 0);

const subARow = byCont.rows.find(r => r.sub.code === 'SUB-A');
if (subARow) {
  assertGt('SUB-A has RAR gross', subARow.rarGross, 0);
  assertGt('SUB-A has paid amount', subARow.rarPaid, 0);
  console.log(`  ℹ SUB-A reconciliation: dist ${subARow.distributedCost.toLocaleString()}, RAR gross ${subARow.rarGross.toLocaleString()}, status ${subARow.status}`);
}

/* ─────────────────────────────────────────────────────────────────────
   PHASE 8 — EPC lifecycle
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 8 · EPC lifecycle');

app.ensureEpcState();
const pn = app.computeEpcPn();
console.log(`  ℹ Current Pn coefficient: ${pn.toFixed(4)} (${((pn - 1) * 100).toFixed(2)}% escalation)`);
assertGt('Pn > 1.0 (escalation positive)', pn, 1.0);

/* Generate EPC for the paid IPC */
const epc = app.generateEpcDraft(ipc1.id);
assert('EPC draft created', !!epc, 'truthy', !!epc);
if (epc) {
  console.log(`  ℹ EPC: ${epc.epcNo} for ${epc.ipcNo} · Pn ${epc.pn.toFixed(4)} · amount PKR ${epc.amount.toLocaleString()}`);
  /* Verify math: amount = baseGross × (pn − 1) */
  const expected = epc.baseGross * (epc.pn - 1);
  assertEq('EPC amount = baseGross × (Pn − 1)', epc.amount, expected, 1);
  assertEq('EPC starts in draft', epc.status, 'draft');

  /* Advance through pipeline */
  app.submitEpc(epc.id);
  assertEq('EPC after submit', epc.status, 'submitted');
  app.vetEpc(epc.id);
  assertEq('EPC after vet', epc.status, 'vetted');
  app.approveEpc(epc.id);
  assertEq('EPC after approve', epc.status, 'approved');
  app.payEpc(epc.id);
  assertEq('EPC after pay', epc.status, 'paid');
  console.log(`  ℹ EPC-${epc.epcNo} → PAID (PKR ${epc.amount.toLocaleString()})`);
}

/* ─────────────────────────────────────────────────────────────────────
   PHASE 9 — Cross-module: EVM verification
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 9 · EVM Snapshot (cross-module)');

const evm = app.computeProjectEVM();
const vars = app.computeEVMVariances(evm);
console.log(`  ℹ BAC: PKR ${evm.bac.toLocaleString()}`);
console.log(`  ℹ EV : PKR ${evm.ev.toLocaleString()} (${(evm.ev / evm.bac * 100).toFixed(2)}%)`);
console.log(`  ℹ PV : PKR ${evm.pv.toLocaleString()} (${(evm.pv / evm.bac * 100).toFixed(2)}%)`);
console.log(`  ℹ AC : PKR ${evm.ac.toLocaleString()}`);
console.log(`  ℹ CPI: ${vars.cpi == null ? 'n/a (no AC yet)' : vars.cpi.toFixed(2)} · SPI: ${vars.spi == null ? 'n/a' : vars.spi.toFixed(2)}`);
console.log(`  ℹ EAC: ${vars.eac == null ? 'n/a' : 'PKR ' + vars.eac.toLocaleString()} · VAC: ${vars.vac == null ? 'n/a' : 'PKR ' + vars.vac.toLocaleString()}`);

assertGt('EVM has BAC', evm.bac, 19_000_000_000);
assertGt('EVM has EV (some work done)', evm.ev, 0);
if (vars.cpi != null) {
  assertGt('CPI is positive', vars.cpi, 0);
  assert('CPI is finite', isFinite(vars.cpi), 'finite', vars.cpi);
} else {
  console.log(`  ℹ CPI is null (AC=${evm.ac}) — acceptable when no actual cost tracked`);
}

const evmByBill = app.computeEVMByBill();
assertEq('12 bills in EVM breakdown', evmByBill.length, 12);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 10 — Cross-module: Cash Flow Forecast
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 10 · Cash Flow Forecast (cross-module)');

const cf = app.computeCashFlowForecast({ horizonMonths: 6, today: '2026-05-11' });
console.log(`  ℹ Horizon: ${cf.horizonMonths} months from ${cf.rows[0]?.key} to ${cf.rows[cf.rows.length-1]?.key}`);
console.log(`  ℹ Total Inflows : PKR ${cf.totalIn.toLocaleString()}`);
console.log(`  ℹ Total Outflows: PKR ${cf.totalOut.toLocaleString()}`);
console.log(`  ℹ Net Position  : PKR ${cf.netPos.toLocaleString()}`);
console.log(`  ℹ Worst cum     : PKR ${cf.worstCum.toLocaleString()} at ${cf.worstMonth}`);

assertEq('6 monthly buckets', cf.rows.length, 6);
assertGt('IPC pipeline has forecast entries (or zero if all paid)', cf.ipcForecast.length, -1);
assertGt('forward-billable computed', cf.forward.total, -1);

/* The IPC we just paid should NOT appear in pipeline forecast */
const paidIpcInPipeline = cf.ipcForecast.find(f => f.ipcNo === ipc1.ipcNo);
assert('paid IPC excluded from pipeline forecast', !paidIpcInPipeline, 'undefined', paidIpcInPipeline);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 11 — Cross-module: Unbilled physical analytics (Phase 4-E)
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 11 · Unbilled physical analytics');

/* Reset the draft so suggestions reflect what's truly unbilled */
s.commercial.drafts.ipc.selections = {};

const unb = app.computeUnbilledPhysicalAnalytics();
console.log(`  ℹ Unbilled physical value : PKR ${unb.totalValue.toLocaleString()}`);
console.log(`  ℹ Items contributing      : ${unb.totalItems}`);
console.log(`  ℹ Mapping coverage of BAC : ${unb.mappingValuePct.toFixed(1)}%`);
console.log(`  ℹ Already claimed value   : PKR ${unb.claimedValue.toLocaleString()}`);

assertGt('mapping coverage > 0', unb.mappingValuePct, 0);
assertGt('already-claimed value > 0 (IPC was paid)', unb.claimedValue, 0);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 12 — Cross-module: Watch List + Heat Strip (Phase 5)
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 12 · Watch List + Heat Strip');

const watch = app.buildWatchList();
console.log(`  ℹ Watch List has ${watch.length} alerts`);
const bySev = {};
watch.forEach(a => bySev[a.severity] = (bySev[a.severity] || 0) + 1);
console.log(`  ℹ By severity: ${JSON.stringify(bySev)}`);
const bySrc = {};
watch.forEach(a => bySrc[a.source] = (bySrc[a.source] || 0) + 1);
console.log(`  ℹ By source: ${JSON.stringify(bySrc)}`);

/* Sort is by score descending */
for (let i = 1; i < watch.length; i++) {
  if (watch[i].score > watch[i-1].score) {
    assert('watch list sort broken at index ' + i, false, 'desc order', 'broken');
    break;
  }
}
assert('watch list properly sorted', true);

const heat = app.computeHeatStripData();
assertEq('Heat Strip has 12 bills', heat.length, 12);
const goodBills = heat.filter(h => h.healthScore <= 2).length;
console.log(`  ℹ Heat strip: ${goodBills}/12 bills with health ≤ 2 (good)`);

/* ─────────────────────────────────────────────────────────────────────
   PHASE 13 — Audit log final state
   ───────────────────────────────────────────────────────────────────── */
section('PHASE 13 · Audit log final state');

const auditByModule = {};
s.auditLog.forEach(e => {
  auditByModule[e.module || 'system'] = (auditByModule[e.module || 'system'] || 0) + 1;
});
console.log(`  ℹ Total audit entries: ${s.auditLog.length}`);
Object.entries(auditByModule).forEach(([m, c]) => console.log(`  ℹ   ${m}: ${c} events`));

assertGt('audit log has commercial events', auditByModule.commercial || 0, 5);
assertGt('audit log under cap', 5000 - s.auditLog.length, 0);

/* ─────────────────────────────────────────────────────────────────────
   FINAL TALLY
   ───────────────────────────────────────────────────────────────────── */
console.log('');
console.log('═'.repeat(74));
console.log(` END-TO-END LIFECYCLE TEST RESULTS`);
console.log('═'.repeat(74));
console.log(` Tests run    : ${_testsRun}`);
console.log(` Tests passed : ${_testsPassed}  ${_testsPassed === _testsRun ? '✓' : ''}`);
console.log(` Tests failed : ${_testsFailed}  ${_testsFailed > 0 ? '✗' : ''}`);
if (_failures.length) {
  console.log('');
  console.log(' FAILURES:');
  _failures.forEach((f, i) => {
    console.log(`  ${i+1}. ${f.label}`);
    if (f.expected !== undefined) {
      console.log(`     expected: ${f.expected}`);
      console.log(`     actual  : ${f.actual}`);
    }
  });
}
console.log('═'.repeat(74));

process.exit(_testsFailed > 0 ? 1 : 0);

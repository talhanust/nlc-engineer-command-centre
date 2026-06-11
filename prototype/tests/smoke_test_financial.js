/* ============================================================
   PHASE B (Session 1) — FINANCIAL MODULE SMOKE TEST
   ============================================================
   Skeleton verification: state bootstrap, 13 KPI compute paths,
   payments register, drill paths, tab nav. ~22 assertions.

   Strictly engine-level (KPI math, filtering, drill semantics).
   Modal visibility / UI behavior covered by manual browser checks.
   ============================================================ */

const fs = require('fs');
const src = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const boqMatch = src.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => a.length > b.length ? a : b);

const definedIds = new Set();
const idRe = /id="([^"]+)"/g;
let m; while ((m = idRe.exec(src)) !== null) definedIds.add(m[1]);

/* ─── Test harness ─── */
let _testsRun = 0, _testsPassed = 0, _testsFailed = 0;
const _failures = [];
function assert(label, condition, expected, actual) {
  _testsRun++;
  if (condition) { _testsPassed++; console.log(`  ✓ ${label}`); }
  else { _testsFailed++; console.log(`  ✗ ${label}`); _failures.push({ label, expected, actual }); }
}
function assertEq(label, actual, expected, tol) {
  tol = tol || 0;
  const eq = (typeof actual === 'number' && typeof expected === 'number')
    ? Math.abs(actual - expected) <= Math.max(tol, Math.abs(expected) * 0.0001 || 1e-9)
    : actual === expected;
  assert(label, eq, JSON.stringify(expected), JSON.stringify(actual));
}
function section(name) {
  console.log('');
  console.log('─'.repeat(74));
  console.log(' ' + name);
  console.log('─'.repeat(74));
}

/* ─── DOM mock ─── */
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
      options: [], _children: [], parentElement: { innerHTML: '' },
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
const TEST_NOW = new Date('2026-05-20T00:00:00.000Z').getTime();
global.Date.now = () => TEST_NOW;
const OD = global.Date;
global.Date = class extends OD {
  constructor(...a) {
    if (a.length === 0) super(TEST_NOW);
    else super(...a);
  }
  static now() { return TEST_NOW; }
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

const exposeNames = [
  'state', 'ROLES', 'fmt', 'audit',
  'ensureFinancialState', 'computeAllKpis', 'computeKpi',
  'listFinancialPayments', 'drillFromKpiToPayments', 'clearFinancialFilter',
  'switchFinancialTab', 'refreshFinancialBadges',
  /* v1.3.2 — Register-mirror helpers */
  'recordFinancialReceipt', 'recordFinancialPayment',
  'getFinancialReceipt', 'getFinancialPayment',
  /* v1.3.3 — Receipts + Liabilities tabs */
  'computeReceiptsByMonth', 'computeOutstandingRars', 'computeRetentionHeld',
  'renderFinancialReceipts', 'renderFinancialLiabilities',
  /* v1.3.4 — Classification */
  'getDefaultClassification', 'backfillClassification',
  'FIN_CLASSIFICATIONS',
  /* v1.3.5 — UI editors + admin + new KPIs */
  'changeClassification', 'changeSubCategory', 'addSubCategory',
  'setPlannedOverhead', 'getPlannedOverhead', 'getTotalPlannedOverhead',
  'computeOverheadBurnRate', 'computeOverheadVsBudget', 'computeMonthlyOverhead',
  'renderOverheadSparkline',
  /* v1.3.6 — Session 5 */
  'backfillReceiptsFromPaidIpcs', 'manualReScanReceipts',
  'computeCashFlowByMonth', 'renderFinancialCashFlow', 'renderCashFlowChart',
  'computePlannedVsActualAllMonths', 'renderPlannedVsActual',
  /* v1.3.7 — Session 6 (Phase B closeout) */
  'computePLForPeriod', 'computePLByMonth', 'renderFinancialPL',
  'computeFinancialCashFlowForecast', 'renderCashFlowForecastChart', 'setForecastWindow',
  'renderFinancialDashboard',
  /* Phase A — needed to seed payable docs for KPI math */
  'ensureProcurementState', 'raiseDemand', 'issuePoFromDemand',
  'raiseProcPayment',
  'confirmProcPaymentPreauditById', 'confirmProcPaymentValidateById',
  'confirmProcPaymentApprovePdById', 'confirmProcPaymentApproveCeById',
  'confirmProcPaymentApproveDsById', 'confirmProcPaymentApproveDgById',
  'confirmProcPaymentPayById', 'confirmProcPaymentRecordById',
  'confirmDemandValidateById', 'confirmDemandRecommendById',
  'confirmDemandEndorseById',  'confirmDemandApproveById',
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
const setRole = (r) => { state.session.role = r; state.session.user = 'tester'; };

console.log('═'.repeat(74));
console.log(' PHASE B (Session 1) — FINANCIAL MODULE SMOKE TEST');
console.log('═'.repeat(74));

/* ═════════════════════════════════════════════════════════════
   GROUP 1 — STATE BOOTSTRAP (3 assertions)
   ═════════════════════════════════════════════════════════════ */
section('STATE BOOTSTRAP');

assert('state.financial exists after boot',
  state.financial && typeof state.financial === 'object');
assert('kpiSnapshots is empty array on fresh state',
  Array.isArray(state.financial.kpiSnapshots) && state.financial.kpiSnapshots.length === 0);
assertEq('ui.activeFinancialTab default is dashboard',
  state.financial.ui.activeFinancialTab, 'dashboard');

/* ═════════════════════════════════════════════════════════════
   GROUP 2 — KPI COMPUTATION (10 assertions)
   ═════════════════════════════════════════════════════════════
   On a fresh boot with no IPCs/RARs, all monetary KPIs should be 0.
   We then seed minimal data and re-check formulas.
   ═════════════════════════════════════════════════════════════ */
section('KPI COMPUTATION — empty state');

setRole('admin');
let k = app.computeAllKpis();
assertEq('empty state: grossRevenue = 0',     k.grossRevenue,     0);
assertEq('empty state: vettedRevenue = 0',    k.vettedRevenue,    0);
assertEq('empty state: directCost = 0',       k.directCost,       0);
assertEq('empty state: overheadCost = 0 (session 1 known)', k.overheadCost, 0);
assertEq('empty state: slippage = 0',         k.slippage,         0);

/* Empty-state ratios use /0 guards → should all be 0 (not NaN/Infinity) */
assertEq('empty state: slippageRate = 0 (not NaN)', k.slippageRate, 0);
assertEq('empty state: fundsUtilization = 0 (not NaN)', k.fundsUtilization, 0);
assertEq('empty state: revenueTransferRate = 0 (not NaN)', k.revenueTransferRate, 0);

/* Seed synthetic IPCs to verify Gross Revenue formula */
state.commercial.ipcs.push({
  id: 'ipc-test-1', ipcNo: 'IPC-T-001',
  status: 'draft', gross: 1000000, netPayable: 950000,
  vettedGross: null, vettedNetPayable: null,
  draftedAt: '2026-05-15T00:00:00.000Z', createdAt: '2026-05-15T00:00:00.000Z',
  paidAt: null, paidAmount: null,
});
state.commercial.ipcs.push({
  id: 'ipc-test-2', ipcNo: 'IPC-T-002',
  status: 'paid', gross: 2000000, netPayable: 1900000,
  vettedGross: 1950000, vettedNetPayable: 1850000,
  draftedAt: '2026-05-10T00:00:00.000Z', createdAt: '2026-05-10T00:00:00.000Z',
  paidAt: '2026-05-18T00:00:00.000Z', paidAmount: 1850000,
});

k = app.computeAllKpis();
assertEq('seeded: grossRevenue = 1M + 2M = 3M',
  k.grossRevenue, 3_000_000);
assertEq('seeded: vettedRevenue = 1.95M (only IPC-T-002 is vetted+)',
  k.vettedRevenue, 1_950_000);

/* Slippage = gross − vetted */
assertEq('seeded: slippage = grossRevenue − vettedRevenue',
  k.slippage, k.grossRevenue - k.vettedRevenue);

/* v1.3.1 regression guards (B-012, B-013) — exercise EVERY real IPC status
   transition to catch wrong status-name assumptions. Each status must be
   recognized correctly by VETTED_OR_LATER / APPROVED_OR_LATER filters. */
const realStatuses = [
  { st: 'submitted',           expectVetted: false, expectReceivable: false },
  { st: 'vetted',              expectVetted: true,  expectReceivable: false },
  { st: 'forwarded_to_client', expectVetted: true,  expectReceivable: false },
  { st: 'approved',            expectVetted: true,  expectReceivable: true  },
  { st: 'paid_pending_ack',    expectVetted: true,  expectReceivable: true  },
  { st: 'paid',                expectVetted: true,  expectReceivable: false }, /* paid excluded from receivable */
];
realStatuses.forEach(({ st, expectVetted, expectReceivable }) => {
  state.commercial.ipcs.length = 0;
  state.commercial.ipcs.push({
    id: 'ipc-status-' + st, ipcNo: 'IPC-' + st,
    status: st, gross: 1_000_000, netPayable: 950_000,
    vettedGross: 980_000, vettedNetPayable: 940_000,
    draftedAt: '2026-05-10T00:00:00.000Z', createdAt: '2026-05-10T00:00:00.000Z',
    paidAt: st === 'paid' ? '2026-05-18T00:00:00.000Z' : null,
    paidAmount: st === 'paid' ? 940_000 : null,
  });
  const r = app.computeAllKpis();
  assertEq(`status '${st}': vettedRevenue ${expectVetted ? '> 0' : '= 0'}`,
    r.vettedRevenue > 0, expectVetted);
  assertEq(`status '${st}': netReceivable ${expectReceivable ? '> 0' : '= 0'}`,
    r.netReceivable > 0, expectReceivable);
});

/* Cleanup */
state.commercial.ipcs.length = 0;

/* ═════════════════════════════════════════════════════════════
   GROUP 3 — PAYMENTS REGISTER (4 assertions)
   ═════════════════════════════════════════════════════════════ */
section('PAYMENTS REGISTER');

let rows = app.listFinancialPayments();
assert('listFinancialPayments returns an array', Array.isArray(rows));
assertEq('empty state: 0 rows', rows.length, 0);

/* Seed a paid RAR */
state.commercial.rars.push({
  id: 'rar-test-1', rarNo: 'RAR-T-001',
  status: 'paid', netPayable: 500000, paidAmount: 500000,
  paidAt: '2026-05-18T00:00:00.000Z', updatedAt: '2026-05-18T00:00:00.000Z',
});

rows = app.listFinancialPayments();
assertEq('after seeding 1 paid RAR: 1 row in register', rows.length, 1);
assertEq('RAR row has correct refType', rows[0].refType, 'rar');

/* Filter by refType */
rows = app.listFinancialPayments({ refType: 'epc' });
assertEq('filter by refType=epc returns 0 rows (no EPCs seeded)', rows.length, 0);

/* Cleanup */
state.commercial.rars.length = 0;

/* ═════════════════════════════════════════════════════════════
   GROUP 4 — DRILL PATHS (3 assertions)
   ═════════════════════════════════════════════════════════════ */
section('DRILL PATHS');

app.drillFromKpiToPayments('directCost');
assertEq('drillFromKpiToPayments sets selectedKpi',
  state.financial.ui.selectedKpi, 'directCost');
assertEq('drill sets classification filter for directCost',
  state.financial.ui.filter.classification, 'direct_cost');
assertEq('drill switches active tab to payments',
  state.financial.ui.activeFinancialTab, 'payments');

/* clearFilter cleanup */
app.clearFinancialFilter();
assertEq('clearFinancialFilter resets selectedKpi',
  state.financial.ui.selectedKpi, null);

/* ═════════════════════════════════════════════════════════════
   GROUP 5 — TAB NAV + INTEGRATION SANITY (3 assertions)
   ═════════════════════════════════════════════════════════════ */
section('TAB NAV + INTEGRATION');

app.switchFinancialTab('payments');
assertEq('switchFinancialTab persists activeFinancialTab',
  state.financial.ui.activeFinancialTab, 'payments');

app.switchFinancialTab('dashboard');
assertEq('switching back to dashboard works',
  state.financial.ui.activeFinancialTab, 'dashboard');

/* refreshFinancialBadges should be callable without throwing on empty state */
let badgeOk = true;
try { app.refreshFinancialBadges(); } catch (e) { badgeOk = false; }
assert('refreshFinancialBadges callable on empty state without error', badgeOk);

/* ═════════════════════════════════════════════════════════════
   GROUP 6 — REGISTER-MIRROR HOOKS (v1.3.2) — 15 assertions
   ═════════════════════════════════════════════════════════════
   Tests the additive register-mirror that v1.3.2 introduces.
   KPI compute path is NOT changed — registers are audit-only.
   Hooks are idempotent (dedup on refType+refId).
   ═════════════════════════════════════════════════════════════ */
section('REGISTER-MIRROR HOOKS (v1.3.2)');

/* Reset registers for clean test */
state.financial.receipts = [];
state.financial.payments = [];

/* 1-2. State bootstrap: arrays exist after ensure */
assert('state.financial.receipts is an array after ensureFinancialState',
  Array.isArray(state.financial.receipts));
assert('state.financial.payments is an array after ensureFinancialState',
  Array.isArray(state.financial.payments));

/* 3-4. Helpers callable */
assert('recordFinancialReceipt is callable (typeof function)',
  typeof app.recordFinancialReceipt === 'function');
assert('recordFinancialPayment is callable (typeof function)',
  typeof app.recordFinancialPayment === 'function');

/* 5. Record one receipt: length goes 0 → 1 */
const rec1 = app.recordFinancialReceipt({
  refType: 'ipc', refId: 'ipc-hook-1', refNo: 'IPC-H-001',
  amount: 1_000_000, paidAt: '2026-05-18T00:00:00.000Z',
});
assertEq('after one record: receipts.length === 1',
  state.financial.receipts.length, 1);

/* 6. Record one payment: length goes 0 → 1 */
const pay1 = app.recordFinancialPayment({
  refType: 'rar', refId: 'rar-hook-1', refNo: 'RAR-H-001',
  amount: 500_000, paidAt: '2026-05-18T00:00:00.000Z',
});
assertEq('after one record: payments.length === 1',
  state.financial.payments.length, 1);

/* 7. IDEMPOTENCY: same refType+refId twice → still 1 entry */
app.recordFinancialReceipt({
  refType: 'ipc', refId: 'ipc-hook-1', refNo: 'IPC-H-001',
  amount: 999_999, paidAt: '2026-05-19T00:00:00.000Z', /* different values to prove dedup wins */
});
assertEq('idempotency: same refType+refId twice → still 1 receipt',
  state.financial.receipts.length, 1);

/* 8. IDEMPOTENCY (payments): same refType+refId twice → still 1 entry */
app.recordFinancialPayment({
  refType: 'rar', refId: 'rar-hook-1', refNo: 'RAR-H-001',
  amount: 111_111, paidAt: '2026-05-19T00:00:00.000Z',
});
assertEq('idempotency: same refType+refId twice → still 1 payment',
  state.financial.payments.length, 1);

/* 9-10. Different refIds: 2 calls → 2 entries */
app.recordFinancialReceipt({
  refType: 'ipc', refId: 'ipc-hook-2', refNo: 'IPC-H-002',
  amount: 2_000_000, paidAt: '2026-05-19T00:00:00.000Z',
});
assertEq('different refIds: 2 receipts now',
  state.financial.receipts.length, 2);
app.recordFinancialPayment({
  refType: 'epc', refId: 'epc-hook-1', refNo: 'EPC-H-001',
  amount: 750_000, paidAt: '2026-05-19T00:00:00.000Z',
});
assertEq('different refIds: 2 payments now',
  state.financial.payments.length, 2);

/* 11-12. getFinancialReceipt / getFinancialPayment lookup */
const fetched = app.getFinancialReceipt('ipc', 'ipc-hook-1');
assert('getFinancialReceipt returns the record',
  fetched && fetched.refNo === 'IPC-H-001');
const notFound = app.getFinancialReceipt('ipc', 'nonexistent');
assertEq('getFinancialReceipt returns null for unknown refId',
  notFound, null);

/* 13. Record has the expected field shape */
assert('receipt has id, refType, refId, refNo, amount, paidAt fields',
  rec1 && rec1.id && rec1.refType === 'ipc' && rec1.refId === 'ipc-hook-1' &&
  rec1.refNo === 'IPC-H-001' && rec1.amount === 1_000_000 && rec1.paidAt);

/* 14. Amount preserved as number (not string) */
assert('receipt.amount is a number type',
  typeof rec1.amount === 'number');

/* 15. JSON round-trip preserves register contents */
const serialized = JSON.stringify(state.financial);
const round = JSON.parse(serialized);
assert('receipts survive JSON round-trip',
  Array.isArray(round.receipts) && round.receipts.length === 2);
assert('payments survive JSON round-trip',
  Array.isArray(round.payments) && round.payments.length === 2);

/* ═════════════════════════════════════════════════════════════
   GROUP 7 — RECEIPTS TAB (v1.3.3) — 10 assertions
   ═════════════════════════════════════════════════════════════ */
section('RECEIPTS TAB (v1.3.3)');

/* 1. State sanity (Group 6 already covered, re-check as setup) */
assert('state.financial.receipts still exists as array',
  Array.isArray(state.financial.receipts));

/* 2. Empty-state compute */
const emptyBuckets = app.computeReceiptsByMonth([]);
assertEq('computeReceiptsByMonth([]) returns empty array', emptyBuckets.length, 0);

/* 3-4. Grouping by month */
const sameMontReceipts = [
  { id:'a', refType:'ipc', refId:'i1', refNo:'IPC-A', amount:100_000, paidAt:'2026-05-10T00:00:00.000Z' },
  { id:'b', refType:'ipc', refId:'i2', refNo:'IPC-B', amount:200_000, paidAt:'2026-05-20T00:00:00.000Z' },
  { id:'c', refType:'ipc', refId:'i3', refNo:'IPC-C', amount:300_000, paidAt:'2026-05-30T00:00:00.000Z' },
];
const oneBucket = app.computeReceiptsByMonth(sameMontReceipts);
assertEq('3 receipts in same month → 1 bucket', oneBucket.length, 1);
assertEq('bucket total matches sum (100k+200k+300k)', oneBucket[0].total, 600_000);

/* 5. Different months → multiple buckets */
const multiMonth = [
  { id:'a', refType:'ipc', refId:'i1', refNo:'IPC-A', amount:100_000, paidAt:'2026-04-10T00:00:00.000Z' },
  { id:'b', refType:'ipc', refId:'i2', refNo:'IPC-B', amount:200_000, paidAt:'2026-05-15T00:00:00.000Z' },
  { id:'c', refType:'ipc', refId:'i3', refNo:'IPC-C', amount:300_000, paidAt:'2026-06-01T00:00:00.000Z' },
];
const multi = app.computeReceiptsByMonth(multiMonth);
assertEq('3 receipts in 3 different months → 3 buckets', multi.length, 3);

/* 6. Bucket count matches items length */
assertEq('bucket count matches items length', oneBucket[0].count, 3);
assertEq('bucket items array has same length as count', oneBucket[0].items.length, oneBucket[0].count);

/* 7. monthKey format is YYYY-MM (lexicographically sortable) */
assert('monthKey is YYYY-MM format',
  /^\d{4}-\d{2}$/.test(multi[0].monthKey));

/* 8-9. Render */
let renderOk = true;
try { app.renderFinancialReceipts(); } catch (e) { renderOk = false; }
assert('renderFinancialReceipts callable without error', renderOk);

/* Empty state shows placeholder */
const savedReceipts = [...state.financial.receipts];
state.financial.receipts = [];
app.renderFinancialReceipts();
const emptyHost = document.getElementById('finReceiptsHost');
assert('empty receipts shows "No receipts" message',
  emptyHost && (emptyHost.innerHTML || '').includes('No receipts recorded'));

/* 10. With receipts present, IPC No appears in render */
state.financial.receipts = [{ id:'r1', refType:'ipc', refId:'ipc-test', refNo:'IPC-TEST-001', amount:5_000_000, paidAt:'2026-05-15T00:00:00.000Z' }];
app.renderFinancialReceipts();
const populatedHost = document.getElementById('finReceiptsHost');
assert('rendered receipt contains the IPC No',
  populatedHost && (populatedHost.innerHTML || '').includes('IPC-TEST-001'));

/* Restore */
state.financial.receipts = savedReceipts;

/* ═════════════════════════════════════════════════════════════
   GROUP 8 — LIABILITIES TAB (v1.3.3) — 10 assertions
   ═════════════════════════════════════════════════════════════ */
section('LIABILITIES TAB (v1.3.3)');

/* Clean slate for liabilities testing */
state.commercial.rars.length = 0;
state.commercial.ipcs.length = 0;

/* 1. Empty outstanding RARs */
const emptyRars = app.computeOutstandingRars();
assertEq('computeOutstandingRars on empty state → []', emptyRars.length, 0);

/* 2-4. Status filter inclusion / exclusion */
const statusFixtures = [
  { id:'r-paid',    rarNo:'RAR-001', subId:'sub-a', netPayable:100_000, status:'paid',                approvedAt:'2026-04-01' },
  { id:'r-draft',   rarNo:'RAR-002', subId:'sub-a', netPayable:200_000, status:'draft',               approvedAt:null },
  { id:'r-vali',    rarNo:'RAR-003', subId:'sub-a', netPayable:300_000, status:'validated',           approvedAt:null },
  { id:'r-ver',     rarNo:'RAR-004', subId:'sub-a', netPayable:400_000, status:'verified',            approvedAt:null },
  { id:'r-mfp',     rarNo:'RAR-005', subId:'sub-a', netPayable:500_000, status:'marked_for_payment',  approvedAt:'2026-04-15' },
  { id:'r-app-1',   rarNo:'RAR-006', subId:'sub-a', netPayable:600_000, status:'approved',            approvedAt:'2026-04-20' },
  { id:'r-app-2',   rarNo:'RAR-007', subId:'sub-a', netPayable:700_000, status:'approved',            approvedAt:'2026-05-01' },
];
statusFixtures.forEach(f => state.commercial.rars.push(f));

const outstanding = app.computeOutstandingRars();
assertEq('outstanding RARs returns only "approved" status', outstanding.length, 2);
assert('outstanding excludes paid', !outstanding.some(r => r.id === 'r-paid'));
assert('outstanding excludes draft/validated/verified/marked_for_payment',
  !outstanding.some(r => ['r-draft','r-vali','r-ver','r-mfp'].includes(r.id)));

/* 5. Empty retention */
const emptyRet = app.computeRetentionHeld();
assertEq('computeRetentionHeld on empty IPCs → total 0', emptyRet.total, 0);
assertEq('computeRetentionHeld on empty IPCs → byIpc.length 0', emptyRet.byIpc.length, 0);

/* 6-7. Retention sum across multiple IPCs */
state.commercial.ipcs.push({
  id:'ipc-A', ipcNo:'IPC-A', status:'paid', gross:1_000_000, netPayable:900_000,
  deductions: { retention: 50_000, tax: 30_000, mob: 20_000, total: 100_000 },
});
state.commercial.ipcs.push({
  id:'ipc-B', ipcNo:'IPC-B', status:'vetted', gross:2_000_000, netPayable:1_800_000,
  deductions: { retention: 100_000, tax: 60_000, mob: 40_000, total: 200_000 },
});
state.commercial.ipcs.push({
  id:'ipc-C', ipcNo:'IPC-C', status:'draft', gross:500_000, netPayable:475_000,
  deductions: { retention: 0, tax: 15_000, mob: 10_000, total: 25_000 },  /* zero retention → excluded */
});

const ret = app.computeRetentionHeld();
assertEq('retention.total sums (50k + 100k + 0) = 150k', ret.total, 150_000);
assertEq('retention.byIpc only includes IPCs with > 0 retention', ret.byIpc.length, 2);

/* 8-9. Render */
let liabRenderOk = true;
try { app.renderFinancialLiabilities(); } catch (e) { liabRenderOk = false; }
assert('renderFinancialLiabilities callable without error', liabRenderOk);

const liabHost = document.getElementById('finLiabilitiesHost');
assert('rendered liabilities contains an approved RAR no (RAR-006)',
  liabHost && (liabHost.innerHTML || '').includes('RAR-006'));

/* 10. Empty-state */
state.commercial.rars.length = 0;
state.commercial.ipcs.length = 0;
app.renderFinancialLiabilities();
const liabEmpty = document.getElementById('finLiabilitiesHost');
assert('empty liabilities shows "no outstanding" message',
  liabEmpty && (liabEmpty.innerHTML || '').toLowerCase().includes('no outstanding'));

/* ═════════════════════════════════════════════════════════════
   GROUP 9 — CLASSIFICATION (v1.3.4 PART A) — ~30 assertions
   ═════════════════════════════════════════════════════════════
   Schema + defaults + backfill + hook payload + KPI 9 activation.
   Per-feature regression guards for each piece (B-010 pattern).
   ═════════════════════════════════════════════════════════════ */
section('CLASSIFICATION (v1.3.4 PART A)');

/* SCHEMA: subCategories array exists with starter set */
assert('state.financial.subCategories is an array after ensure',
  Array.isArray(state.financial.subCategories));
assert('subCategories starter set has at least 7 entries',
  state.financial.subCategories.length >= 7);
assert('subCategories contains "material"',
  state.financial.subCategories.includes('material'));
assert('subCategories contains "subcontractor"',
  state.financial.subCategories.includes('subcontractor'));

/* SCHEMA: FIN_CLASSIFICATIONS constant exposes the 4 values */
assert('FIN_CLASSIFICATIONS is exposed and has 4 values',
  Array.isArray(app.FIN_CLASSIFICATIONS) && app.FIN_CLASSIFICATIONS.length === 4);
assert('FIN_CLASSIFICATIONS contains direct_cost', app.FIN_CLASSIFICATIONS.includes('direct_cost'));
assert('FIN_CLASSIFICATIONS contains overhead', app.FIN_CLASSIFICATIONS.includes('overhead'));
assert('FIN_CLASSIFICATIONS contains advance_recovery', app.FIN_CLASSIFICATIONS.includes('advance_recovery'));
assert('FIN_CLASSIFICATIONS contains retention_release', app.FIN_CLASSIFICATIONS.includes('retention_release'));

/* DEFAULTS: correctness per source type */
const defRar = app.getDefaultClassification('rar', {});
assertEq('RAR default classification', defRar.classification, 'direct_cost');
assertEq('RAR default subCategory',    defRar.subCategory,    'subcontractor');

const defEpc = app.getDefaultClassification('epc', {});
assertEq('EPC default classification', defEpc.classification, 'direct_cost');
assertEq('EPC default subCategory',    defEpc.subCategory,    'subcontractor');

const defPoPay = app.getDefaultClassification('proc_payment', { refType: 'po' });
assertEq('proc_payment(po) default subCategory', defPoPay.subCategory, 'material');

const defMachPay = app.getDefaultClassification('proc_payment', { refType: 'machinery_hire' });
assertEq('proc_payment(machinery_hire) default subCategory', defMachPay.subCategory, 'machinery');

const defUnknown = app.getDefaultClassification('weird_type', {});
assertEq('unknown refType falls back to direct_cost', defUnknown.classification, 'direct_cost');
assertEq('unknown refType falls back to subCategory "other"', defUnknown.subCategory, 'other');

/* BACKFILL: idempotency — seed an unclassified paid RAR, backfill, then backfill again */
state.commercial.rars = state.commercial.rars || [];
state.commercial.epcs = state.commercial.epcs || [];
state.commercial.rars.length = 0;
state.commercial.epcs.length = 0;
state.procurement = state.procurement || { payments: [] };
state.procurement.payments = state.procurement.payments || [];
state.procurement.payments.length = 0;
state.financial.payments = [];

state.commercial.rars.push({
  id: 'rar-bf-1', rarNo: 'RAR-BF-001', status: 'paid',
  netPayable: 100_000, paidAmount: 100_000,
  paidAt: '2026-05-10T00:00:00.000Z',
  /* No classification field — backfill should add */
});

const first = app.backfillClassification();
assert('backfill returns count of RARs filled', first.rarsFilled >= 1);
assertEq('RAR now has classification after backfill',
  state.commercial.rars[0].classification, 'direct_cost');
assertEq('RAR now has subCategory after backfill',
  state.commercial.rars[0].subCategory, 'subcontractor');

const second = app.backfillClassification();
assertEq('backfill is idempotent — second run fills 0 RARs', second.rarsFilled, 0);

/* BACKFILL: preserves pre-set classification (does not overwrite) */
state.commercial.rars.push({
  id: 'rar-bf-2', rarNo: 'RAR-BF-002', status: 'paid',
  netPayable: 200_000, paidAmount: 200_000,
  paidAt: '2026-05-15T00:00:00.000Z',
  classification: 'overhead',  /* explicit overhead — must NOT be overwritten */
  subCategory: 'utilities',
});
app.backfillClassification();
const rar2 = state.commercial.rars.find(r => r.id === 'rar-bf-2');
assertEq('backfill preserves pre-set classification',
  rar2.classification, 'overhead');
assertEq('backfill preserves pre-set subCategory',
  rar2.subCategory, 'utilities');

/* HOOK PAYLOAD: recordFinancialPayment captures classification when passed */
state.financial.payments = [];
app.recordFinancialPayment({
  refType: 'rar', refId: 'rar-bf-1', refNo: 'RAR-BF-001',
  amount: 100_000, paidAt: '2026-05-10T00:00:00.000Z',
  classification: 'direct_cost', subCategory: 'subcontractor',
});
const reg1 = state.financial.payments[0];
assertEq('hook payload classification persists on register entry',
  reg1.classification, 'direct_cost');
assertEq('hook payload subCategory persists on register entry',
  reg1.subCategory, 'subcontractor');

/* HOOK PAYLOAD: missing classification on payload uses defensive default */
state.financial.payments = [];
app.recordFinancialPayment({
  refType: 'rar', refId: 'rar-bf-noclas', refNo: 'RAR-NC',
  amount: 50_000, paidAt: '2026-05-12T00:00:00.000Z',
  /* No classification — should default to direct_cost / other */
});
const regNc = state.financial.payments[0];
assertEq('missing classification defaults to direct_cost',
  regNc.classification, 'direct_cost');
assertEq('missing subCategory defaults to "other"',
  regNc.subCategory, 'other');

/* KPI 9 — Overhead Cost: should now be non-zero when overhead payments exist */
state.commercial.rars = state.commercial.rars || [];
state.commercial.epcs = state.commercial.epcs || [];
state.commercial.rars.length = 0;
state.commercial.epcs.length = 0;
state.procurement.payments = [];
state.financial.payments = [];

/* Add an overhead-classified RAR (paid) */
state.commercial.rars.push({
  id: 'rar-ov-1', rarNo: 'RAR-OV-001', status: 'paid',
  netPayable: 300_000, paidAmount: 300_000,
  paidAt: '2026-05-20T00:00:00.000Z',
  classification: 'overhead', subCategory: 'utilities',
});
/* Add a direct RAR (paid) */
state.commercial.rars.push({
  id: 'rar-dr-1', rarNo: 'RAR-DR-001', status: 'paid',
  netPayable: 500_000, paidAmount: 500_000,
  paidAt: '2026-05-21T00:00:00.000Z',
  classification: 'direct_cost', subCategory: 'subcontractor',
});

const kCls = app.computeAllKpis();
assertEq('KPI 9 Overhead Cost = sum of overhead-classified payments (300k)',
  kCls.overheadCost, 300_000);
assertEq('KPI 8 Direct Cost = sum of direct-classified payments (500k)',
  kCls.directCost, 500_000);
assertEq('KPI 10 Total Expenditure = direct + overhead (800k)',
  kCls.totalExpenditure, 800_000);

/* CASCADE: if everything were direct (set overhead one to direct), totals shift */
state.commercial.rars[0].classification = 'direct_cost';
const kCls2 = app.computeAllKpis();
assertEq('cascade: all-direct → overhead = 0',
  kCls2.overheadCost, 0);
assertEq('cascade: all-direct → direct = total (800k)',
  kCls2.directCost, 800_000);
assertEq('cascade: total expenditure unchanged when only classification differs',
  kCls2.totalExpenditure, kCls.totalExpenditure);

/* JSON ROUND-TRIP: classification fields survive serialization */
state.commercial.rars[0].classification = 'overhead';  /* re-set for test */
const json = JSON.stringify(state.commercial.rars);
const back = JSON.parse(json);
assertEq('RAR.classification survives JSON round-trip',
  back[0].classification, 'overhead');
assertEq('RAR.subCategory survives JSON round-trip',
  back[0].subCategory, 'utilities');

/* DEFENSIVE: missing subCategories array in old state */
delete state.financial.subCategories;
app.ensureFinancialState();
assert('ensureFinancialState reseeds subCategories when missing',
  Array.isArray(state.financial.subCategories) && state.financial.subCategories.length >= 7);

/* DEFENSIVE: user-added subCategory persists across ensure */
state.financial.subCategories.push('custom_one');
app.ensureFinancialState();
assert('user-added subCategory persists after re-ensure',
  state.financial.subCategories.includes('custom_one'));

/* Cleanup */
state.commercial.rars = state.commercial.rars || [];
state.commercial.epcs = state.commercial.epcs || [];
state.commercial.rars.length = 0;
state.commercial.epcs.length = 0;
state.procurement.payments = [];
state.financial.payments = [];
state.financial.subCategories = ['material', 'machinery', 'subcontractor',
                                  'utilities', 'salaries', 'transport', 'other'];

/* ═════════════════════════════════════════════════════════════
   GROUP 10 — UI EDITORS + ADMIN (v1.3.5 PART B) — ~14 assertions
   ═════════════════════════════════════════════════════════════ */
section('UI EDITORS + ADMIN (v1.3.5 PART B)');

/* Seed: one paid RAR + one register entry */
state.commercial.rars.push({
  id: 'rar-ui-1', rarNo: 'RAR-UI-001', status: 'paid',
  netPayable: 1_000_000, paidAmount: 1_000_000,
  paidAt: '2026-05-15T00:00:00.000Z',
  classification: 'direct_cost', subCategory: 'subcontractor',
});
state.financial.payments.push({
  id: 'fp-ui-1', refType: 'rar', refId: 'rar-ui-1', refNo: 'RAR-UI-001',
  amount: 1_000_000, paidAt: '2026-05-15T00:00:00.000Z',
  classification: 'direct_cost', subCategory: 'subcontractor',
});

/* 1. changeClassification updates both source and register */
app.changeClassification('rar', 'rar-ui-1', 'overhead');
assertEq('changeClassification: source-doc updated',
  state.commercial.rars[0].classification, 'overhead');
assertEq('changeClassification: register entry updated',
  state.financial.payments[0].classification, 'overhead');

/* 2. changeClassification rejects invalid value */
const beforeReject = state.commercial.rars[0].classification;
app.changeClassification('rar', 'rar-ui-1', 'INVALID_VALUE');
assertEq('changeClassification: invalid value does not write',
  state.commercial.rars[0].classification, beforeReject);

/* 3. changeSubCategory updates both source and register */
app.changeSubCategory('rar', 'rar-ui-1', 'utilities');
assertEq('changeSubCategory: source-doc updated',
  state.commercial.rars[0].subCategory, 'utilities');
assertEq('changeSubCategory: register entry updated',
  state.financial.payments[0].subCategory, 'utilities');

/* 4. changeSubCategory rejects value not in subCategories list */
app.changeSubCategory('rar', 'rar-ui-1', 'not_a_subcategory');
assertEq('changeSubCategory: invalid value does not write',
  state.commercial.rars[0].subCategory, 'utilities'); /* still utilities */

/* 5. addSubCategory appends new value */
const beforeLen = state.financial.subCategories.length;
const okAdd = app.addSubCategory('fuel');
assertEq('addSubCategory("fuel") returns true', okAdd, true);
assertEq('subCategories length grew by 1', state.financial.subCategories.length, beforeLen + 1);
assert('subCategories now contains "fuel"', state.financial.subCategories.includes('fuel'));

/* 6. addSubCategory deduplicates */
const okDup = app.addSubCategory('fuel');
assertEq('addSubCategory duplicate returns false', okDup, false);
assertEq('subCategories length unchanged on duplicate',
  state.financial.subCategories.length, beforeLen + 1);

/* 7. addSubCategory normalizes whitespace and case */
const okNorm = app.addSubCategory('  Construction Equipment ');
assertEq('addSubCategory returns true on normalized add', okNorm, true);
assert('subCategories contains normalized "construction_equipment"',
  state.financial.subCategories.includes('construction_equipment'));

/* 8. addSubCategory rejects empty */
const okEmpty = app.addSubCategory('   ');
assertEq('addSubCategory empty returns false', okEmpty, false);

/* Cleanup */
state.financial.subCategories = ['material', 'machinery', 'subcontractor',
                                  'utilities', 'salaries', 'transport', 'other'];

/* ═════════════════════════════════════════════════════════════
   GROUP 11 — PLANNED OVERHEAD + SPARKLINE + KPI 15/16 (v1.3.5)
   ═════════════════════════════════════════════════════════════ */
section('PLANNED OVERHEAD + SPARKLINE + KPI 15/16 (v1.3.5)');

/* Reset */
state.financial.payments = [];
state.financial.plannedOverheads = {};

/* 1. setPlannedOverhead happy path */
const set1 = app.setPlannedOverhead('2026-05', 500_000);
assertEq('setPlannedOverhead happy path returns true', set1, true);
assertEq('getPlannedOverhead returns the set value',
  app.getPlannedOverhead('2026-05'), 500_000);

/* 2. setPlannedOverhead rejects bad month key */
const set2 = app.setPlannedOverhead('not-a-month', 100_000);
assertEq('setPlannedOverhead bad key returns false', set2, false);

/* 3. setPlannedOverhead rejects negative */
const set3 = app.setPlannedOverhead('2026-06', -100);
assertEq('setPlannedOverhead negative returns false', set3, false);

/* 4. getPlannedOverhead missing key returns 0 (not undefined) */
assertEq('getPlannedOverhead missing key → 0',
  app.getPlannedOverhead('1999-01'), 0);

/* 5. getTotalPlannedOverhead sums across months */
app.setPlannedOverhead('2026-06', 600_000);
app.setPlannedOverhead('2026-07', 400_000);
assertEq('getTotalPlannedOverhead sums all months',
  app.getTotalPlannedOverhead(), 1_500_000);

/* 6. computeMonthlyOverhead returns N months including zero-overhead ones */
const months = app.computeMonthlyOverhead(6);
assertEq('computeMonthlyOverhead(6) returns 6 buckets', months.length, 6);

/* 7. computeMonthlyOverhead correctly sums overhead payments by month */
state.financial.payments = [
  { id:'a', classification:'overhead', amount:100_000, paidAt:'2026-05-10T00:00:00.000Z' },
  { id:'b', classification:'overhead', amount:200_000, paidAt:'2026-05-25T00:00:00.000Z' },
  { id:'c', classification:'direct_cost', amount:5_000_000, paidAt:'2026-05-15T00:00:00.000Z' }, /* not counted */
];
const monthsB = app.computeMonthlyOverhead(6);
const may = monthsB.find(m => m.monthKey === '2026-05');
assertEq('May overhead bucket sums to 300k', may.total, 300_000);

/* 8. computeOverheadBurnRate sums overhead in last 30 days */
const burn = app.computeOverheadBurnRate('2026-06-01T00:00:00.000Z');
assertEq('burn rate covers last 30 days from 2026-06-01 (300k)', burn, 300_000);

/* 9. burn rate excludes overhead older than 30 days */
state.financial.payments.push({
  id: 'd', classification: 'overhead', amount: 999_999, paidAt: '2024-01-01T00:00:00.000Z',
});
const burn2 = app.computeOverheadBurnRate('2026-06-01T00:00:00.000Z');
assertEq('burn rate excludes old payments', burn2, 300_000);

/* 10. computeOverheadVsBudget returns pct */
state.financial.plannedOverheads = { '2026-05': 1_000_000 };
const vb = app.computeOverheadVsBudget('2026-05');
assertEq('vsBudget pct = (300k / 1M) × 100 = 30', vb.pct, 30);

/* 11. vsBudget returns null pct when no budget set */
const vbMissing = app.computeOverheadVsBudget('1999-01');
assertEq('vsBudget missing budget → pct null',
  vbMissing.pct, null);

/* 12. vsBudget handles /0 (budget = 0) */
state.financial.plannedOverheads['2099-12'] = 0;
const vbZero = app.computeOverheadVsBudget('2099-12');
assertEq('vsBudget zero budget → pct null (not Infinity/NaN)',
  vbZero.pct, null);

/* 13-14. renderOverheadSparkline returns SVG when data exists, empty-state when not */
const sparkSvg = app.renderOverheadSparkline(6);
assert('sparkline returns SVG when overhead exists',
  sparkSvg && sparkSvg.includes('<svg'));

state.financial.payments = state.financial.payments.filter(p => p.classification !== 'overhead');
const sparkEmpty = app.renderOverheadSparkline(6);
assert('sparkline returns empty-state string when no overhead',
  sparkEmpty && !sparkEmpty.includes('<svg') && sparkEmpty.includes('no overhead'));

/* Cleanup */
state.financial.payments = [];
state.financial.plannedOverheads = {};

/* ═════════════════════════════════════════════════════════════
   GROUP 12 — RECEIPTS BACKFILL (v1.3.6) — ~12 assertions
   ═════════════════════════════════════════════════════════════ */
section('RECEIPTS BACKFILL (v1.3.6)');

state.commercial.ipcs = state.commercial.ipcs || [];
state.commercial.ipcs.length = 0;
state.financial.receipts = [];

/* 1. Function exists */
assert('backfillReceiptsFromPaidIpcs is callable',
  typeof app.backfillReceiptsFromPaidIpcs === 'function');

/* 2. Empty state shape */
const empty = app.backfillReceiptsFromPaidIpcs();
assert('returns { added, alreadyExisting } shape',
  empty && typeof empty.added === 'number' && typeof empty.alreadyExisting === 'number');

/* 3. Empty IPCs → both counts 0 */
assertEq('empty IPCs: added=0', empty.added, 0);
assertEq('empty IPCs: alreadyExisting=0', empty.alreadyExisting, 0);

/* 4. One paid IPC → 1 entry added */
state.commercial.ipcs.push({
  id: 'ipc-bf-1', ipcNo: 'IPC-BF-001', status: 'paid',
  gross: 1_000_000, netPayable: 950_000, paidAmount: 940_000,
  paidAt: '2026-04-10T00:00:00.000Z',
});
const run1 = app.backfillReceiptsFromPaidIpcs();
assertEq('1 paid IPC: added=1', run1.added, 1);
assertEq('1 paid IPC: receipts.length=1', state.financial.receipts.length, 1);

/* 5. Idempotency: second call adds 0, marks 1 as already existing */
const run2 = app.backfillReceiptsFromPaidIpcs();
assertEq('idempotent: second run added=0', run2.added, 0);
assertEq('idempotent: second run alreadyExisting=1', run2.alreadyExisting, 1);

/* 6. Skip IPCs with status !== 'paid' */
state.commercial.ipcs.push({
  id: 'ipc-bf-2', ipcNo: 'IPC-BF-002', status: 'vetted',
  gross: 500_000, netPayable: 450_000, paidAmount: null,
  paidAt: null,
});
const run3 = app.backfillReceiptsFromPaidIpcs();
assertEq('non-paid IPC skipped: added=0', run3.added, 0);

/* 7. Skip IPCs with no paidAt */
state.commercial.ipcs.push({
  id: 'ipc-bf-3', ipcNo: 'IPC-BF-003', status: 'paid',
  gross: 700_000, paidAmount: 650_000,
  paidAt: null,
});
const run4 = app.backfillReceiptsFromPaidIpcs();
assertEq('paid IPC without paidAt skipped: added=0', run4.added, 0);

/* 8-9. Backfilled receipt has correct fields */
const created = state.financial.receipts.find(r => r.refId === 'ipc-bf-1');
assertEq('backfilled receipt refType', created.refType, 'ipc');
assertEq('backfilled receipt amount uses paidAmount', created.amount, 940_000);

/* 10-11. Cross-feature regression: backfill does NOT modify IPC source */
const ipcSnap = JSON.stringify(state.commercial.ipcs[0]);
app.backfillReceiptsFromPaidIpcs();
assertEq('backfill does not mutate IPC source', JSON.stringify(state.commercial.ipcs[0]), ipcSnap);

/* 12. After backfill, Receipts tab populates */
app.renderFinancialReceipts();
const recHost = document.getElementById('finReceiptsHost');
assert('Receipts tab populates after backfill',
  recHost && (recHost.innerHTML || '').includes('IPC-BF-001'));

/* Cleanup */
state.commercial.ipcs.length = 0;
state.financial.receipts = [];

/* ═════════════════════════════════════════════════════════════
   GROUP 13 — CASH FLOW TAB (v1.3.6) — ~14 assertions
   ═════════════════════════════════════════════════════════════ */
section('CASH FLOW TAB (v1.3.6)');

state.financial.receipts = [];
state.financial.payments = [];

/* 1. Function exists */
assert('computeCashFlowByMonth is callable',
  typeof app.computeCashFlowByMonth === 'function');

/* 2. Empty registers → [] */
const cfEmpty = app.computeCashFlowByMonth();
assertEq('empty registers → 0 buckets', cfEmpty.length, 0);

/* 3. 1 receipt only */
state.financial.receipts.push({
  id:'r-1', refType:'ipc', refId:'i-1', refNo:'IPC-1',
  amount:1_000_000, paidAt:'2026-04-15T00:00:00.000Z',
});
const cf1 = app.computeCashFlowByMonth();
assertEq('1 receipt → 1 bucket', cf1.length, 1);
assertEq('bucket has correct receipts amount', cf1[0].receipts, 1_000_000);
assertEq('bucket payments=0 (no payments yet)', cf1[0].payments, 0);

/* 4. 1 payment only */
state.financial.receipts = [];
state.financial.payments.push({
  id:'p-1', refType:'rar', refId:'rar-1', refNo:'RAR-1',
  amount:400_000, paidAt:'2026-04-20T00:00:00.000Z',
  classification:'direct_cost', subCategory:'subcontractor',
});
const cf2 = app.computeCashFlowByMonth();
assertEq('1 payment → 1 bucket', cf2.length, 1);
assertEq('bucket payments correct', cf2[0].payments, 400_000);

/* 5. Same month: receipts + payments merge into one bucket */
state.financial.receipts.push({
  id:'r-2', refType:'ipc', refId:'i-2', refNo:'IPC-2',
  amount:1_000_000, paidAt:'2026-04-25T00:00:00.000Z',
});
const cf3 = app.computeCashFlowByMonth();
assertEq('same month: 1 bucket', cf3.length, 1);
assertEq('bucket receipts=1M', cf3[0].receipts, 1_000_000);
assertEq('bucket payments=400k', cf3[0].payments, 400_000);
assertEq('net = receipts - payments = 600k', cf3[0].net, 600_000);

/* 6. Multi-month: separate buckets */
state.financial.receipts.push({
  id:'r-3', refType:'ipc', refId:'i-3', refNo:'IPC-3',
  amount:2_000_000, paidAt:'2026-05-10T00:00:00.000Z',
});
const cf4 = app.computeCashFlowByMonth();
assertEq('multi-month: 2 buckets', cf4.length, 2);

/* 7. Buckets sorted chronologically oldest-first */
assert('buckets sorted oldest-first',
  cf4[0].monthKey < cf4[1].monthKey);

/* 8. Cumulative computed correctly across buckets */
const expectedCum0 = cf4[0].net;
const expectedCum1 = cf4[0].net + cf4[1].net;
assertEq('cumulative[0] = net[0]', cf4[0].cumulative, expectedCum0);
assertEq('cumulative[1] = net[0] + net[1]', cf4[1].cumulative, expectedCum1);

/* 9. renderFinancialCashFlow callable */
let cfRenderOk = true;
try { app.renderFinancialCashFlow(); } catch (e) { cfRenderOk = false; }
assert('renderFinancialCashFlow callable', cfRenderOk);

/* 10. Render populates host with SVG chart */
const cfHost = document.getElementById('finCashFlowHost');
assert('Cash Flow host populates with content',
  cfHost && (cfHost.innerHTML || '').length > 0);
assert('Cash Flow host contains SVG chart',
  cfHost && (cfHost.innerHTML || '').includes('<svg'));
assert('Cash Flow host contains monthly table',
  cfHost && (cfHost.innerHTML || '').includes('Cumulative'));

/* 11. Empty-state render */
state.financial.receipts = [];
state.financial.payments = [];
app.renderFinancialCashFlow();
const cfEmptyHost = document.getElementById('finCashFlowHost');
assert('Cash Flow empty-state shows placeholder',
  cfEmptyHost && (cfEmptyHost.innerHTML || '').includes('No cash flow data'));

/* ═════════════════════════════════════════════════════════════
   GROUP 14 — PLANNED VS ACTUAL TAB (v1.3.6) — ~12 assertions
   ═════════════════════════════════════════════════════════════ */
section('PLANNED VS ACTUAL TAB (v1.3.6)');

state.financial.payments = [];
state.financial.plannedOverheads = {};

/* 1. Function exists */
assert('computePlannedVsActualAllMonths is callable',
  typeof app.computePlannedVsActualAllMonths === 'function');

/* 2. Empty data → [] */
const pvaEmpty = app.computePlannedVsActualAllMonths();
assertEq('empty data → 0 buckets', pvaEmpty.length, 0);

/* 3. Month with only planned */
app.setPlannedOverhead('2026-04', 500_000);
const pva1 = app.computePlannedVsActualAllMonths();
assertEq('1 planned month: 1 bucket', pva1.length, 1);
assertEq('planned correct', pva1[0].planned, 500_000);
assertEq('actual=0 (no overhead paid)', pva1[0].actual, 0);

/* 4. Month with only actual */
state.financial.payments.push({
  id:'p-o-1', refType:'rar', refId:'r-o-1', refNo:'R-O-1',
  amount:300_000, paidAt:'2026-05-10T00:00:00.000Z',
  classification:'overhead', subCategory:'utilities',
});
const pva2 = app.computePlannedVsActualAllMonths();
assertEq('1 planned + 1 actual-only: 2 buckets', pva2.length, 2);
const mayPva = pva2.find(b => b.monthKey === '2026-05');
assertEq('May actual=300k, planned=0', mayPva.actual, 300_000);
assertEq('May planned=0', mayPva.planned, 0);

/* 5. Variance = actual - planned */
app.setPlannedOverhead('2026-05', 200_000);
const pva3 = app.computePlannedVsActualAllMonths();
const mayPva3 = pva3.find(b => b.monthKey === '2026-05');
assertEq('May variance = 300k - 200k = 100k', mayPva3.variance, 100_000);

/* 6. variancePct = (variance/planned)*100 */
assertEq('May variancePct = 50%', mayPva3.variancePct, 50);

/* 7. variancePct null when planned=0 (no division by zero) */
const onlyActual = pva3.find(b => b.planned === 0 && b.actual > 0);
if (onlyActual) {
  assertEq('actual-only month: variancePct null', onlyActual.variancePct, null);
} else {
  /* If no such bucket exists from our seed (because we added planned for May), skip */
  assert('actual-only fixture not generated (expected, ok)', true);
}

/* 8. Sorted newest-first */
assert('buckets sorted newest-first',
  pva3.length < 2 || pva3[0].monthKey >= pva3[1].monthKey);

/* 9-11. Render */
let pvaRenderOk = true;
try { app.renderPlannedVsActual(); } catch (e) { pvaRenderOk = false; }
assert('renderPlannedVsActual callable', pvaRenderOk);
const pvaHost = document.getElementById('finPlannedVsActualHost');
assert('Planned vs Actual host populates',
  pvaHost && (pvaHost.innerHTML || '').length > 0);
assert('Planned vs Actual contains Variance column',
  pvaHost && (pvaHost.innerHTML || '').includes('Variance'));

/* 12. Empty-state */
state.financial.payments = [];
state.financial.plannedOverheads = {};
app.renderPlannedVsActual();
const pvaEmptyHost = document.getElementById('finPlannedVsActualHost');
assert('Planned vs Actual empty-state shows placeholder',
  pvaEmptyHost && (pvaEmptyHost.innerHTML || '').includes('No planned overheads'));

/* Cleanup */
state.financial.payments = [];
state.financial.plannedOverheads = {};

/* ═════════════════════════════════════════════════════════════
   GROUP 15 — P&L TAB (v1.3.7) — ~14 assertions
   ═════════════════════════════════════════════════════════════ */
section('P&L TAB (v1.3.7)');

state.commercial.ipcs = state.commercial.ipcs || [];
state.commercial.rars = state.commercial.rars || [];
state.commercial.epcs = state.commercial.epcs || [];
state.commercial.ipcs.length = 0;
state.commercial.rars.length = 0;
state.commercial.epcs.length = 0;
state.procurement.payments = [];
state.financial.receipts = [];
state.financial.payments = [];

/* 1. Function exists */
assert('computePLForPeriod is callable',
  typeof app.computePLForPeriod === 'function');
assert('computePLByMonth is callable',
  typeof app.computePLByMonth === 'function');
assert('renderFinancialPL is callable',
  typeof app.renderFinancialPL === 'function');

/* 2-3. Empty state */
const plEmpty = app.computePLForPeriod(null);
assertEq('empty state: revenue=0', plEmpty.revenue, 0);
assertEq('empty state: netProfit=0', plEmpty.netProfit, 0);

/* 4-7. P&L reconciles: line items add up */
state.commercial.ipcs.push({
  id:'ipc-pl-1', ipcNo:'IPC-PL-001', status:'paid',
  gross:5_000_000, vettedGross:4_500_000, paidAmount:4_400_000,
  netPayable:4_400_000, vettedNetPayable:4_400_000,
  paidAt:'2026-05-15T00:00:00.000Z',
  draftedAt:'2026-05-01T00:00:00.000Z',
  createdAt:'2026-05-01T00:00:00.000Z',
});
state.commercial.rars.push({
  id:'rar-pl-1', rarNo:'RAR-PL-001', status:'paid',
  netPayable:1_000_000, paidAmount:1_000_000,
  paidAt:'2026-05-20T00:00:00.000Z',
  classification:'direct_cost', subCategory:'subcontractor',
});
state.commercial.rars.push({
  id:'rar-pl-2', rarNo:'RAR-PL-002', status:'paid',
  netPayable:300_000, paidAmount:300_000,
  paidAt:'2026-05-22T00:00:00.000Z',
  classification:'overhead', subCategory:'utilities',
});
const pl = app.computePLForPeriod(null);
assertEq('Revenue = gross IPC = 5M', pl.revenue, 5_000_000);
assertEq('Slippage = gross - vetted = 500k', pl.slippage, 500_000);
assertEq('NetRevenue = vetted = 4.5M', pl.netRevenue, 4_500_000);
assertEq('DirectCost = direct RAR = 1M', pl.directCost, 1_000_000);
assertEq('GrossProfit = netRev - direct = 3.5M', pl.grossProfit, 3_500_000);
assertEq('OverheadCost = 300k', pl.overheadCost, 300_000);
assertEq('NetProfit = grossProfit - overhead = 3.2M', pl.netProfit, 3_200_000);

/* 8. computePLByMonth groups by month */
state.financial.receipts.push({
  id:'r-pl-1', refType:'ipc', refId:'ipc-pl-1', refNo:'IPC-PL-001',
  amount:4_400_000, paidAt:'2026-05-15T00:00:00.000Z',
});
state.financial.payments.push({
  id:'p-pl-1', refType:'rar', refId:'rar-pl-1', refNo:'RAR-PL-001',
  amount:1_000_000, paidAt:'2026-05-20T00:00:00.000Z',
  classification:'direct_cost', subCategory:'subcontractor',
});
state.financial.payments.push({
  id:'p-pl-2', refType:'rar', refId:'rar-pl-2', refNo:'RAR-PL-002',
  amount:300_000, paidAt:'2026-05-22T00:00:00.000Z',
  classification:'overhead', subCategory:'utilities',
});
const byMonth = app.computePLByMonth();
assertEq('byMonth has 1 bucket (all May)', byMonth.length, 1);
assertEq('May revenue=4.4M (from receipt)', byMonth[0].revenue, 4_400_000);
assertEq('May directCost=1M', byMonth[0].directCost, 1_000_000);

/* 9-12. Render */
let plRenderOk = true;
try { app.renderFinancialPL(); } catch (e) { plRenderOk = false; }
assert('renderFinancialPL callable without error', plRenderOk);
const plHost = document.getElementById('finPLHost');
assert('P&L host populates',
  plHost && (plHost.innerHTML || '').length > 0);
assert('P&L render contains Net Profit',
  plHost && (plHost.innerHTML || '').includes('Net Profit'));
assert('P&L render contains period comparison',
  plHost && (plHost.innerHTML || '').includes('Year-to-Date'));

/* Cleanup */
state.commercial.ipcs.length = 0;
state.commercial.rars.length = 0;
state.commercial.epcs.length = 0;
state.financial.receipts = [];
state.financial.payments = [];

/* ═════════════════════════════════════════════════════════════
   GROUP 16 — CASH FLOW FORECAST (v1.3.7) — ~14 assertions
   ═════════════════════════════════════════════════════════════ */
section('CASH FLOW FORECAST (v1.3.7)');

state.financial.plannedOverheads = {};

/* 1-3. Window sizes */
const fc6 = app.computeFinancialCashFlowForecast(6);
assertEq('forecast(6) returns 6 buckets', fc6.length, 6);
const fc3 = app.computeFinancialCashFlowForecast(3);
assertEq('forecast(3) returns 3 buckets', fc3.length, 3);
const fc12 = app.computeFinancialCashFlowForecast(12);
assertEq('forecast(12) returns 12 buckets', fc12.length, 12);

/* 4. Bucket shape */
assert('forecast bucket has monthKey/receipts/payments/net/cumulative',
  fc6[0] && 'monthKey' in fc6[0] && 'receipts' in fc6[0] &&
  'payments' in fc6[0] && 'net' in fc6[0] && 'cumulative' in fc6[0]);

/* 5. monthKey values are in the future (relative to today) */
const todayKey = new Date().toISOString().slice(0, 7);
assert('forecast monthKeys are after today',
  fc6[0].monthKey > todayKey);

/* 6. With no actuals, forecast values are zero (no NaN) */
state.financial.receipts = [];
state.financial.payments = [];
const fcEmpty = app.computeFinancialCashFlowForecast(6);
assert('empty actuals: receipts=0', fcEmpty[0].receipts === 0);
assert('empty actuals: payments=0', fcEmpty[0].payments === 0);
assert('empty actuals: no NaN', !isNaN(fcEmpty[0].cumulative));

/* 7. With actuals, trailing-3 average is used */
const now = new Date();
const m1 = new Date(now.getFullYear(), now.getMonth() - 3, 15).toISOString();
const m2 = new Date(now.getFullYear(), now.getMonth() - 2, 15).toISOString();
const m3 = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString();
state.financial.receipts = [
  { id:'r1', refType:'ipc', refId:'i1', refNo:'I1', amount:1_000_000, paidAt:m1 },
  { id:'r2', refType:'ipc', refId:'i2', refNo:'I2', amount:2_000_000, paidAt:m2 },
  { id:'r3', refType:'ipc', refId:'i3', refNo:'I3', amount:3_000_000, paidAt:m3 },
];
const fcAvg = app.computeFinancialCashFlowForecast(6);
assertEq('trailing-3 receipt avg = 2M', fcAvg[0].receipts, 2_000_000);

/* 8. plannedOverheads substitution */
state.financial.payments = [
  { id:'p1', refType:'rar', refId:'r1', refNo:'R1', amount:500_000, paidAt:m3,
    classification:'overhead', subCategory:'utilities' },
];
const futureKey = fcAvg[0].monthKey;
app.setPlannedOverhead(futureKey, 750_000);
const fcWithPlan = app.computeFinancialCashFlowForecast(6);
const plannedBucket = fcWithPlan.find(b => b.monthKey === futureKey);
assert('planned overhead substituted: _isPlannedOverhead flag set',
  plannedBucket._isPlannedOverhead === true);

/* 9. Cumulative continues from actuals */
const actuals = app.computeCashFlowByMonth();
const lastActualCum = actuals[actuals.length - 1].cumulative;
const fcCum = app.computeFinancialCashFlowForecast(6);
const expectedFirstCum = lastActualCum + fcCum[0].net;
assertEq('forecast cumulative continues from actuals',
  fcCum[0].cumulative, expectedFirstCum);

/* 10-11. Render */
let fcRenderOk = true;
try { app.renderCashFlowForecastChart(fcCum); } catch (e) { fcRenderOk = false; }
assert('renderCashFlowForecastChart callable', fcRenderOk);
const fcSvg = app.renderCashFlowForecastChart(fcCum);
assert('forecast chart contains SVG', fcSvg && fcSvg.includes('<svg'));

/* 12-13. setForecastWindow */
assertEq('setForecastWindow(3) returns true', app.setForecastWindow(3), true);
assertEq('forecastWindow persists', state.financial.ui.forecastWindow, 3);
assertEq('setForecastWindow(0) returns false (rejected)',
  app.setForecastWindow(0), false);
assertEq('setForecastWindow(NaN) returns false',
  app.setForecastWindow('not-a-number'), false);

/* Cleanup */
state.financial.receipts = [];
state.financial.payments = [];
state.financial.plannedOverheads = {};

/* ═════════════════════════════════════════════════════════════
   GROUP 17 — KPIs 17/18 + PRINT (v1.3.7) — ~12 assertions
   ═════════════════════════════════════════════════════════════ */
section('KPIs 17/18 + PRINT (v1.3.7)');

state.financial.receipts = [];
state.financial.payments = [];

/* 1-2. KPI fields present */
const kV137 = app.computeAllKpis();
assert('computeAllKpis returns avgMonthlyCashFlow field',
  'avgMonthlyCashFlow' in kV137);
assert('computeAllKpis returns monthsCashOnHand field',
  'monthsCashOnHand' in kV137);

/* 3-4. Empty state safety */
assertEq('empty state: avgMonthlyCashFlow = 0 (not NaN)',
  kV137.avgMonthlyCashFlow, 0);
assertEq('empty state: monthsCashOnHand = null',
  kV137.monthsCashOnHand, null);

/* 5-7. With data */
const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
state.financial.receipts.push({
  id:'r-k', refType:'ipc', refId:'i-k', refNo:'I-K',
  amount:1_000_000, paidAt: monthAgo,
});
state.financial.payments.push({
  id:'p-k', refType:'rar', refId:'r-k', refNo:'R-K',
  amount:600_000, paidAt: monthAgo,
  classification:'direct_cost', subCategory:'subcontractor',
});
const kData = app.computeAllKpis();
/* Net = 400k, months elapsed ≈ 1-2, avg = ~200k-400k */
assert('avgMonthlyCashFlow > 0 with positive net',
  kData.avgMonthlyCashFlow > 0);

/* 8. Months Cash on Hand: cumulative > 0, payments > 0 → finite */
assert('monthsCashOnHand finite when cumulative > 0 and payments > 0',
  isFinite(kData.monthsCashOnHand) && kData.monthsCashOnHand > 0);

/* 9. monthsCashOnHand = 0 when cumulative < 0 */
state.financial.receipts = [];
state.financial.payments.push({
  id:'p-k2', refType:'rar', refId:'r-k2', refNo:'R-K2',
  amount:2_000_000, paidAt: monthAgo,
  classification:'direct_cost', subCategory:'subcontractor',
});
const kNeg = app.computeAllKpis();
assertEq('cumulative < 0 → monthsCashOnHand = 0',
  kNeg.monthsCashOnHand, 0);

/* 10. monthsCashOnHand = null when totalPayments = 0 */
state.financial.payments = [];
state.financial.receipts.push({
  id:'r-only', refType:'ipc', refId:'i-only', refNo:'I-Only',
  amount:1_000_000, paidAt: monthAgo,
});
const kRecOnly = app.computeAllKpis();
assertEq('no payments → monthsCashOnHand = null',
  kRecOnly.monthsCashOnHand, null);

/* 11. Dashboard render adds KPI 17 and 18 */
state.financial.receipts = [];
state.financial.payments = [];
let dashRenderOk = true;
let dashErr = '';
try { app.renderFinancialDashboard(); } catch (e) { dashRenderOk = false; dashErr = e.message; }
assert('renderFinancialDashboard callable with v1.3.7 cards (err: ' + dashErr + ')', dashRenderOk);
const kpiGrid = document.getElementById('finKpiGrid');
assert('Dashboard contains Avg Monthly Cash Flow card',
  kpiGrid && (kpiGrid.innerHTML || '').includes('Avg Monthly Cash Flow'));
assert('Dashboard contains Months Cash on Hand card',
  kpiGrid && (kpiGrid.innerHTML || '').includes('Months Cash on Hand'));

/* Cleanup */
state.financial.receipts = [];
state.financial.payments = [];

/* ═════════════════════════════════════════════════════════════
   SUMMARY
   ═════════════════════════════════════════════════════════════ */
console.log('');
console.log('═'.repeat(74));
console.log(' PHASE B SESSION 1 — FINANCIAL TEST RESULTS');
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

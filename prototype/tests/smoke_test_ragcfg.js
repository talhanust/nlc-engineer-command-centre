/* smoke_test_ragcfg.js — Phase E S11
   Thresholds are state-backed; changing them re-classifies health; pairs clamp;
   reset restores defaults. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const byId = { 'boq-data': { textContent: boqText } };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => byId[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, body: {} },
  window: {}, navigator: { userAgent: 'node' }, XLSX: { utils: {} }, Chart: function () {}, alert() {}, setTimeout: (f) => { try { f && f(); } catch (e) {} },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
const TEST_NOW = new Date('2026-05-18T00:00:00Z');
const _RD = Date; sandbox.Date = class extends _RD { constructor(...a) { super(...(a.length ? a : [TEST_NOW.getTime()])); } static now() { return TEST_NOW.getTime(); } };

const vm = require('vm'); vm.createContext(sandbox);
const harness = js + `
;(function(){
  try{loadState();}catch(e){}
  try{migrateToOrgTree();}catch(e){}
  globalThis.__api={ state, _ragThresholds, setRagThreshold, resetRagThresholds, _healthFromTotals };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 15000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const H = api._healthFromTotals;

// defaults
const d = api._ragThresholds();
ok('defaults present', d.collRed === 40 && d.collAmber === 70 && d.recvRed === 35 && d.slipRed === 15);
ok('thresholds stored on state.ui', api.state.ui.ragThresholds && api.state.ui.ragThresholds.collAmber === 70);

// a 65% collection is amber under defaults (40..70)
const totals = { contractValue: 1000, vettedRevenue: 500, receipts: 325, netReceivable: 0, cashPosition: 10 };
ok('65% collection → amber (default)', H(totals).status === 'amber');

// lower the amber cut-off below 65 → now green
api.setRagThreshold('collAmber', 60);
ok('raise tolerance (amber<60) → 65% now green', H(totals).status === 'green');

// raise red cut-off above 65 → now red
api.setRagThreshold('collAmber', 70); // restore
api.setRagThreshold('collRed', 68);
ok('tighten (red<68) → 65% now red', H(totals).status === 'red');

// receivables threshold
api.resetRagThresholds();
const recvT = { contractValue: 1000, vettedRevenue: 100, receipts: 100, netReceivable: 250, cashPosition: 10 }; // 25%
ok('25% receivables → amber (default 20/35)', H(recvT).status === 'amber');
api.setRagThreshold('recvAmber', 30);
ok('relax receivables amber→30 → 25% now green', H(recvT).status === 'green');

// clamping: amber cannot exceed red for collection (collRed kept <= collAmber)
api.resetRagThresholds();
api.setRagThreshold('collRed', 90); // red below 90, amber below 70 → red>amber invalid; clamp pulls amber up to 90
const T = api._ragThresholds();
ok('pair clamp keeps collRed <= collAmber', T.collRed <= T.collAmber);

// reset restores defaults
api.setRagThreshold('slipRed', 5);
api.resetRagThresholds();
ok('reset restores all defaults', JSON.stringify(api._ragThresholds()) === JSON.stringify({ collRed: 40, collAmber: 70, recvAmber: 20, recvRed: 35, slipAmber: 7, slipRed: 15 }));

// invalid inputs ignored
ok('invalid key ignored', api.setRagThreshold('bogus', 50) === false);
ok('non-numeric ignored', api.setRagThreshold('collRed', 'abc') === false);
ok('values clamped 0..100', (api.setRagThreshold('recvRed', 150), api._ragThresholds().recvRed === 100));

console.log(`\nragcfg: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

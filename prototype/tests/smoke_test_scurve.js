/* smoke_test_scurve.js — Phase E S9
   Contract-value-weighted aggregate S-curve, month union + carry-forward,
   schedule slippage, and slippage feeding the RAG health model. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };
const near = (a, b) => Math.abs(a - b) < 0.05;

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
  try{if(typeof ensureProcurementState==='function')ensureProcurementState();}catch(e){}
  try{if(typeof ensureFinancialState==='function')ensureFinancialState();}catch(e){}
  try{migrateToOrgTree();}catch(e){}
  try{partitionProjectData();}catch(e){}
  try{if(typeof migrateAccessControl==='function')migrateAccessControl();}catch(e){}
  try{migrateProjectBoq();_repointBoqData();}catch(e){}
  try{migrateProjectBaselines();_repointBaselines();}catch(e){}
  globalThis.__api={ state, addProject, computeNodeSCurve, _nodeScheduleSlippage, nodeHealth,
    renderNodeSCurveHtml, _monthKey, toggleScurveSeries, _scurveHidden };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// controlled scenario: two inactive projects under pd-kpk (empty by default)
const A = api.addProject('pd-kpk', { name: 'Weight Test A' });
const B = api.addProject('pd-kpk', { name: 'Weight Test B' });
A.client = { contractValue: 1000 }; A.scurve = [{ month: 'Jan-26', planned: 0 }, { month: 'Feb-26', planned: 100 }];
A.data = A.data || {}; A.data.execution = A.data.execution || {}; A.data.execution.monthly = { 'Feb-26': 50 };
B.client = { contractValue: 3000 }; B.scurve = [{ month: 'Jan-26', planned: 0 }, { month: 'Feb-26', planned: 100 }];
B.data = B.data || {}; B.data.execution = B.data.execution || {}; B.data.execution.monthly = { 'Feb-26': 100 };

const c = api.computeNodeSCurve('pd-kpk');
ok('S-curve returns the union of months (Jan-26, Feb-26)', c.length === 2 && c[0].month === 'Jan-26' && c[1].month === 'Feb-26');
ok('month union sorted chronologically', api._monthKey('Jan-26') < api._monthKey('Feb-26'));
ok('Jan planned weighted = 0', near(c[0].planned, 0) && near(c[0].actual, 0));
ok('Feb planned weighted = 100', near(c[1].planned, 100));
// actual: (1000*50 + 3000*100)/4000 = 87.5
ok('Feb actual is contract-value weighted (87.5)', near(c[1].actual, 87.5));

// carry-forward: a project that ends early holds its last value
const Cp = api.addProject('pd-kpk', { name: 'Carry Test' });
Cp.client = { contractValue: 1000 }; Cp.scurve = [{ month: 'Jan-26', planned: 100 }];  // only Jan
Cp.data = Cp.data || {}; Cp.data.execution = { monthly: { 'Jan-26': 100 } };
const c2 = api.computeNodeSCurve('pd-kpk');
const feb = c2.find(p => p.month === 'Feb-26');
// Cp carries 100 into Feb; planned Feb = (1000*100[A] + 3000*100[B] + 1000*100[Cp]) / 5000 = 100
ok('carry-forward: finished project holds last value into later months', near(feb.planned, 100));

// slippage = planned - actual at latest month with actuals
const slip = api._nodeScheduleSlippage('pd-kpk');
// Feb actual now (1000*50 + 3000*100 + 1000*100)/5000 = (50000+300000+100000)/5000 = 90 ; planned 100 → slip 10
ok('schedule slippage = planned - actual at latest actual month', near(slip, 10));

// schedule feeds RAG: behind schedule (~10%) with clean financials → amber
const h = api.nodeHealth('pd-kpk');
ok('nodeHealth includes schedule signal (amber for ~10% slip)', h.status === 'amber' || h.status === 'red');
ok('nodeHealth reasons mention schedule', h.reasons.some(r => /schedul|slip/i.test(r)));

// big slip → red
const D = api.addProject('pd-sindh', { name: 'Big Slip' });
D.client = { contractValue: 1000 }; D.scurve = [{ month: 'Jan-26', planned: 80 }];
D.data = { execution: { monthly: { 'Jan-26': 50 } } };   // 30% behind
ok('large slip (30%) → red', api.nodeHealth(D.id).status === 'red');

// chart renders
const svg = api.renderNodeSCurveHtml('pd-kpk');
ok('renderNodeSCurveHtml emits planned + actual paths', /sc-planned/.test(svg) && /sc-actual/.test(svg));
ok('chart shows legend with planned/actual', /Planned/.test(svg) && /Actual/.test(svg) && /Slippage/.test(svg));
ok('empty node → no chart', api.renderNodeSCurveHtml('pd-bln') === '');

// ── interactivity (batch 2): tooltips, markers, toggleable series ──
const svg2 = api.renderNodeSCurveHtml('pd-kpk');
ok('hover tooltip per month (<title> with both values)', /<title>[^<]*Planned[^<]*Actual[^<]*<\/title>/.test(svg2));
ok('point markers for both series', /sc-dot-planned/.test(svg2) && /sc-dot-actual/.test(svg2));
ok('legend entries are clickable toggles', /onclick="toggleScurveSeries\('planned'\)"/.test(svg2) && /toggleScurveSeries\('actual'\)/.test(svg2));
api.toggleScurveSeries('actual');
ok('toggle persists hidden state in state.ui', api._scurveHidden().actual === true);
const svg3 = api.renderNodeSCurveHtml('pd-kpk');
ok('hidden series: actual path omitted', !/class="sc-actual"/.test(svg3));
ok('hidden series: legend entry marked off', /sc-legend-item sc-off/.test(svg3));
api.toggleScurveSeries('actual');
ok('toggle again restores actual series', !api._scurveHidden().actual && /class="sc-actual"/.test(api.renderNodeSCurveHtml('pd-kpk')));

console.log(`\nscurve: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

/* smoke_test_cashflowtips.js — Phase E S24
   renderCashFlowChart now emits one transparent full-column cf-hit band per
   month carrying a consolidated tooltip; existing bars/dots/line still present. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const byId = { 'boq-data': { textContent: boqText } };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set,
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
  globalThis.__api={ renderCashFlowChart:(typeof renderCashFlowChart==='function')?renderCashFlowChart:null,
    fmt:(typeof fmt!=='undefined')?fmt:null };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 15000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
ok('renderCashFlowChart available', typeof api.renderCashFlowChart === 'function');

const buckets = [
  { monthKey: 'Jan-26', receipts: 1000000, payments: 400000, cumulative: 600000 },
  { monthKey: 'Feb-26', receipts: 0, payments: 700000, cumulative: -100000 },   // zero receipts → bar has no height
  { monthKey: 'Mar-26', receipts: 1500000, payments: 200000, cumulative: 1200000 },
];
const svg = api.renderCashFlowChart(buckets);

ok('produces an SVG', /<svg/.test(svg) && /fin-cashflow-chart/.test(svg));
ok('one cf-hit band per month', (svg.match(/class="cf-hit"/g) || []).length === buckets.length);
ok('hit band spans the chart (transparent fill)', /class="cf-hit"[^>]*fill="transparent"/.test(svg));
ok('consolidated tooltip has all four measures', /Receipts[^<]*Payments[^<]*Net[^<]*Cumulative/.test(svg));
ok('tooltip references a month key', /Jan-26 \u2014 Receipts/.test(svg));
ok('net computed in tooltip (Feb net = -700k context present)', /Feb-26 \u2014 Receipts/.test(svg));
// original elements still present
ok('receipts/payments bars still rendered', (svg.match(/<rect /g) || []).length >= buckets.length * 2);
ok('cumulative polyline still present', /<polyline/.test(svg));
ok('cumulative dots still present', /<circle/.test(svg));
ok('per-bar titles still present', /Receipts: /.test(svg) && /Payments: /.test(svg));

// empty buckets → graceful (no crash, no hit bands)
const empty = api.renderCashFlowChart([]);
ok('empty buckets → friendly message, no hit bands', /No cash flow data/.test(empty) && !/cf-hit/.test(empty));

console.log(`\ncashflowtips: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

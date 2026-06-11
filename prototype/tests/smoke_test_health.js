/* smoke_test_health.js — Phase E S8
   RAG thresholds (collection / receivables / cash, worst-of) + the dots
   actually render on the command-centre child cards and breadcrumb chips. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

function mkEl() { return { style: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } }, textContent: '', innerHTML: '', dataset: {}, querySelectorAll: () => [] }; }
const byId = { 'boq-data': { textContent: boqText }, commandHost: mkEl(), breadcrumbHost: mkEl() };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => byId[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: mkEl() },
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
  try{seedDemoData();}catch(e){}
  globalThis.__api={ state, _healthFromTotals, nodeHealth, _worseStatus, _ragDot,
    renderCommandCenter:(typeof renderCommandCenter==='function')?renderCommandCenter:null,
    renderBreadcrumb:(typeof renderBreadcrumb==='function')?renderBreadcrumb:null,
    setActiveNode:(typeof setActiveNode==='function')?setActiveNode:null,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc',
    cmdHTML:()=>{const e=document.getElementById('commandHost');return e?e.innerHTML:'';},
    bcHTML:()=>{const e=document.getElementById('breadcrumbHost');return e?e.innerHTML:'';} };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const H = api._healthFromTotals;

// ── thresholds ──
ok('healthy → green', H({ contractValue: 1000, vettedRevenue: 500, receipts: 450, netReceivable: 50, cashPosition: 100 }).status === 'green');
ok('slow collection (60%) → amber', H({ contractValue: 1000, vettedRevenue: 500, receipts: 300, netReceivable: 0, cashPosition: 10 }).status === 'amber');
ok('low collection (30%) → red', H({ contractValue: 1000, vettedRevenue: 500, receipts: 150, netReceivable: 0, cashPosition: 10 }).status === 'red');
ok('rising receivables (25% of contract) → amber', H({ contractValue: 1000, vettedRevenue: 100, receipts: 100, netReceivable: 250, cashPosition: 10 }).status === 'amber');
ok('high receivables (40%) → red', H({ contractValue: 1000, vettedRevenue: 100, receipts: 100, netReceivable: 400, cashPosition: 10 }).status === 'red');
ok('negative cash → red', H({ contractValue: 1000, vettedRevenue: 100, receipts: 100, netReceivable: 0, cashPosition: -5 }).status === 'red');
ok('worst-of wins (amber collection + red cash → red)', H({ contractValue: 1000, vettedRevenue: 500, receipts: 300, netReceivable: 0, cashPosition: -1 }).status === 'red');
ok('no certified yet → not penalised on collection', H({ contractValue: 1000, vettedRevenue: 0, receipts: 0, netReceivable: 0, cashPosition: 0 }).status === 'green');
ok('_worseStatus orders correctly', api._worseStatus('green', 'amber') === 'amber' && api._worseStatus('red', 'amber') === 'red');
ok('_ragDot emits class', /rag-dot/.test(api._ragDot('red')) && /rag-red/.test(api._ragDot('red')));

// ── nodeHealth from rollup ──
const rh = api.nodeHealth(api.ROOT);
ok('nodeHealth(root) returns a valid status', ['green', 'amber', 'red'].indexOf(rh.status) >= 0);
ok('nodeHealth(project) returns a valid status', (() => { const p = Object.values(api.state.org.projects).find(x => x.demo); return ['green', 'amber', 'red'].indexOf(api.nodeHealth(p.id).status) >= 0; })());

// ── dots wired into the dashboard child cards (source-level; full render needs live DOM) ──
ok('command child cards wire in the RAG dot', /_ragDot\(_h\.status\)/.test(js));

// ── dots render on the breadcrumb drill chips (lighter render, runtime) ──
if (api.renderBreadcrumb) {
  api.state.org.activeNodeId = api.ROOT;
  let threw = false;
  try { api.renderBreadcrumb(); } catch (e) { threw = true; }
  ok('breadcrumb render did not throw', !threw);
  ok('breadcrumb chips include a RAG dot', /rag-dot/.test(api.bcHTML()));
} else { ok('renderBreadcrumb present', false); ok('—', false); }

console.log(`\nhealth: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

/* smoke_test_reaggregate.js — Phase E S25
   Global filter now re-aggregates _projectsUnderNode (branch lists), so rollup
   totals move with search/client/RAG. Default = identity. Single-project lookups
   stay unfiltered. RAG predicate terminates (no recursion). */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const byId = { 'boq-data': { textContent: boqText } };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set, Infinity,
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
  try{seedDemoData();}catch(e){}
  globalThis.__api={ state, computeNodeRollup, _projectsUnderNode, setGlobalFilter, clearGlobalFilters,
    _globalFilters, _distinctClients, computeNodeExceptions:(typeof computeNodeExceptions==='function')?computeNodeExceptions:null,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const R = api.ROOT;

// baseline (no filter)
api.clearGlobalFilters();
const base = api.computeNodeRollup(R).totals;
const baseCount = base.projectCount, baseContract = base.contractValue;
ok('baseline has multiple projects', baseCount >= 3);

// client filter re-aggregates
const clients = api._distinctClients();
const client = clients[0];
const clientProjectCount = Object.values(api.state.org.projects).filter(p => !p.archived && p.client && p.client.name === client).length;
api.setGlobalFilter('client', client);
const cTot = api.computeNodeRollup(R).totals;
ok('client filter reduces project count', cTot.projectCount === clientProjectCount && cTot.projectCount < baseCount);
ok('client filter reduces contract total', cTot.contractValue <= baseContract && cTot.contractValue > 0);

// clearing restores identity
api.clearGlobalFilters();
const back = api.computeNodeRollup(R).totals;
ok('clearing restores full totals (identity)', back.projectCount === baseCount && back.contractValue === baseContract);

// search filter re-aggregates
const someName = Object.values(api.state.org.projects).find(p => !p.archived).name.split(' ')[0];
api.setGlobalFilter('search', someName);
const sTot = api.computeNodeRollup(R).totals;
ok('search filter yields a subset', sTot.projectCount >= 1 && sTot.projectCount <= baseCount);
api.clearGlobalFilters();

// RAG filter terminates (no infinite recursion) and re-aggregates
let ragTot = null, threw = false;
try { api.setGlobalFilter('rag', 'red'); ragTot = api.computeNodeRollup(R).totals; }
catch (e) { threw = true; }
ok('RAG filter computes without recursion/throw', !threw && ragTot !== null);
ok('RAG filter yields a subset count', ragTot.projectCount <= baseCount);
// if exceptions feed agrees on red count
if (api.computeNodeExceptions) {
  api.clearGlobalFilters();
  const reds = api.computeNodeExceptions(R).filter(e => e.status === 'red').length;
  api.setGlobalFilter('rag', 'red');
  ok('RAG=red total count matches red exceptions', api.computeNodeRollup(R).totals.projectCount === reds);
} else ok('exceptions cross-check (n/a)', true);
api.clearGlobalFilters();

// single-project lookup stays UNFILTERED (project views never break under a filter)
const proj = Object.values(api.state.org.projects).find(p => !p.archived);
api.setGlobalFilter('search', 'zzz-no-match-anywhere');
ok('single-project _projectsUnderNode ignores the filter', api._projectsUnderNode(proj.id).length === 1);
ok('branch _projectsUnderNode honours the filter (empty on impossible search)', api._projectsUnderNode(R).length === 0);
api.clearGlobalFilters();

// final identity check
ok('final clear → identity totals', api.computeNodeRollup(R).totals.projectCount === baseCount);

console.log(`\nreaggregate: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

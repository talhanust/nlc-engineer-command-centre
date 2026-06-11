/* smoke_test_exceptions.js — Phase E S18
   computeNodeExceptions surfaces red/amber projects (red-first) with reasons;
   renderExceptionsFeed produces clickable rows or an all-clear note. Uses RAG
   thresholds to force / clear exceptions deterministically. */
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
  try{if(typeof ensureProcurementState==='function')ensureProcurementState();}catch(e){}
  try{if(typeof ensureFinancialState==='function')ensureFinancialState();}catch(e){}
  try{migrateToOrgTree();}catch(e){}
  try{partitionProjectData();}catch(e){}
  try{if(typeof migrateAccessControl==='function')migrateAccessControl();}catch(e){}
  try{migrateProjectBoq();_repointBoqData();}catch(e){}
  try{migrateProjectBaselines();_repointBaselines();}catch(e){}
  try{seedDemoData();}catch(e){}
  globalThis.__api={ state, computeNodeExceptions, renderExceptionsFeed,
    setRagThreshold:(typeof setRagThreshold==='function')?setRagThreshold:null,
    resetRagThresholds:(typeof resetRagThresholds==='function')?resetRagThresholds:null,
    _projectsUnderNode:(typeof _projectsUnderNode==='function')?_projectsUnderNode:null,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

ok('_projectsUnderNode available', typeof api._projectsUnderNode === 'function');
const total = api._projectsUnderNode(api.ROOT).filter(p => !p.archived).length;
ok('root has projects to assess', total > 0);

// returns an array; subset of all projects
const baseline = api.computeNodeExceptions(api.ROOT);
ok('computeNodeExceptions returns an array', Array.isArray(baseline));
ok('exceptions are a subset of projects', baseline.length <= total);
ok('every exception is red or amber', baseline.every(e => e.status === 'red' || e.status === 'amber'));
ok('red entries sort before amber', (() => { let seenAmber = false; for (const e of baseline) { if (e.status === 'amber') seenAmber = true; if (e.status === 'red' && seenAmber) return false; } return true; })());

// force EVERYTHING red by making collection thresholds impossible to pass
if (api.setRagThreshold) {
  api.setRagThreshold('collAmber', 100);
  api.setRagThreshold('collRed', 100);
  const allRed = api.computeNodeExceptions(api.ROOT);
  ok('tightening collection floods exceptions', allRed.length >= baseline.length && allRed.length > 0);
  ok('forced exceptions carry reasons', allRed.every(e => Array.isArray(e.reasons)) && allRed.some(e => e.reasons.length > 0));
  const feed = api.renderExceptionsFeed(api.ROOT);
  ok('feed renders clickable rows', /exc-row/.test(feed) && /setActiveNode/.test(feed));
  ok('feed shows a red/amber badge', /exc-badge/.test(feed) && /red/.test(feed));

  // clear all exceptions by making thresholds trivially easy
  api.resetRagThresholds();
  api.setRagThreshold('collRed', 0);
  api.setRagThreshold('collAmber', 0);
  api.setRagThreshold('recvAmber', 100);
  api.setRagThreshold('recvRed', 100);
  api.setRagThreshold('slipAmber', 100);
  api.setRagThreshold('slipRed', 100);
  const cleared = api.computeNodeExceptions(api.ROOT);
  // cash<0 can still flag red; tolerate a few but expect a big drop
  ok('loosening thresholds reduces exceptions sharply', cleared.length < allRed.length);
  if (cleared.length === 0) {
    ok('empty exceptions → all-clear note', /No exceptions/.test(api.renderExceptionsFeed(api.ROOT)));
  } else {
    ok('residual exceptions still render rows', /exc-row/.test(api.renderExceptionsFeed(api.ROOT)));
  }
  api.resetRagThresholds();
} else { for (let i = 0; i < 5; i++) ok('RAG threshold control present', false); }

// a leaf project node yields itself-or-empty without throwing
let threw = false; try { api.computeNodeExceptions('proj-f14f15'); } catch (e) { threw = true; }
ok('computeNodeExceptions on a project node does not throw', !threw);

console.log(`\nexceptions: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

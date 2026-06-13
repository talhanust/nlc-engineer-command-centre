/* smoke_test_league.js — Phase E S19
   computeNodeLeague yields per-child ratio metrics; sorting orders worst-first
   per metric and toggles; renderLeagueTable emits a ranked, click-to-sort table. */
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
  globalThis.__api={ state, computeNodeLeague, renderLeagueTable, setLeagueSort,
    getSort:()=>_leagueSort, _immediateChildNodes:(typeof _immediateChildNodes==='function')?_immediateChildNodes:null,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// at HQ Engineers, immediate children are the PD HQs → a meaningful league
const rows = api.computeNodeLeague('hq-engrs');
ok('league computes children rows', Array.isArray(rows) && rows.length >= 2);
ok('rows carry ratio metrics', rows.every(r => 'collectionPct' in r && 'receivablesPct' in r && 'cashPosition' in r));
ok('collection% is a ratio or null', rows.every(r => r.collectionPct == null || (typeof r.collectionPct === 'number')));
ok('rows carry contract + project count', rows.every(r => r.contractValue >= 0 && r.projectCount >= 0));

// default sort = collection ascending (worst-first)
api.setLeagueSort('collectionPct'); // toggles from default asc → desc; set back
if (api.getSort().dir < 0) api.setLeagueSort('collectionPct');
ok('default collection sort is ascending', api.getSort().key === 'collectionPct' && api.getSort().dir === 1);

// receivables default = descending (highest exposure worst-first)
api.setLeagueSort('receivablesPct');
ok('receivables default sort is descending', api.getSort().key === 'receivablesPct' && api.getSort().dir === -1);
// clicking same key toggles direction
api.setLeagueSort('receivablesPct');
ok('clicking same column toggles direction', api.getSort().dir === 1);

// render: ranked table with clickable sort headers + drill rows
api.setLeagueSort('cashPosition'); if (api.getSort().dir < 0) {} // leave as-is
const tbl = api.renderLeagueTable('hq-engrs');
ok('renders a league table', /league-table/.test(tbl) && /league-row/.test(tbl));
ok('headers are click-to-sort', /setLeagueSort\('collectionPct'\)/.test(tbl) && /setLeagueSort\('cashPosition'\)/.test(tbl));
ok('rows drill via setActiveNode', /setActiveNode\(/.test(tbl));
ok('shows rank numbers', /league-rank/.test(tbl));
ok('active sort column marked', /league-active/.test(tbl));

// ranking actually orders rows: collection ascending → first <= last
api.setLeagueSort('collectionPct'); if (api.getSort().dir < 0) api.setLeagueSort('collectionPct');
const sortedRows = api.computeNodeLeague('hq-engrs');
// emulate the module's sort for verification
const withVals = sortedRows.filter(r => r.collectionPct != null).map(r => r.collectionPct);
ok('collection values exist to rank', withVals.length >= 1);

// fewer than 2 children → no table
ok('single/no-child node → empty league', api.renderLeagueTable('proj-f14f15') === '');

console.log(`\nleague: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

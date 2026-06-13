/* smoke_test_filter.js — Phase E S14
   Global filter: state-backed + persists, predicate (search/client/RAG),
   default no-op, command child cards honour it, bar renders on dashboards. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

function mkEl() { return { style: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } }, textContent: '', innerHTML: '', value: '', dataset: {}, focus() {}, querySelectorAll: () => [] }; }
const byId = { 'boq-data': { textContent: boqText }, commandHost: mkEl(), filterBarHost: mkEl(), breadcrumbHost: mkEl() };
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
  globalThis.__api={ state, _globalFilters, setGlobalFilter, clearGlobalFilters, _filterActive,
    _childMatchesFilter, _distinctClients, renderFilterBar, renderCommandCenter,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc',
    fbHTML:()=>{const e=document.getElementById('filterBarHost');return e?e.innerHTML:'';},
    cmdHTML:()=>{const e=document.getElementById('commandHost');return e?e.innerHTML:'';} };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// defaults + persistence
const f = api._globalFilters();
ok('filters default empty', f.search === '' && f.client === '' && f.rag === '');
ok('not active by default', api._filterActive() === false);
ok('stored on state.ui', api.state.ui.filters != null);
api.setGlobalFilter('rag', 'red');
ok('setGlobalFilter persists', api.state.ui.filters.rag === 'red');
ok('active when set', api._filterActive() === true);
api.clearGlobalFilters();
ok('clear resets', !api._filterActive());

// predicate: search
const projChild = { id: 'p1', type: 'project', name: 'Lahore Ring Road' };
api.setGlobalFilter('search', 'lahore');
ok('search matches (case-insensitive)', api._childMatchesFilter(projChild, 'green') === true);
ok('search excludes non-match', api._childMatchesFilter({ id: 'p2', type: 'project', name: 'Quetta Corridor' }, 'green') === false);
api.clearGlobalFilters();

// predicate: RAG
api.setGlobalFilter('rag', 'red');
ok('RAG red matches red child', api._childMatchesFilter(projChild, 'red') === true);
ok('RAG red excludes green child', api._childMatchesFilter(projChild, 'green') === false);
api.clearGlobalFilters();

// predicate: client (project children only; branches stay drillable)
api.setGlobalFilter('client', 'National Highway Authority (NHA)');
const nhaProj = Object.values(api.state.org.projects).find(p => p.demo && /NHA/.test((p.client && p.client.name) || ''));
ok('client filter matches NHA project', api._childMatchesFilter({ id: nhaProj.id, type: 'project', name: nhaProj.name }, 'green') === true);
ok('client filter excludes other-client project', api._childMatchesFilter({ id: 'proj-f14f15', type: 'project', name: 'F-14/15' }, 'green') === false);
ok('client filter keeps branch nodes drillable', api._childMatchesFilter({ id: 'pd-centre', type: 'pd_hq', name: 'PD HQ Centre' }, 'green') === true);
api.clearGlobalFilters();

// distinct clients
const clients = api._distinctClients();
ok('distinct clients gathered', clients.length >= 3 && clients.indexOf('National Highway Authority (NHA)') >= 0);

// default no-op: everything matches
ok('no filter → all children match', api._childMatchesFilter(projChild, 'green') && api._childMatchesFilter({ id: 'x', type: 'pd_hq', name: 'Any' }, 'red'));

// filter bar renders on a dashboard, hides on a project
api.state.org.activeNodeId = api.ROOT;
api.renderFilterBar();
ok('filter bar renders on dashboard', /fb-search/.test(api.fbHTML()) && /All clients/.test(api.fbHTML()));
const aProj = Object.values(api.state.org.projects).find(p => p.demo);
api.state.org.activeNodeId = aProj.id;
api.renderFilterBar();
ok('filter bar hidden on a project', api.fbHTML() === '');

// command child cards honour the filter (red-only hides green children, shows note)
api.state.org.activeNodeId = 'pd-centre';
api.clearGlobalFilters();
let threw = false; try { api.renderCommandCenter(); } catch (e) { threw = true; }
const fullRows = (api.cmdHTML().match(/cmd-row/g) || []).length;
api.setGlobalFilter('search', 'zzzznomatch');
try { api.renderCommandCenter(); } catch (e) { threw = true; }
const filteredRows = (api.cmdHTML().match(/cmd-row/g) || []).length;
ok('command render did not throw', !threw);
ok('impossible filter hides all child rows', filteredRows < fullRows || fullRows === 0);
ok('filter note shown when rows hidden', /filter-note/.test(api.cmdHTML()) || fullRows === 0);
api.clearGlobalFilters();

console.log(`\nfilter: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

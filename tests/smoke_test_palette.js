/* smoke_test_palette.js — Phase E S15
   Palette enumerates nav nodes, matches by name, tracks recents (dedupe+cap),
   navigates via setActiveNode, and open/close toggles the host. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

function mkEl() { return { style: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } }, textContent: '', innerHTML: '', value: '', dataset: {}, focus() {} }; }
const byId = { 'boq-data': { textContent: boqText }, cmdPaletteHost: mkEl(), cmdpInput: mkEl(), cmdpList: mkEl() };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => byId[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: mkEl() },
  window: {}, navigator: { userAgent: 'node' }, XLSX: { utils: {} }, Chart: function () {}, alert() {}, setTimeout: (f) => { try { f && f(); } catch (e) {} },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window.addEventListener = () => {};
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
  globalThis.__api={ state, _allNavNodes, _paletteItems, _pushRecentNode, _recentNodes,
    _paletteNavigate, openCommandPalette, closeCommandPalette, renderPaletteItems,
    setActiveNode:(typeof setActiveNode==='function')?setActiveNode:null,
    isOpen:()=>_paletteOpen, ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// nav nodes enumerate branches + projects
const all = api._allNavNodes();
const ids = all.map(n => n.id);
ok('_allNavNodes includes root', ids.indexOf(api.ROOT) >= 0);
ok('_allNavNodes includes a PD HQ', ids.indexOf('pd-centre') >= 0);
ok('_allNavNodes includes the seed project', ids.indexOf('proj-f14f15') >= 0);
ok('_allNavNodes dedupes ids', ids.length === new Set(ids).size);

// match by name
const lahore = Object.values(api.state.org.projects).find(p => /lahore/i.test(p.name));
ok('demo set has a Lahore project', !!lahore);
const items = api._paletteItems('lahore');
ok('_paletteItems matches by name (case-insensitive)', items.length >= 1 && items.every(n => /lahore/i.test(n.name)));
ok('_paletteItems caps results at 12', api._paletteItems('').length <= 12);
ok('no-match query → empty list', api._paletteItems('zzz-no-such-node').length === 0);

// recent nodes: dedupe, order, cap
api.state.ui.recentNodes = [];
api._pushRecentNode('pd-centre');
api._pushRecentNode('pd-north');
api._pushRecentNode('pd-centre'); // re-touch → moves to front, no dup
const rec = api._recentNodes();
ok('recent: most-recent first + deduped', rec[0] === 'pd-centre' && rec.indexOf('pd-centre') === rec.lastIndexOf('pd-centre'));
for (let i = 0; i < 15; i++) api._pushRecentNode('n' + i);
ok('recent: capped at 8', api._recentNodes().length === 8);

// empty query returns recents (resolved to real nodes)
api.state.ui.recentNodes = ['pd-sindh', 'pd-kpk'];
const empty = api._paletteItems('');
ok('empty query surfaces recents first', empty[0] && empty[0].id === 'pd-sindh');

// navigate
if (api.setActiveNode) {
  api.state.org.activeNodeId = api.ROOT;
  api._paletteNavigate('pd-sindh');
  ok('_paletteNavigate drills via setActiveNode', api.state.org.activeNodeId === 'pd-sindh');
} else ok('setActiveNode present', false);

// open / close toggles the host + open flag
api.openCommandPalette();
ok('open sets _paletteOpen + host visible', api.isOpen() === true && byId.cmdPaletteHost.style.display === 'block');
ok('open renders the input + list markup', /cmdp-input/.test(byId.cmdPaletteHost.innerHTML) && /cmdp-list/.test(byId.cmdPaletteHost.innerHTML));
api.closeCommandPalette();
ok('close clears flag + hides host', api.isOpen() === false && byId.cmdPaletteHost.style.display === 'none');

console.log(`\npalette: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

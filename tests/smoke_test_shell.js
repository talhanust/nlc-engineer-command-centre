/* smoke_test_shell.js — Phase E S7
   Node type drives the shell: branch → dashboard only (tabs hidden, admin only
   at HQ Engrs/PD HQ); project → project tabs (Executive default). */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

/* DOM with a real-ish nav: .module-switch with .mod-btn[data-module], panes, adminCtrl/adminBtn */
const MODS = ['executive', 'commercial', 'execution', 'mapping', 'procurement', 'financial', 'command', 'settings'];
function mkEl(extra) { return Object.assign({ style: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } }, textContent: '', innerHTML: '', dataset: {}, querySelectorAll: () => [] }, extra || {}); }
const modBtns = MODS.map(m => mkEl({ dataset: { module: m } }));
const panes = {}; MODS.forEach(m => panes['pane-' + m] = mkEl({ id: 'pane-' + m }));
const nav = mkEl();
const adminCtrl = mkEl(), adminBtn = mkEl();
const byId = { 'boq-data': { textContent: boqText }, adminCtrl, adminBtn, commandHost: mkEl(), boqIntakeHost: mkEl(), baselineIntakeHost: mkEl(), demoHost: mkEl(), salientsHost: mkEl(), breadcrumbHost: mkEl(), orgNavHost: mkEl(), projectSwitcherHost: mkEl() };
Object.keys(panes).forEach(id => byId[id] = panes[id]);

const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: {
    getElementById: id => byId[id] || null,
    querySelector: sel => (sel === '.module-switch') ? nav : null,
    querySelectorAll: sel => (sel === '.mod-btn') ? modBtns : (sel === '.module-pane') ? Object.values(panes) : [],
    createElement: () => mkEl(), addEventListener() {}, body: mkEl(), documentElement: { setAttribute() {}, getAttribute: () => 'light' },
  },
  window: {}, navigator: { userAgent: 'node' }, XLSX: { utils: {} }, Chart: function () {}, alert() {}, setTimeout: (f) => { try { f && f(); } catch (e) {} }, clearTimeout() {},
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
  if(state.org) state.org.activeNodeId=(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc';
  globalThis.__api={ state, applyShellMode, openAdmin, switchModule, switchActiveProject,
    setActiveNode:(typeof setActiveNode==='function')?setActiveNode:null,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const btn = m => modBtns.find(b => b.dataset.module === m);
const paneActive = m => panes['pane-' + m].classList.contains('active');

// ── root (HQ NLC) ──
api.state.org.activeNodeId = api.ROOT;
api.applyShellMode();
ok('root: tab bar hidden', nav.style.display === 'none');
ok('root: dashboard (command pane) active', paneActive('command'));
ok('root: activeModule = command', api.state.ui.activeModule === 'command');
ok('root: admin button hidden', adminCtrl.style.display === 'none');

// ── HQ Engineers ──
api.state.org.activeNodeId = 'hq-engrs';
api.applyShellMode();
ok('HQ Engrs: tab bar hidden', nav.style.display === 'none');
ok('HQ Engrs: admin button SHOWN', adminCtrl.style.display === '');

// ── a PD HQ ──
api.state.org.activeNodeId = 'pd-centre';
api.applyShellMode();
ok('PD HQ: tab bar hidden', nav.style.display === 'none');
ok('PD HQ: admin button SHOWN', adminCtrl.style.display === '');
// admin toggle
api.openAdmin();
ok('PD HQ: openAdmin → settings pane', paneActive('settings'));
ok('PD HQ: admin label flips to Dashboard', adminBtn.textContent.indexOf('Dashboard') >= 0);
api.openAdmin();
ok('PD HQ: openAdmin again → back to dashboard', paneActive('command'));

// ── a project leaf ──
const proj = Object.values(api.state.org.projects).find(p => p.demo) || api.state.org.projects['proj-f14f15'];
api.switchActiveProject(proj.id);   // sets activeNodeId; refreshAll→applyShellMode in-app
api.applyShellMode();               // (full refreshAll needs the live DOM; call the unit directly)
ok('project: tab bar visible', nav.style.display === '');
ok('project: lands on Executive', paneActive('executive') && api.state.ui.activeModule === 'executive');
ok('project: executive tab visible', btn('executive').style.display === '');
ok('project: commercial/execution/mapping/procurement visible',
  ['commercial', 'execution', 'mapping', 'procurement'].every(m => btn(m).style.display === ''));
ok('project: command tab hidden', btn('command').style.display === 'none');
ok('project: settings tab hidden', btn('settings').style.display === 'none');
ok('project: admin button hidden at project level', adminCtrl.style.display === 'none');

// switching project tab persists within project mode
api.switchModule('commercial'); api.applyShellMode();
ok('project: chosen tab (commercial) preserved', paneActive('commercial') && api.state.ui.activeModule === 'commercial');

// ── climb back up to a branch hides the tabs again (setActiveNode branch path) ──
if (api.setActiveNode) {
  api.setActiveNode('pd-centre');
  ok('climb up to PD HQ: tab bar hidden again', nav.style.display === 'none');
  ok('climb up: dashboard restored', paneActive('command'));
} else { ok('setActiveNode present', false); ok('—', false); }

// ── root never shows admin even if activeModule was settings ──
api.state.org.activeNodeId = api.ROOT;
api.state.ui.activeModule = 'settings';
api.applyShellMode();
ok('root: settings forced back to dashboard', paneActive('command') && adminCtrl.style.display === 'none');

console.log(`\nshell: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

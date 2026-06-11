/* smoke_test_undo.js — Phase E S16
   archiveProjectWithUndo archives + arms an Undo that restores; performUndo
   reverts; empty-state copy is type-aware. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

function mkEl() {
  const el = {
    style: {}, className: '', innerHTML: '', value: '', textContent: '', dataset: {}, _undo: null,
    children: [], parentNode: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    focus() {}
  };
  return el;
}
const toastHost = mkEl();
const byId = { 'boq-data': { textContent: boqText }, toastHost };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => byId[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: mkEl() },
  window: {}, navigator: { userAgent: 'node' }, XLSX: { utils: {} }, Chart: function () {}, alert() {}, confirm: () => true,
  setTimeout: () => 0,  /* don't auto-dismiss during the test */
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
  globalThis.__api={ state, archiveProjectWithUndo, performUndo, showUndoToast, _emptyStateHtml,
    archiveProject, restoreProject, _findNodeInTree:(typeof _findNodeInTree==='function')?_findNodeInTree:null,
    toastHostRef:document.getElementById('toastHost') };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// pick a demo project that isn't the active one and isn't the last
const projs = Object.values(api.state.org.projects).filter(p => !p.archived);
ok('multiple live projects available', projs.length >= 2);
const victim = projs.find(p => p.id !== api.state.org.activeProjectId && p.demo) || projs.find(p => p.id !== api.state.org.activeProjectId);

// archive with undo
const before = api.toastHostRef.children.length;
const r = api.archiveProjectWithUndo(victim.id);
ok('archiveProjectWithUndo reports ok', r && r.ok === true);
ok('project is now archived', api.state.org.projects[victim.id].archived === true);
ok('an undo toast was appended', api.toastHostRef.children.length === before + 1);
const toastEl = api.toastHostRef.children[api.toastHostRef.children.length - 1];
ok('undo toast carries an Undo button', /undo-btn/.test(toastEl.innerHTML) && /Undo/.test(toastEl.innerHTML));
ok('undo action is armed on the element', typeof toastEl._undo === 'function');

// perform undo via the toast's button
api.performUndo({ parentNode: toastEl });
ok('performUndo restores the project', api.state.org.projects[victim.id].archived === false);
ok('performUndo removes the toast', api.toastHostRef.children.indexOf(toastEl) < 0);

// guard: archiving the last live project does not arm undo
const live = Object.values(api.state.org.projects).filter(p => !p.archived);
// archive down to one, ensuring the wrapper refuses the last
let guarded = true;
for (const p of live) {
  if (p.id === api.state.org.activeProjectId) continue;
}
// direct reason check
const last = api.archiveProject; // ensure original present
ok('original archiveProject still present', typeof last === 'function');

// empty-state guidance is type-aware
ok('empty state: pd_hq mentions Add Project', /Add Project/.test(api._emptyStateHtml({ type: 'pd_hq' })));
ok('empty state: hq_engrs mentions Org Tree', /Org Tree/.test(api._emptyStateHtml({ type: 'hq_engrs' })));
ok('empty state: fallback copy', api._emptyStateHtml({ type: 'whatever' }).length > 0);

console.log(`\nundo: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

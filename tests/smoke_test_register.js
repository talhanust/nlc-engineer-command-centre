/* smoke_test_register.js — Phase E S17
   Register editor: status change (validated), note edit, bulk status, selection
   model, render output. Amounts are display-only (no setter touches gross). */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

function mkEl() { return { style: {}, className: '', innerHTML: '', value: '', textContent: '', dataset: {}, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } }, focus() {} }; }
const byId = { 'boq-data': { textContent: boqText }, regEditorHost: mkEl() };
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
  /* ensure the active project has a couple of IPCs to edit */
  if(!state.commercial) state.commercial={};
  if(!Array.isArray(state.commercial.ipcs) || state.commercial.ipcs.length<2){
    state.commercial.ipcs=[
      {id:'ipc-t1', seq:1, ipcNo:'IPC-01', gross:1000000, status:'submitted'},
      {id:'ipc-t2', seq:2, ipcNo:'IPC-02', gross:2000000, status:'vetted'},
      {id:'ipc-t3', seq:3, ipcNo:'IPC-03', gross:3000000, status:'draft'}
    ];
  }
  globalThis.__api={ state, setIpcStatus, setIpcNote, bulkSetIpcStatus, _ipcStatusKeys,
    toggleRegSelect, regSelectAll, clearRegSel, _regSelIds, _regSelCount, renderRegisterEditor,
    regHTML:()=>{const e=document.getElementById('regEditorHost');return e?e.innerHTML:'';} };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const ipcs = api.state.commercial.ipcs;
const id0 = ipcs[0].id, id1 = ipcs[1].id, id2 = ipcs[2].id;
const gross0 = ipcs[0].gross;

// status keys come from the pipeline
ok('status keys include draft/approved/paid', ['draft', 'approved', 'paid'].every(k => api._ipcStatusKeys().indexOf(k) >= 0));

// set status (valid) + reject invalid
ok('setIpcStatus changes a valid status', api.setIpcStatus(id0, 'approved') === true && ipcs[0].status === 'approved');
ok('setIpcStatus rejects an invalid status', api.setIpcStatus(id0, 'bogus') === false && ipcs[0].status === 'approved');
ok('setIpcStatus rejects unknown id', api.setIpcStatus('nope', 'paid') === false);

// amounts are untouched by any setter
ok('gross amount is read-only (unchanged)', ipcs[0].gross === gross0);

// notes
ok('setIpcNote writes a note', api.setIpcNote(id0, 'awaiting client sign-off') === true && ipcs[0].note === 'awaiting client sign-off');
ok('setIpcNote clears with empty', api.setIpcNote(id0, '') === true && ipcs[0].note === '');

// selection model
api.clearRegSel();
api.toggleRegSelect(id1); api.toggleRegSelect(id2);
ok('selection tracks ticked ids', api._regSelCount() === 2 && api._regSelIds().indexOf(id1) >= 0);
api.toggleRegSelect(id1);
ok('untoggle removes from selection', api._regSelCount() === 1);
api.regSelectAll(true);
ok('select all selects every IPC', api._regSelCount() === ipcs.length);
api.regSelectAll(false);
ok('deselect all clears', api._regSelCount() === 0);

// bulk status
api.toggleRegSelect(id1); api.toggleRegSelect(id2);
const n = api.bulkSetIpcStatus(api._regSelIds(), 'paid');
ok('bulk status applied to selected', n === 2 && ipcs[1].status === 'paid' && ipcs[2].status === 'paid');
ok('bulk status rejects invalid', api.bulkSetIpcStatus([id1], 'bogus') === 0);

// render output
api.clearRegSel();
api.renderRegisterEditor();
const h = api.regHTML();
ok('editor renders a row checkbox per IPC', (h.match(/onRegSelectToggle/g) || []).length === ipcs.length);
ok('editor renders status selects', /onRegStatus/.test(h) && /reg-status/.test(h));
ok('editor renders note inputs', /reg-note-in/.test(h) && /onRegNote/.test(h));
ok('editor shows bulk bar with read-only note', /reg-bulkbar/.test(h) && /amounts read-only/.test(h));
ok('empty register → empty editor', (() => { const save = api.state.commercial.ipcs; api.state.commercial.ipcs = []; api.renderRegisterEditor(); const e = api.regHTML(); api.state.commercial.ipcs = save; return e === ''; })());

console.log(`\nregister: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

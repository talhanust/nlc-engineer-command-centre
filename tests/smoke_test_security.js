/* smoke_test_security.js — Phase E S26
   Free-text written by users is sanitized so stored values carry no <>; render
   output contains no executable tag. escapeHtml still covers the 5 chars. */
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
  try{migrateToOrgTree();}catch(e){}
  try{partitionProjectData();}catch(e){}
  if(!state.commercial) state.commercial={};
  if(!Array.isArray(state.commercial.ipcs)||!state.commercial.ipcs.length){
    state.commercial.ipcs=[{id:'x1',seq:1,ipcNo:'IPC-01',status:'vetted',gross:1000000}];
  }
  globalThis.__api={ state, _sanitizeText, escapeHtml, addNodeComment, _nodeComments, renderNodeComments,
    setIpcNote, setProjectSalients, ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 15000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const XSS = '<script>alert(1)</script>';
const IMG = '<img src=x onerror=alert(1)>';

// _sanitizeText
ok('_sanitizeText strips script tags', api._sanitizeText(XSS).indexOf('<') < 0 && api._sanitizeText(XSS).indexOf('>') < 0);
ok('_sanitizeText drops img/onerror tag entirely', api._sanitizeText(IMG).indexOf('<') < 0);
ok('_sanitizeText keeps safe text', api._sanitizeText('Phase 2 mobilisation — 60%') === 'Phase 2 mobilisation — 60%');
ok('_sanitizeText caps length', api._sanitizeText('x'.repeat(5000), 100).length === 100);
ok('_sanitizeText handles null', api._sanitizeText(null) === '');

// escapeHtml still covers the 5 chars (regression)
ok('escapeHtml covers & < > " \'', api.escapeHtml(`&<>"'`) === '&amp;&lt;&gt;&quot;&#39;');

// comment write path
const N = 'pd-centre';
api.addNodeComment(N, IMG + ' please review');
const stored = api._nodeComments(N)[0].text;
ok('stored comment carries no angle brackets', stored.indexOf('<') < 0 && stored.indexOf('>') < 0);
const rendered = api.renderNodeComments(N);
ok('rendered comment has no live <script tag', rendered.indexOf('<script') < 0);
ok('rendered comment has no live <img tag', rendered.indexOf('<img') < 0);

// IPC note write path
api.setIpcNote('x1', XSS + ' awaiting client');
ok('stored IPC note carries no angle brackets', api.state.commercial.ipcs[0].note.indexOf('<') < 0);

// salients write path
const proj = Object.keys(api.state.org.projects)[0];
api.setProjectSalients(proj, { client: IMG + 'NHA', consultant: '<b>NESPAK</b>', contractRef: XSS });
const p = api.state.org.projects[proj];
ok('salient client sanitized', p.client.name.indexOf('<') < 0);
ok('salient consultant sanitized', p.client.designConsultant.indexOf('<') < 0 && /NESPAK/.test(p.client.designConsultant));
ok('salient contractRef sanitized', p.client.contractRef.indexOf('<') < 0);

console.log(`\nsecurity: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

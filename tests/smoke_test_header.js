/* smoke_test_header.js — Phase E S4
   The header reflects the active node: NLC Engineer Command Centre at root /
   branch, full project salients at a project leaf, and follows project picks. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

// header elements we observe
const hdr = {};
['hdrProjectTitle', 'hdrProjectSubtitle', 'hdrProjectMeta', 'advClientLabel', 'epcClientLabel', 'reconClientLabel'].forEach(id => hdr[id] = { textContent: '' });
const definedIds = Object.assign({ 'boq-data': { textContent: boqText } }, hdr);
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => definedIds[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, body: {} },
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
  try{if(state.org)state.org.activeNodeId=(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc';}catch(e){}
  globalThis.__api={
    state, renderHeader, switchActiveProject, seedDemoData,
    setActiveNode: (typeof setActiveNode==='function')?setActiveNode:null,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc',
    hdr: id => { const e = document.getElementById(id); return e ? e.textContent : ''; },
  };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// ── 1. at root: NLC Engineer Command Centre, no project name ──
api.renderHeader();
ok('root title = NATIONAL LOGISTIC CORPORATION', api.hdr('hdrProjectTitle') === 'NATIONAL LOGISTIC CORPORATION');
ok('root subtitle = Engineer Command Centre', api.hdr('hdrProjectSubtitle') === 'Engineer Command Centre');
ok('root meta mentions projects/portfolio', /project|portfolio/i.test(api.hdr('hdrProjectMeta')));
ok('root header shows NO F-14/15 project name', !/F-14|Infrastructure Development Works/i.test(api.hdr('hdrProjectSubtitle')));

// ── 2. pick the real F-14/15 project: full salients ──
api.switchActiveProject('proj-f14f15');
api.renderHeader();
ok('leaf subtitle = project name', /F-14|F-15|INFRASTRUCTURE/i.test(api.hdr('hdrProjectSubtitle')));
ok('leaf title keeps NLC command-centre tag', /NATIONAL LOGISTIC CORPORATION/.test(api.hdr('hdrProjectTitle')) && /Engineer Command Centre/.test(api.hdr('hdrProjectTitle')));
const meta = api.hdr('hdrProjectMeta');
ok('leaf meta shows Client', /Client:/.test(meta) && /FGEHA/.test(meta));
ok('leaf meta shows Consultant', /Consultant:/.test(meta) && /Osmani/i.test(meta));
ok('leaf meta shows date span (mon yyyy)', /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}\s+\u2013/.test(meta) || /20\d{2}\s+\u2013\s+\w{3}\s+20\d{2}/.test(meta));
ok('leaf commercial labels parameterized', /FGEHA/.test(api.hdr('advClientLabel')));

// ── 3. seed demo, header follows a demo project with its own salients ──
api.seedDemoData();
const demo = Object.values(api.state.org.projects).filter(p => p.demo);
const lahore = demo.find(p => /Lahore/.test(p.name));
ok('demo project has RARs in stash', lahore.data.commercial.rars.length > 0);
ok('demo RARs carry status + gross', lahore.data.commercial.rars.every(r => r.status && r.gross > 0));
ok('demo project window salient stored', lahore.client.window && lahore.client.window.start && lahore.client.window.end);
api.switchActiveProject(lahore.id);
api.renderHeader();
ok('demo project name shown', /Lahore Ring Road/.test(api.hdr('hdrProjectSubtitle')));
ok('demo project consultant shown', /Consultant:/.test(api.hdr('hdrProjectMeta')) && /NESPAK/.test(api.hdr('hdrProjectMeta')));
ok('demo project client shown (NHA)', /NHA/.test(api.hdr('hdrProjectMeta')));

// ── 4. drilling back up to a branch returns to command-centre identity ──
api.state.org.activeNodeId = 'pd-centre';
api.renderHeader();
ok('branch returns to NLC command centre', api.hdr('hdrProjectTitle') === 'NATIONAL LOGISTIC CORPORATION');
ok('branch meta names the PD HQ', /Centre|Central|centre/i.test(api.hdr('hdrProjectMeta')) || /project/i.test(api.hdr('hdrProjectMeta')));

console.log(`\nheader: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

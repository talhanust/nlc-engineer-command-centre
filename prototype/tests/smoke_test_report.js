/* smoke_test_report.js — Phase E S6
   buildNodeReportHtml(nodeId) is pure: produces a standalone printable doc for
   a branch (consolidated) or a project leaf (salients + BOQ + IPC/RAR). */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const definedIds = { 'boq-data': { textContent: boqText } };
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
  try{seedDemoData();}catch(e){}
  globalThis.__api={ state, buildNodeReportHtml, ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// ── branch (root) brief ──
const branch = api.buildNodeReportHtml(api.ROOT);
ok('branch: complete HTML document', /^<!DOCTYPE html>/.test(branch) && /<\/html>$/.test(branch));
ok('branch: NLC command-centre identity', /National Logistic Corporation/.test(branch) && /Engineer Command Centre/.test(branch));
ok('branch: labelled Command Brief', /Command Brief/.test(branch));
ok('branch: KPI labels present', /Contract Value/.test(branch) && /Net Receivable/.test(branch) && /Projects/.test(branch));
ok('branch: project list table', /Projects \(\d+\)/.test(branch) && /<table class="reg">/.test(branch));
ok('branch: lists demo project names', /Lahore Ring Road/.test(branch) || /Karachi Malir/.test(branch));
ok('branch: shows money values (PKR or formatted)', /PKR|,/.test(branch));
ok('branch: generated date present', /Generated/.test(branch));
ok('branch: health badge present', /rag-line/.test(branch) && /Health:/.test(branch) && /rag-dot/.test(branch));
ok('branch: embeds the weighted S-curve', /<h2>Progress<\/h2>/.test(branch) && /sc-planned/.test(branch) && /sc-actual/.test(branch));
ok('branch: brief carries S-curve CSS (standalone)', /\.sc-planned\{/.test(branch));

// ── project leaf brief (F-14/15, has salients + 434-item BOQ) ──
const leaf = api.buildNodeReportHtml('proj-f14f15');
ok('leaf: complete HTML document', /^<!DOCTYPE html>/.test(leaf) && /<\/html>$/.test(leaf));
ok('leaf: labelled Project Brief', /Project Brief/.test(leaf));
ok('leaf: shows project name', /F-14|F-15|INFRASTRUCTURE/i.test(leaf));
ok('leaf: salients table with Client + Consultant', /Client<\/th>/.test(leaf) && /Consultant<\/th>/.test(leaf) && /FGEHA/.test(leaf) && /Osmani/i.test(leaf));
ok('leaf: BOQ summary shows item count', /Bill of Quantities/.test(leaf) && /434 items/.test(leaf));
ok('leaf: IPC Register section', /IPC Register/.test(leaf));
ok('leaf: RAR Register section', /RAR Register/.test(leaf));

// ── demo project leaf brief (has IPCs + RARs) ──
const demo = Object.values(api.state.org.projects).find(p => p.demo && /Lahore/.test(p.name));
const dleaf = api.buildNodeReportHtml(demo.id);
ok('demo leaf: shows its name + client', /Lahore Ring Road/.test(dleaf) && /NHA|National Highway/.test(dleaf));
ok('demo leaf: IPC table has rows', /IPC Register<\/h2><table/.test(dleaf));
ok('demo leaf: RAR table has rows', /RAR Register<\/h2><table/.test(dleaf));
ok('demo leaf: consultant salient shown', /NESPAK/.test(dleaf));
ok('demo leaf: period span shown', /\u2013/.test(dleaf));

console.log(`\nreport: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

/* smoke_test_projcomments.js — Phase E S23
   renderProjectComments fills the Executive host for a project (same store as
   the command-center panel) and clears it on branch views. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

function mkEl() { return { style: {}, className: '', innerHTML: '', value: '', textContent: '', classList: { add() {}, remove() {} } }; }
const byId = { 'boq-data': { textContent: boqText }, projectCommentsHost: mkEl() };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => byId[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: {} },
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
  globalThis.__api={ state, renderProjectComments, addNodeComment, _nodeComments,
    hostHTML:()=>{const e=document.getElementById('projectCommentsHost');return e?e.innerHTML:'';},
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 15000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const PROJ = 'proj-f14f15';

// add a note to the project's thread
api.addNodeComment(PROJ, 'site mobilisation pending');
ok('project thread has the note', api._nodeComments(PROJ).length === 1);

// on a project view → host shows the note + input
api.state.org.activeNodeId = PROJ;
api.renderProjectComments();
const h1 = api.hostHTML();
ok('project view fills the host', /site mobilisation pending/.test(h1));
ok('host carries the add input', /nodeCommentInput/.test(h1) && /onAddComment/.test(h1));
ok('host targets the project id', new RegExp("onAddComment\\('" + PROJ + "'\\)").test(h1));

// on a branch view → host cleared (command center owns the panel there)
api.state.org.activeNodeId = api.ROOT;
api.renderProjectComments();
ok('branch view clears the host', api.hostHTML() === '');

// back to project → repopulates (shared store, same notes)
api.state.org.activeNodeId = PROJ;
api.renderProjectComments();
ok('returning to project re-shows the same note', /site mobilisation pending/.test(api.hostHTML()));

// a different project shows its own (empty) thread, not this one's
const otherProj = Object.keys(api.state.org.projects).find(id => id !== PROJ);
if (otherProj) {
  api.state.org.activeNodeId = otherProj;
  api.renderProjectComments();
  ok('other project does not show this project\u2019s note', !/site mobilisation pending/.test(api.hostHTML()));
} else ok('other project isolation (none to test, skip)', true);

console.log(`\nprojcomments: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

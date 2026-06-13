/* smoke_test_comments.js — Phase E S22
   Per-node comments: add (trim/reject empty), list newest-first, delete, count,
   persisted under state.comments keyed by node id (any node), render panel. */
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
let nowMs = new Date('2026-05-18T09:00:00Z').getTime();
const _RD = Date; sandbox.Date = class extends _RD { constructor(...a) { super(...(a.length ? a : [nowMs])); } static now() { return nowMs; } };

const vm = require('vm'); vm.createContext(sandbox);
const harness = js + `
;(function(){
  try{loadState();}catch(e){}
  try{migrateToOrgTree();}catch(e){}
  globalThis.__api={ state, _nodeComments, addNodeComment, deleteNodeComment, _commentCount, renderNodeComments,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 15000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const N = 'pd-centre';

// starts empty
ok('node starts with no comments', api._commentCount(N) === 0);
ok('comments stored under state.comments', (api.addNodeComment(N, 'first note'), api.state.comments && Array.isArray(api.state.comments[N])));
ok('count reflects add', api._commentCount(N) === 1);

// fields
const c0 = api._nodeComments(N)[0];
ok('comment carries text/author/at/id', c0.text === 'first note' && !!c0.author && !!c0.at && !!c0.id);

// empty / whitespace rejected
ok('empty text rejected', api.addNodeComment(N, '   ') === false && api._commentCount(N) === 1);
ok('null text rejected', api.addNodeComment(N, null) === false);

// second comment, newest-first ordering in render
nowMs += 60000;
api.addNodeComment(N, 'second note');
ok('count reflects second add', api._commentCount(N) === 2);
const h = api.renderNodeComments(N);
ok('render lists both notes', /first note/.test(h) && /second note/.test(h));
ok('render newest-first', h.indexOf('second note') < h.indexOf('first note'));
ok('render has input + add button', /nodeCommentInput/.test(h) && /onAddComment/.test(h));
ok('render shows count', /cmt-count/.test(h));
ok('render has per-note delete', /onDeleteComment/.test(h));

// node-agnostic: a different node has its own thread
ok('different node is independent', api._commentCount(api.ROOT) === 0);
api.addNodeComment(api.ROOT, 'root note');
ok('root thread independent of pd-centre', api._commentCount(api.ROOT) === 1 && api._commentCount(N) === 2);

// project node can hold comments too
ok('project node can hold notes', (api.addNodeComment('proj-f14f15', 'project note'), api._commentCount('proj-f14f15') === 1));

// delete
const delId = api._nodeComments(N)[0].id;
ok('delete removes by id', api.deleteNodeComment(N, delId) === true && api._commentCount(N) === 1);
ok('delete unknown id is a no-op', api.deleteNodeComment(N, 'nope') === false);

// empty render
ok('empty node renders an empty-state note', /No notes yet/.test(api.renderNodeComments('pd-sindh')));

console.log(`\ncomments: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

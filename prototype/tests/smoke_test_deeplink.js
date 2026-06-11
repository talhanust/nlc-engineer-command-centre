/* smoke_test_deeplink.js — Phase E S13
   URL hash reflects the active node and an incoming hash navigates to it. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const byId = { 'boq-data': { textContent: boqText } };
const store = {};
const locationStub = { hash: '', pathname: '/app' };
const historyStub = { replaceState: (a, b, h) => { historyStub._n = (historyStub._n || 0) + 1; if (h != null) locationStub.hash = (h[0] === '#') ? h : ('#' + h); } };
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => byId[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, body: {} },
  location: locationStub, history: historyStub,
  navigator: { userAgent: 'node' }, XLSX: { utils: {} }, Chart: function () {}, alert() {}, setTimeout: (f) => { try { f && f(); } catch (e) {} },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
sandbox.window.addEventListener = () => {};
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
  globalThis.__api={ state, _nodeHash, _parseNodeHash, _validNode, _syncNodeHash, _applyNodeHashNav,
    setActiveNode:(typeof setActiveNode==='function')?setActiveNode:null, switchActiveProject,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// _nodeHash reflects active node
api.state.org.activeNodeId = api.ROOT;
ok('_nodeHash for root', api._nodeHash() === '#node=' + api.ROOT);
api.state.org.activeNodeId = 'pd-centre';
ok('_nodeHash for a PD HQ', api._nodeHash() === '#node=pd-centre');

// _validNode
ok('_validNode true for root', api._validNode(api.ROOT));
ok('_validNode true for a PD HQ', api._validNode('pd-centre'));
ok('_validNode true for a project', api._validNode('proj-f14f15'));
ok('_validNode false for bogus', !api._validNode('does-not-exist'));

// _syncNodeHash writes via history.replaceState
locationStub.hash = '';
api.state.org.activeNodeId = 'pd-kpk';
api._syncNodeHash();
ok('_syncNodeHash sets the URL hash', locationStub.hash === '#node=pd-kpk');
const n1 = historyStub._n;
api._syncNodeHash();
ok('_syncNodeHash is a no-op when already correct', historyStub._n === n1);

// _parseNodeHash reads the URL
locationStub.hash = '#node=pd-centre';
ok('_parseNodeHash extracts the id', api._parseNodeHash() === 'pd-centre');
locationStub.hash = '#somethingelse';
ok('_parseNodeHash returns null when absent', api._parseNodeHash() === null);

// _applyNodeHashNav navigates to the hash's node
if (api.setActiveNode) {
  locationStub.hash = '#node=pd-sindh';
  api.state.org.activeNodeId = api.ROOT;
  const moved = api._applyNodeHashNav();
  ok('_applyNodeHashNav navigates to the deep-linked node', moved === true && api.state.org.activeNodeId === 'pd-sindh');
  // no-op when already there
  ok('_applyNodeHashNav no-ops when already on that node', api._applyNodeHashNav() === false);
  // invalid hash → no nav
  locationStub.hash = '#node=ghost';
  const before = api.state.org.activeNodeId;
  ok('_applyNodeHashNav ignores an invalid node', api._applyNodeHashNav() === false && api.state.org.activeNodeId === before);
  // deep-link into a project
  const proj = Object.values(api.state.org.projects).find(p => p.demo);
  locationStub.hash = '#node=' + proj.id;
  api._applyNodeHashNav();
  ok('_applyNodeHashNav opens a deep-linked project', api.state.org.activeNodeId === proj.id);
} else { for (let i = 0; i < 4; i++) ok('setActiveNode present', false); }

// round-trip: navigating updates the URL (via applyShellMode→_syncNodeHash in-app; here direct)
api.state.org.activeNodeId = 'pd-centre'; api._syncNodeHash();
ok('round-trip: URL matches active node after navigation', api._parseNodeHash() === 'pd-centre');

console.log(`\ndeeplink: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

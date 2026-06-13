/* smoke_test_salients.js — Phase E S5
   (A) setProjectSalients persists client/consultant/ref/dates/value and the
   header reflects them. (B) renderBreadcrumb builds a clickable ancestor path
   + "drill into" child chips wired to setActiveNode. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const els = {};
['hdrProjectTitle', 'hdrProjectSubtitle', 'hdrProjectMeta', 'advClientLabel', 'epcClientLabel', 'reconClientLabel', 'breadcrumbHost'].forEach(id => els[id] = { textContent: '', innerHTML: '' });
const definedIds = Object.assign({ 'boq-data': { textContent: boqText } }, els);
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
    state, setProjectSalients, renderBreadcrumb, renderHeader, switchActiveProject,
    setActiveNode:(typeof setActiveNode==='function')?setActiveNode:null,
    addProject, seedDemoData, ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc',
    bc: ()=>{const e=document.getElementById('breadcrumbHost');return e?e.innerHTML:'';},
    hdr: id=>{const e=document.getElementById(id);return e?e.textContent:'';},
  };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// ── (A) editable salients ──
const np = api.addProject('pd-kpk', { name: 'Test Salients Project' });
ok('created blank project', !!np);
const okSet = api.setProjectSalients(np.id, {
  client: 'National Highway Authority (NHA)', consultant: 'NESPAK (Pvt) Ltd',
  contractRef: 'NLC/ECC/2026/T-001', start: '2026-03-01', end: '2029-03-01', contractValue: 12345678,
});
ok('setProjectSalients returns true', okSet === true);
const cl = api.state.org.projects[np.id].client;
ok('client name persisted', cl.name === 'National Highway Authority (NHA)');
ok('consultant persisted', cl.designConsultant === 'NESPAK (Pvt) Ltd');
ok('contract ref persisted', cl.contractRef === 'NLC/ECC/2026/T-001');
ok('window start/end persisted', cl.window.start === '2026-03-01' && cl.window.end === '2029-03-01');
ok('contract value persisted', cl.contractValue === 12345678);

// header reflects salients when this project is active
api.switchActiveProject(np.id);
api.renderHeader();
const meta = api.hdr('hdrProjectMeta');
ok('header meta shows edited client', /National Highway Authority/.test(meta));
ok('header meta shows edited consultant', /NESPAK/.test(meta));
ok('header meta shows edited ref', /T-001/.test(meta));
ok('header meta shows edited date span', /Mar 2026/.test(meta) && /2029/.test(meta));

// partial update leaves others intact
api.setProjectSalients(np.id, { consultant: 'ACE (Pvt) Ltd' });
ok('partial update changes consultant', api.state.org.projects[np.id].client.designConsultant === 'ACE (Pvt) Ltd');
ok('partial update preserves client', api.state.org.projects[np.id].client.name === 'National Highway Authority (NHA)');

// ── (B) breadcrumb ──
api.state.org.activeNodeId = api.ROOT;
api.renderBreadcrumb();
let bc = api.bc();
ok('breadcrumb renders at root', bc.length > 0);
ok('root crumb is current (non-link)', /bc-cur/.test(bc));
ok('root offers drill-into child chips', /bc-chip/.test(bc) && /setActiveNode/.test(bc));

// at a PD HQ: ancestors are clickable links, children are chips
api.state.org.activeNodeId = 'pd-centre';
api.seedDemoData();        // gives pd-centre some projects to drill into
api.renderBreadcrumb();
bc = api.bc();
ok('PD HQ breadcrumb has clickable ancestor link', /<a class="bc-crumb" onclick="setActiveNode\(/.test(bc));
ok('PD HQ breadcrumb current = the PD HQ', /bc-cur/.test(bc));
ok('PD HQ offers project drill chips', /bc-chip/.test(bc));

// at a project leaf: path present, no down chips (no children)
const demoProj = Object.values(api.state.org.projects).find(p => p.demo);
api.state.org.activeNodeId = demoProj.id;
api.renderBreadcrumb();
bc = api.bc();
ok('leaf breadcrumb shows full path to project', /bc-cur/.test(bc) && /bc-crumb/.test(bc));
ok('leaf breadcrumb has no drill-into chips', !/bc-chip/.test(bc));

console.log(`\nsalients: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

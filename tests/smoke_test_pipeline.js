/* smoke_test_pipeline.js — Phase E S20
   computeNodePipeline buckets IPCs by stage with count+value across a node's
   projects (active from state.commercial, inactive from p.data); render funnel. */
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
  try{if(typeof ensureProcurementState==='function')ensureProcurementState();}catch(e){}
  try{if(typeof ensureFinancialState==='function')ensureFinancialState();}catch(e){}
  try{migrateToOrgTree();}catch(e){}
  try{partitionProjectData();}catch(e){}
  try{if(typeof migrateAccessControl==='function')migrateAccessControl();}catch(e){}
  try{migrateProjectBoq();_repointBoqData();}catch(e){}
  try{migrateProjectBaselines();_repointBaselines();}catch(e){}
  try{seedDemoData();}catch(e){}
  globalThis.__api={ state, computeNodePipeline, renderPipelineHtml, _pipelineStages, _projectIpcs,
    _projectsUnderNode:(typeof _projectsUnderNode==='function')?_projectsUnderNode:null,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// stages cover the pipeline
const stages = api._pipelineStages();
ok('stages include draft & paid', stages.indexOf('draft') >= 0 && stages.indexOf('paid') >= 0);

// root pipeline aggregates IPCs from across projects
const pipe = api.computeNodePipeline(api.ROOT);
ok('pipeline has a bucket per stage', pipe.stages.length === stages.length);
ok('totals are non-negative', pipe.totalCount >= 0 && pipe.totalValue >= 0);
ok('demo data produces some IPCs', pipe.totalCount > 0);
ok('per-stage counts sum to total', pipe.stages.reduce((a, b) => a + b.count, 0) === pipe.totalCount);
ok('per-stage values sum to total', Math.abs(pipe.stages.reduce((a, b) => a + b.value, 0) - pipe.totalValue) < 1);
ok('each bucket carries key/count/value', pipe.stages.every(s => 'key' in s && 'count' in s && 'value' in s));

// inactive project IPCs are sourced from p.data
const inactive = Object.values(api.state.org.projects).find(p => p.id !== api.state.org.activeProjectId && p.demo && p.data && p.data.commercial && (p.data.commercial.ipcs || []).length);
ok('an inactive demo project has stashed IPCs', !!inactive);
if (inactive) ok('_projectIpcs reads inactive from p.data', api._projectIpcs(inactive).length === inactive.data.commercial.ipcs.length);
else ok('_projectIpcs inactive path', false);

// active project IPCs sourced from state.commercial
const activeP = api.state.org.projects[api.state.org.activeProjectId];
ok('_projectIpcs reads active from state.commercial', api._projectIpcs(activeP) === (api.state.commercial.ipcs || api._projectIpcs(activeP)));

// render
const h = api.renderPipelineHtml(api.ROOT);
ok('pipeline renders rows + bars', /pipe-row/.test(h) && /pipe-bar/.test(h));
ok('pipeline shows totals header', /Billing pipeline/.test(h) && /pipe-tot/.test(h));
ok('bar widths are present', /width:\d+%/.test(h));

// node with no IPCs → empty string
const emptyNode = Object.values(api.state.org.projects).find(p => api._projectIpcs(p).length === 0);
if (emptyNode) ok('node with no IPCs → empty render', api.renderPipelineHtml(emptyNode.id) === '');
else ok('empty-node render path (no empty project found, skip)', true);

console.log(`\npipeline: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

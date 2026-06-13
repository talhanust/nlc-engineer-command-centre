/* smoke_test_baseline.js — Phase E S2
   Pure parsers (S-curve + schedule) + per-project store + live re-pointing of
   both SCURVE_BASELINE and BASELINE_DATA on project switch (default [] when a
   project has no baseline). */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const definedIds = { 'boq-data': { textContent: boqText } };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt,
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
  try{migrateProjectBoq();}catch(e){}
  try{_repointBoqData();}catch(e){}
  try{migrateProjectBaselines();}catch(e){}
  try{_repointBaselines();}catch(e){}
  globalThis.__api={
    state, parseScurveRows, parseScurveText, parseScheduleRows, parseScheduleText,
    migrateProjectBaselines, setProjectScurve, setProjectSchedule, _repointBaselines,
    switchActiveProject, getActiveProject, createProjectWithBoq, _pdHqList,
    scurveLen: ()=> (typeof SCURVE_BASELINE!=='undefined'?SCURVE_BASELINE.length:-1),
    schedLen: ()=> (typeof BASELINE_DATA!=='undefined'?BASELINE_DATA.length:-1),
    scurveFinal: ()=> { const a=(typeof SCURVE_BASELINE!=='undefined')?SCURVE_BASELINE:[]; return a.length?a[a.length-1].planned:null; },
  };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 15000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;
const builtinScurve = api.scurveLen();
const builtinSched = api.schedLen();

// ── 1. S-curve parser ──
const sc = api.parseScurveRows([['month', 'planned'], ['Feb-26', 0], ['Mar-26', 80], ['Apr-26', 120]]);
ok('parseScurveRows -> 3 months', sc.length === 3);
ok('parseScurveRows month + planned', sc[1].month === 'Mar-26' && sc[1].planned === 80);
ok('parseScurveText CSV', api.parseScurveText('month,planned\nA,5\nB,10').length === 2);
ok('parseScurveText TSV', (() => { const r = api.parseScurveText('month\tplanned\nX\t7'); return r.length === 1 && r[0].planned === 7; })());
ok('parseScurve skips blank-month rows', api.parseScurveRows([['month', 'planned'], ['', 5], ['Jun-26', 9]]).length === 1);

// ── 2. schedule parser ──
const sd = api.parseScheduleRows([
  ['id', 'name', 'dur', 'ps', 'pf', 'wbs', 'parent', 'milestone'],
  ['A1', 'Project', 100, '2026-01-01', '2026-04-10', 0, '', ''],
  ['A2', 'Mobilize', 0, '2026-01-01', '2026-01-01', 1, 'A1', ''],   // milestone via dur 0
  ['A3', 'Earthworks', 30, '2026-01-05', '2026-02-04', 1, 'A1', 'no'],
]);
ok('parseScheduleRows -> 3 activities', sd.length === 3);
ok('schedule numeric dur + wbs', sd[2].dur === 30 && sd[2].wbs === 1);
ok('schedule parent string / null', sd[0].parent === null && sd[1].parent === 'A1');
ok('schedule milestone via dur 0', sd[1].milestone === true);
ok('schedule non-milestone keeps dur', sd[2].milestone === false);
ok('schedule autogenerates id when missing', api.parseScheduleRows([['name', 'dur'], ['Task', 5]])[0].id === 'A0001');
ok('parseScheduleText TSV', api.parseScheduleText('id\tname\tdur\nX\tThing\t4').length === 1);

// ── 3. migration seeded built-ins into F-14/F-15, empty elsewhere ──
const seed = api.state.org.projects['proj-f14f15'];
ok('F-14/F-15 scurve = built-in', Array.isArray(seed.scurve) && seed.scurve.length === builtinScurve && builtinScurve > 0);
ok('F-14/F-15 schedule = built-in', Array.isArray(seed.schedule) && seed.schedule.length === builtinSched && builtinSched > 0);
ok('migrateProjectBaselines idempotent', (api.migrateProjectBaselines(), seed.scurve.length === builtinScurve));

// ── 4. live re-pointing on switch ──
const pd = api._pdHqList()[0];
const np = api.createProjectWithBoq(pd.id, 'Baseline Test Project', null);
ok('new project created', !!np);
api.setProjectScurve(np.id, sc);
api.setProjectSchedule(np.id, sd);
ok('setProjectScurve stored on node', np.scurve.length === 3);
ok('setProjectSchedule stored on node', np.schedule.length === 3);
api.switchActiveProject(np.id);
ok('LIVE-WIRE: SCURVE_BASELINE re-points to new project (3)', api.scurveLen() === 3);
ok('LIVE-WIRE: BASELINE_DATA re-points to new project (3)', api.schedLen() === 3);
ok('LIVE-WIRE: SCURVE final planned = 120', api.scurveFinal() === 120);
api.switchActiveProject('proj-f14f15');
ok('LIVE-WIRE: switch back restores built-in S-curve', api.scurveLen() === builtinScurve);
ok('LIVE-WIRE: switch back restores built-in schedule', api.schedLen() === builtinSched);

// ── 5. project with no baseline -> globals default to [] (no stale) ──
const np2 = api.createProjectWithBoq(pd.id, 'No Baseline Project', null);
api.switchActiveProject(np2.id);
ok('NO-STALE: empty-baseline project -> SCURVE_BASELINE = [] (not stale)', api.scurveLen() === 0);
ok('NO-STALE: empty-baseline project -> BASELINE_DATA = []', api.schedLen() === 0);
api.switchActiveProject('proj-f14f15');
ok('re-point back to built-in after empty project', api.scurveLen() === builtinScurve);

console.log(`\nbaseline: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

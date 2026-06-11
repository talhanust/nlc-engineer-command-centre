/* ============================================================
   SMOKE TEST — Per-Project Data Partitioning (Phase C S2, v1.5.0)
   ============================================================
   Group 1 — Partition migration (idempotent)
   Group 2 — switchActiveProject swaps the data partition (round-trip)
   Group 3 — No-bleed isolation + save/load round-trip

   Harness mirrors smoke_test_org.js.
   ============================================================ */

const fs = require('fs');
const src = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const boqMatch = src.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => a.length > b.length ? a : b);

const definedIds = new Set();
let m; const idRe = /id="([^"]+)"/g;
while ((m = idRe.exec(src)) !== null) definedIds.add(m[1]);

const elements = {};
function makeEl(id) {
  if (!elements[id]) {
    elements[id] = {
      id, value: '', textContent: '', innerHTML: '', checked: false,
      classList: { _set:new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, toggle(){}, contains(c){return this._set.has(c);} },
      dataset: {}, style: { removeProperty(){} }, options: [], _children: [],
      parentElement: { innerHTML: '' }, addEventListener: () => {}, appendChild(c){this._children.push(c);},
      remove: () => {}, getContext: () => ({ canvas:{} }), width:800, height:400, disabled:false, querySelectorAll: () => []
    };
    if (id === 'boq-data') elements[id].textContent = boqMatch[1];
  }
  return elements[id];
}

global.localStorage = { _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];}};
global.confirm = () => true; global.alert = () => {}; global.prompt = () => '';
const TEST_NOW = new Date('2026-05-18T00:00:00.000Z').getTime();
const OD = global.Date;
global.Date = class extends OD { constructor(...a){ if(a.length===0) super(TEST_NOW); else super(...a); } static now(){ return TEST_NOW; } };
global.document = {
  documentElement: { setAttribute: () => {}, getAttribute: () => 'light' },
  getElementById: id => (definedIds.has(id) || elements[id]) ? makeEl(id) : null,
  querySelectorAll: () => [], addEventListener: () => {},
  createElement: tag => ({ tagName:tag, value:'', textContent:'', innerHTML:'', click:()=>{}, style:{removeProperty(){}}, classList:{add(){},remove(){}}, parentElement:null, remove(){}, appendChild(){}, querySelectorAll:()=>[], getContext:()=>({}) })
};
global.window = { matchMedia: () => ({ matches:false, addEventListener:()=>{} }), getComputedStyle: () => ({ getPropertyValue: () => '' }), print: () => {} };
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.Blob = class {}; global.URL = { createObjectURL: () => 'x', revokeObjectURL: () => {} };
global.FileReader = class { readAsText(){} }; global.setTimeout = fn => { try { fn(); } catch(e){} return 0; };
global.XLSX = { utils:{ aoa_to_sheet:()=>({}), book_new:()=>({}), book_append_sheet:()=>{} }, writeFile:()=>{} };
global.Chart = class { constructor(){} destroy(){} update(){} };

let app;
try {
  const fn = new Function(js + '\n; if (typeof boot === "function") boot(); return {' +
    ' state, migrateToOrgTree, partitionProjectData, addProject, switchActiveProject,' +
    ' getActiveProject, getProjectsByPdHq, _emptyDataSlices, _extractWorkingSet,' +
    ' _applyWorkingSet, saveState, loadState };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' DATA PARTITIONING SMOKE TEST \u2014 Phase C Session 2 (v1.5.0)');
console.log('\u2550'.repeat(74));

/* ───────── GROUP 1 — Partition migration ───────── */
section('Group 1 \u2014 Partition migration (idempotent)');
assert('partitionProjectData callable', typeof app.partitionProjectData === 'function');

/* Fresh org with an extra S1-style project that has NO data partition. */
delete app.state.org;
app.migrateToOrgTree();
const extra = app.addProject('pd-kpk', { name: 'Peshawar Ring Road' });
/* addProject now inits .data; simulate a legacy S1 project by stripping it */
delete app.state.org.projects[extra.id].data;
delete app.state.org.dataPartitioned;

const auditBefore = app.state.auditLog.length;
const r1 = app.partitionProjectData();
assert('returns { partitioned, alreadyPresent } shape', r1 && typeof r1.partitioned === 'boolean' && typeof r1.alreadyPresent === 'boolean');
assert('sets state.org.dataPartitioned flag', app.state.org.dataPartitioned === true);
assertEq('active project data stays null (live in working set)', app.state.org.projects['proj-f14f15'].data, null);
assert('inactive S1 project gets empty data stash',
       app.state.org.projects[extra.id].data && Array.isArray(app.state.org.projects[extra.id].data.commercial.ipcs) &&
       app.state.org.projects[extra.id].data.commercial.ipcs.length === 0);
const r2 = app.partitionProjectData();
assert('idempotency: second run is a no-op', r2.partitioned === false && r2.alreadyPresent === true);
assert('audit entry org.partition.create created',
       app.state.auditLog.slice(auditBefore).some(e => e.action === 'org.partition.create'));

/* ───────── GROUP 2 — Switch swaps the data partition ───────── */
section('Group 2 \u2014 switchActiveProject swaps the data partition');

/* Plant a sentinel in the active (F-14/F-15) working set. */
app.switchActiveProject('proj-f14f15');                 // ensure active
app.state.commercial.ipcSeq = 4242;
app.state.commercial.ipcs.push({ id: 'SENTINEL-IPC', gross: 999 });
app.state.execution.lookaheadDays = 21;
const f14ipcCount = app.state.commercial.ipcs.length;

const projB = app.addProject('pd-sindh', { name: 'Hyderabad Bypass' });
const okSwitch = app.switchActiveProject(projB.id);
assertEq('switch succeeds', okSwitch, true);
assertEq('activeProjectId moved to B', app.state.org.activeProjectId, projB.id);
assertEq('working set is now B\u2019s EMPTY slices (ipcSeq reset)', app.state.commercial.ipcSeq, 0);
assertEq('working set B has no IPCs', app.state.commercial.ipcs.length, 0);
assert('outgoing F-14/F-15 data stashed (sentinel preserved)',
       app.state.org.projects['proj-f14f15'].data &&
       app.state.org.projects['proj-f14f15'].data.commercial.ipcSeq === 4242 &&
       app.state.org.projects['proj-f14f15'].data.commercial.ipcs.some(i => i.id === 'SENTINEL-IPC'));
assertEq('incoming B data now null (live in working set)', app.state.org.projects[projB.id].data, null);

/* Mutate B's working set, then switch back — must NOT affect F-14/F-15. */
app.state.commercial.ipcSeq = 77;
app.switchActiveProject('proj-f14f15');
assertEq('round-trip: F-14/F-15 ipcSeq restored', app.state.commercial.ipcSeq, 4242);
assertEq('round-trip: F-14/F-15 IPC count restored', app.state.commercial.ipcs.length, f14ipcCount);
assert('round-trip: sentinel IPC present again', app.state.commercial.ipcs.some(i => i.id === 'SENTINEL-IPC'));
assertEq('round-trip: execution slice restored', app.state.execution.lookaheadDays, 21);
assert('B\u2019s mutation isolated in its stash (ipcSeq 77, not bleeding into F-14/F-15)',
       app.state.org.projects[projB.id].data.commercial.ipcSeq === 77);

/* ───────── GROUP 3 — No-bleed + save/load round-trip ───────── */
section('Group 3 \u2014 No-bleed isolation + save/load round-trip');
assert('top-level slices still directly readable (refs intact)',
       Array.isArray(app.state.commercial.ipcs) && typeof app.state.execution === 'object' &&
       typeof app.state.procurement === 'object' && typeof app.state.financial === 'object');
assert('hydrated empty project has well-formed procurement slice (ensure ran)',
       (function(){ app.switchActiveProject(projB.id);
         const ok = app.state.procurement && Array.isArray(app.state.procurement.demands) && app.state.procurement.ui;
         app.switchActiveProject('proj-f14f15'); return ok; })());

/* save/load round-trip preserves partitions */
app.saveState();
const raw = global.localStorage.getItem('fgeha_nlc_unified_v1');
assert('state serialised to storage', !!raw);
const reparsed = JSON.parse(raw);
assert('serialised state carries org.projects partitions',
       reparsed.org && reparsed.org.projects[projB.id] && 'data' in reparsed.org.projects[projB.id]);
assert('serialised active project data is null (working-set invariant)',
       reparsed.org.projects[reparsed.org.activeProjectId].data === null);
assert('serialised inactive project retains its stash',
       reparsed.org.projects[projB.id].data === null ? false :
       (reparsed.org.projects[projB.id].data && reparsed.org.projects[projB.id].data.commercial.ipcSeq === 77));

console.log('\n' + '\u2550'.repeat(74));
console.log(` DATA PARTITIONING TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

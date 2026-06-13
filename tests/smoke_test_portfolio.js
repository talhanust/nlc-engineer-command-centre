/* ============================================================
   SMOKE TEST — Portfolio Rollup (Phase C S3, v1.6.0)
   ============================================================
   Group 1 — Compute integrity (swap-compute-swap is non-destructive)
   Group 2 — Rollup correctness (totals reconcile to rows)
   Group 3 — Render + drill-through
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
      classList: { _set:new Set(), add(c){this._set.add(c);}, remove(c){this._set.delete(c);}, toggle(c,on){ if(on===undefined) this._set.has(c)?this._set.delete(c):this._set.add(c); else on?this._set.add(c):this._set.delete(c);}, contains(c){return this._set.has(c);} },
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
    ' state, computePortfolio, renderPortfolio, openProjectFromPortfolio, computeAllKpis,' +
    ' switchActiveProject, switchModule, addProject, migrateToOrgTree, partitionProjectData };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' PORTFOLIO ROLLUP SMOKE TEST \u2014 Phase C Session 3 (v1.6.0)');
console.log('\u2550'.repeat(74));

/* Fresh org with a second populated project + an empty one. */
delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();

/* Plant known IPCs in the active (F-14/F-15) working set. */
app.switchActiveProject('proj-f14f15');
app.state.commercial.ipcs.push({ id: 'PF-IPC-1', gross: 1000, status: 'paid', vettedGross: 1000, paidAmount: 1000, paidAt: '2026-04-01', netPayable: 1000 });
app.state.commercial.ipcs.push({ id: 'PF-IPC-2', gross: 500, status: 'draft' });

/* A second project with its own (different) IPC, and an empty third. */
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass', client: { name: 'NHA', contractValue: 5000000000 } });
const projC = app.addProject('pd-kpk', { name: 'Empty Project' });
/* seed projB's stash directly with a known IPC */
projB.data.commercial.ipcs.push({ id: 'B-IPC-1', gross: 250, status: 'draft' });

/* ───────── GROUP 1 — Compute integrity ───────── */
section('Group 1 \u2014 Compute integrity (swap-compute-swap is non-destructive)');
assert('computePortfolio callable', typeof app.computePortfolio === 'function');

const commercialRefBefore = app.state.commercial;
const activeGrossDirect   = app.computeAllKpis(null).grossRevenue;     // direct, on live working set
const f14IpcCountBefore   = app.state.commercial.ipcs.length;
const bStashIpcBefore     = app.state.org.projects[projB.id].data.commercial.ipcs.length;

const pf = app.computePortfolio();
assert('returns { rows, totals, activeProjectId }', pf && Array.isArray(pf.rows) && pf.totals && 'activeProjectId' in pf);
assertEq('one row per project', pf.rows.length, Object.keys(app.state.org.projects).length);
assert('rows carry project metadata', pf.rows.every(r => r.name && r.pdHqId && 'contractValue' in r));

/* The critical safety property: working set restored reference-identical. */
assert('working set restored REFERENCE-identical after compute', app.state.commercial === commercialRefBefore);
assertEq('active working set values unchanged (IPC count)', app.state.commercial.ipcs.length, f14IpcCountBefore);
assert('active project still has its planted IPCs', app.state.commercial.ipcs.some(i => i.id === 'PF-IPC-1'));
assertEq('inactive project stash NOT mutated by compute', app.state.org.projects[projB.id].data.commercial.ipcs.length, bStashIpcBefore);

/* Reconciliation: active row KPIs == direct computeAllKpis (same path, no parallel arithmetic). */
const activeRow = pf.rows.find(r => r.id === 'proj-f14f15');
assert('active project row present', !!activeRow);
assertEq('RECONCILES: active row grossRevenue == direct computeAllKpis', activeRow.grossRevenue, activeGrossDirect);
assert('active row gross reflects planted IPCs (>= 1500)', activeRow.grossRevenue >= 1500);

/* ───────── GROUP 2 — Rollup correctness ───────── */
section('Group 2 \u2014 Rollup correctness');
assertEq('totals.projectCount == project count', pf.totals.projectCount, pf.rows.length);
const sum = key => pf.rows.reduce((s, r) => s + Number(r[key] || 0), 0);
assertEq('totals.contractValue == \u03a3 rows', pf.totals.contractValue, sum('contractValue'));
assertEq('totals.grossRevenue == \u03a3 rows', pf.totals.grossRevenue, sum('grossRevenue'));
assertEq('totals.netReceivable == \u03a3 rows', pf.totals.netReceivable, sum('netReceivable'));
const bRow = pf.rows.find(r => r.id === projB.id);
assert('project B gross reflects its OWN stash (250), isolated from active', bRow && bRow.grossRevenue === 250);
const cRow = pf.rows.find(r => r.id === projC.id);
assert('empty project row has zero gross', cRow && cRow.grossRevenue === 0);
assert('exactly one row flagged isActive', pf.rows.filter(r => r.isActive).length === 1 && activeRow.isActive);

/* ───────── GROUP 3 — Render + drill-through ───────── */
section('Group 3 \u2014 Render + drill-through');
app.switchModule('portfolio');               // triggers lazy render via hook
const host = elements['portfolioHost'];
assert('renderPortfolio populates portfolioHost', host && host.innerHTML.length > 0);
assert('table renders a row per project (name present)',
       host.innerHTML.includes('F-14/15 Islamabad') && host.innerHTML.includes('Lahore Bypass') && host.innerHTML.includes('Empty Project'));
assert('active project marked in render', host.innerHTML.includes('pf-active') && host.innerHTML.includes('pf-badge'));
assert('totals row present', host.innerHTML.includes('pf-total') && host.innerHTML.includes('Total'));

/* drill-through opens project B (reuses S2 swap) */
app.openProjectFromPortfolio(projB.id);
assertEq('drill-through sets active project to B', app.state.org.activeProjectId, projB.id);
assertEq('drill-through navigates to executive module', app.state.ui.activeModule, 'executive');
assert('drill-through swapped working set to B (its IPC now live)',
       app.state.commercial.ipcs.some(i => i.id === 'B-IPC-1'));
assert('drill-through stashed F-14/F-15 (planted IPC now in stash)',
       app.state.org.projects['proj-f14f15'].data.commercial.ipcs.some(i => i.id === 'PF-IPC-1'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` PORTFOLIO ROLLUP TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

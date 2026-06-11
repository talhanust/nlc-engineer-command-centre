/* ============================================================
   SMOKE TEST — Aggregated Cash Flow + Navigator (Phase D S2, v1.14.0)
   ============================================================
   Group 1 — Cash-flow aggregation (reconciles, scopes, non-destructive)
   Group 2 — Top-bar org navigator
   Group 3 — Command-center integration
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
global.confirm = () => true; global.alert = () => {}; global.prompt = () => ''; global.toast = () => {};
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
    ' state, computeNodeCashFlow, renderNodeCashFlowHtml, renderOrgNavigator, renderCommandCenter,' +
    ' computeCashFlowByMonth, setActiveNode, switchActiveProject, addProject, switchModule,' +
    ' migrateToOrgTree, partitionProjectData, migrateAccessControl };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }
const monthOf = (series, mk) => series.find(b => b.monthKey === mk) || { receipts:0, payments:0, net:0, cumulative:0 };

console.log('\u2550'.repeat(74));
console.log(' CASH FLOW + NAVIGATOR SMOKE TEST \u2014 Phase D Session 2 (v1.14.0)');
console.log('\u2550'.repeat(74));

delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();
app.migrateAccessControl();

/* Seed cash-flow data. proj-f14f15 (pd-north, active working set). */
app.switchActiveProject('proj-f14f15');
app.state.financial = app.state.financial || {};
app.state.financial.receipts = [{ paidAt: '2026-03-15', amount: 1000 }];
app.state.financial.payments = [{ paidAt: '2026-03-20', amount: 400 }];

/* projB (pd-centre, stash). */
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass' });
projB.data.financial = projB.data.financial || {};
projB.data.financial.receipts = [{ paidAt: '2026-03-10', amount: 500 }];
projB.data.financial.payments = [{ paidAt: '2026-04-05', amount: 200 }];

/* ───────── GROUP 1 — Cash-flow aggregation ───────── */
section('Group 1 \u2014 Cash-flow aggregation');
assert('computeNodeCashFlow callable', typeof app.computeNodeCashFlow === 'function');

const north = app.computeNodeCashFlow('pd-north');
const directNorth = app.computeCashFlowByMonth();   // active = proj-f14f15
assertEq('RECONCILES: pd-north Mar receipts == project computeCashFlowByMonth',
         monthOf(north, '2026-03').receipts, monthOf(directNorth, '2026-03').receipts);

const root = app.computeNodeCashFlow('hq-nlc');
const centre = app.computeNodeCashFlow('pd-centre');
assertEq('root Mar receipts aggregates both projects', monthOf(root, '2026-03').receipts, 1500);
assert('SCOPING: root Mar receipts == north + centre',
       monthOf(root, '2026-03').receipts === monthOf(north, '2026-03').receipts + monthOf(centre, '2026-03').receipts);
assertEq('root Mar net = 1500 - 400', monthOf(root, '2026-03').net, 1100);
assertEq('root Apr net = -200 (centre payment)', monthOf(root, '2026-04').net, -200);
assertEq('root Apr cumulative = 1100 + (-200) = 900', monthOf(root, '2026-04').cumulative, 900);
assert('months sorted chronologically', root.map(b => b.monthKey).join(',') === [...root.map(b => b.monthKey)].sort().join(','));

/* non-destructive */
const ref = app.state.commercial;
app.computeNodeCashFlow('hq-nlc');
assert('working set restored REFERENCE-identical after cash-flow rollup', app.state.commercial === ref);

/* ───────── GROUP 2 — Top-bar navigator ───────── */
section('Group 2 \u2014 Top-bar org navigator');
app.state.org.activeNodeId = 'hq-engrs';
app.renderOrgNavigator();
const nav = elements['orgNavHost'].innerHTML;
assert('navigator populates orgNavHost', nav.length > 0 && nav.includes('orgNavSelect'));
assert('navigator lists tree nodes', nav.includes('HQ NLC') && nav.includes('HQ Engrs') && nav.includes('HQ PD North'));
assert('navigator lists projects as leaves', nav.includes('F-14/15 Islamabad') && nav.includes('Lahore Bypass'));
assert('navigator marks the active node selected', /value="hq-engrs"\s+selected/.test(nav));
assert('navigator onchange wired to setActiveNode', nav.includes('setActiveNode(this.value)'));

/* ───────── GROUP 3 — Command-center integration ───────── */
section('Group 3 \u2014 Command-center integration');
app.state.org.activeNodeId = 'hq-nlc';
app.switchModule('command');
const host = elements['commandHost'].innerHTML;
assert('command center includes the cash-flow section', host.includes('cmd-cashflow') && host.includes('Aggregated cash flow'));
assert('cash-flow table shows aggregated months', host.includes('2026-03') && host.includes('2026-04'));
assert('cash-flow chart svg rendered (reused renderCashFlowChart)', host.includes('<svg') || host.includes('cmd-cf-chart'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` CASH FLOW + NAVIGATOR TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

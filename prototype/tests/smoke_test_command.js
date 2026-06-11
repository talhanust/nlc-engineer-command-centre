/* ============================================================
   SMOKE TEST — Hierarchical Command Center (Phase D S1, v1.13.0)
   ============================================================
   Group 1 — Subtree scoping + rollup (non-destructive, reconciles)
   Group 2 — Node navigation (active node, leaf vs branch)
   Group 3 — Render (breadcrumb, KPI strip, drill-down)
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
    ' state, getActiveNode, setActiveNode, computeNodeRollup, renderCommandCenter, computeAllKpis,' +
    ' _subtreePdHqIds, _projectsUnderNode, _immediateChildNodes, _nodePath, switchModule,' +
    ' switchActiveProject, addProject, migrateToOrgTree, partitionProjectData, migrateAccessControl };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' COMMAND CENTER SMOKE TEST \u2014 Phase D Session 1 (v1.13.0)');
console.log('\u2550'.repeat(74));

delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();
app.migrateAccessControl();

/* proj-f14f15 under pd-north: plant a known gross. */
app.switchActiveProject('proj-f14f15');
app.state.commercial.ipcs.push({ id: 'N1', gross: 1000, status: 'draft' });

/* Two projects under pd-centre. */
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass', client: { contractValue: 5e9 } });
const projC = app.addProject('pd-centre', { name: 'Multan Loop', client: { contractValue: 3e9 } });
projB.data.commercial.ipcs.push({ id: 'B1', gross: 250, status: 'draft' });
projC.data.commercial.ipcs.push({ id: 'C1', gross: 700, status: 'draft' });

/* v1.21.0 — switchActiveProject now also sets the active node (header follows
   the picked project). The switches above are data-setup, not user navigation,
   so restore the boot default (root) before checking it. */
app.state.org.activeNodeId = 'hq-nlc';

/* ───────── GROUP 1 — Subtree scoping + rollup ───────── */
section('Group 1 \u2014 Subtree scoping + rollup');
assertEq('default active node is root (hq-nlc)', app.getActiveNode().id, 'hq-nlc');
assertEq('subtree of hq-nlc has all 5 PD HQs', app._subtreePdHqIds('hq-nlc').length, 5);
assertEq('subtree of a single PD = just itself', app._subtreePdHqIds('pd-north').length, 1);
assertEq('projects under pd-centre = 2', app._projectsUnderNode('pd-centre').length, 2);
assertEq('projects under hq-nlc = 3 (all live)', app._projectsUnderNode('hq-nlc').length, 3);

const rRoot = app.computeNodeRollup('hq-nlc');
const rEngrs = app.computeNodeRollup('hq-engrs');
const rNorth = app.computeNodeRollup('pd-north');
const rCentre = app.computeNodeRollup('pd-centre');
assertEq('root rollup projectCount = 3', rRoot.totals.projectCount, 3);
assertEq('hq-engrs rollup == root (same project set)', rEngrs.totals.grossRevenue, rRoot.totals.grossRevenue);
assertEq('pd-north rollup projectCount = 1', rNorth.totals.projectCount, 1);
assertEq('pd-centre rollup projectCount = 2', rCentre.totals.projectCount, 2);
assert('SCOPING: root gross == north + centre gross',
       rRoot.totals.grossRevenue === rNorth.totals.grossRevenue + rCentre.totals.grossRevenue);

/* non-destructive: working set restored reference-identical */
const ref = app.state.commercial;
app.computeNodeRollup('hq-nlc');
assert('working set restored REFERENCE-identical after rollup', app.state.commercial === ref);

/* reconciliation: pd-north single-project rollup == that project's computeAllKpis */
app.switchActiveProject('proj-f14f15');
const direct = app.computeAllKpis(null).grossRevenue;
assertEq('RECONCILES: pd-north gross == proj computeAllKpis', app.computeNodeRollup('pd-north').totals.grossRevenue, direct);

/* ───────── GROUP 2 — Node navigation ───────── */
section('Group 2 \u2014 Node navigation');
assertEq('_nodePath(project) is 4 deep (hq-nlc\u2192engrs\u2192pd\u2192project)', app._nodePath('proj-f14f15').length, 4);
assertEq('_nodePath root element is hq-nlc', app._nodePath('proj-f14f15')[0].id, 'hq-nlc');
assertEq('immediate children of hq-nlc = 1 (hq-engrs)', app._immediateChildNodes('hq-nlc').length, 1);
assertEq('immediate children of hq-engrs = 5 PDs', app._immediateChildNodes('hq-engrs').length, 5);
assertEq('immediate children of pd-centre = 2 projects', app._immediateChildNodes('pd-centre').length, 2);
assert('children of a PD are project-typed', app._immediateChildNodes('pd-centre').every(c => c.type === 'project'));

assertEq('setActiveNode(branch) sets activeNodeId', (function(){ app.setActiveNode('pd-centre'); return app.state.org.activeNodeId; })(), 'pd-centre');
/* leaf navigation switches active project + opens executive */
app.setActiveNode(projB.id);
assertEq('setActiveNode(project) makes it the active project', app.state.org.activeProjectId, projB.id);
assertEq('setActiveNode(project) navigates to executive module', app.state.ui.activeModule, 'executive');

/* ───────── GROUP 3 — Render ───────── */
section('Group 3 \u2014 Render');
app.state.org.activeNodeId = 'hq-engrs';
app.switchModule('command');                 // triggers lazy render
const host = elements['commandHost'];
assert('renderCommandCenter populates commandHost', host && host.innerHTML.length > 0);
assert('breadcrumb present', host.innerHTML.includes('cmd-breadcrumb'));
assert('KPI strip present', host.innerHTML.includes('cmd-kpis'));
assert('drill-down rows present + clickable', host.innerHTML.includes('cmd-row') && host.innerHTML.includes('setActiveNode('));
assert('at hq-engrs, children shown are the PD HQs', host.innerHTML.includes('HQ PD North') && host.innerHTML.includes('HQ PD Centre'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` COMMAND CENTER TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

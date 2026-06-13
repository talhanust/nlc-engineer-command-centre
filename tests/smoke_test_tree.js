/* ============================================================
   SMOKE TEST — Editable PD-HQ Tree (Phase C S5, v1.8.0)
   ============================================================
   Group 1 — PD-HQ CRUD (add / rename)
   Group 2 — removePdHq guards
   Group 3 — reparentProject + integration
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
    ' state, addPdHq, renamePdHq, removePdHq, reparentProject, _pdHqList, _findNodeInTree,' +
    ' getProjectsByPdHq, renderProjectSwitcher, renderSettingsProjectsTab, addProject,' +
    ' migrateToOrgTree, partitionProjectData };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' EDITABLE PD-HQ TREE SMOKE TEST \u2014 Phase C Session 5 (v1.8.0)');
console.log('\u2550'.repeat(74));

delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();

/* ───────── GROUP 1 — PD-HQ CRUD ───────── */
section('Group 1 \u2014 PD-HQ CRUD (add / rename)');
assert('addPdHq callable', typeof app.addPdHq === 'function');
const seededCount = app._pdHqList().length;
assertEq('starts with 5 seeded PD HQs', seededCount, 5);

const auditA = app.state.auditLog.length;
const hqNew = app.addPdHq('HQ PD Gilgit');
assert('addPdHq creates a pd_hq node', hqNew && hqNew.type === 'pd_hq' && hqNew.name === 'HQ PD Gilgit');
assert('new HQ attached under HQ Engrs', (function(){ const e = app._findNodeInTree('hq-engrs'); return e.children.some(c => c.id === hqNew.id); })());
assertEq('PD HQ count grew to 6', app._pdHqList().length, 6);
assert('addPdHq audited (org.pdhq.add)', app.state.auditLog.slice(auditA).some(e => e.action === 'org.pdhq.add' && e.refId === hqNew.id));
assertEq('addPdHq with empty name → null', app.addPdHq('   '), null);

const auditR = app.state.auditLog.length;
assertEq('renamePdHq updates name', app.renamePdHq(hqNew.id, 'HQ PD Gilgit-Baltistan'), true);
assertEq('rename reflected', app._findNodeInTree(hqNew.id).name, 'HQ PD Gilgit-Baltistan');
const renA = app.state.auditLog.slice(auditR).find(e => e.action === 'org.pdhq.rename');
assert('rename audited before\u2192after', renA && renA.before.name === 'HQ PD Gilgit' && renA.after.name === 'HQ PD Gilgit-Baltistan');
assertEq('renamePdHq on a non-pd_hq node (hq-nlc) → false', app.renamePdHq('hq-nlc', 'X'), false);

/* ───────── GROUP 2 — removePdHq guards ───────── */
section('Group 2 \u2014 removePdHq guards');
assertEq('remove empty PD HQ succeeds', app.removePdHq(hqNew.id).ok, true);
assertEq('PD HQ count back to 5', app._pdHqList().length, 5);
assertEq('remove non-existent → not_found', app.removePdHq('pd-nope').reason, 'not_found');
/* pd-north holds F-14/F-15 → has_projects */
assertEq('remove HQ with projects → has_projects', app.removePdHq('pd-north').reason, 'has_projects');

/* last_pdhq guard via a minimal white-box tree */
const savedTree = app.state.org.tree, savedProjects = app.state.org.projects;
app.state.org.tree = { id:'hq-nlc', type:'hq', children:[{ id:'hq-engrs', type:'hq_engrs', children:[{ id:'only-hq', name:'Only', type:'pd_hq', children:[] }] }] };
app.state.org.projects = {};
assertEq('remove the LAST PD HQ → last_pdhq', app.removePdHq('only-hq').reason, 'last_pdhq');
app.state.org.tree = savedTree; app.state.org.projects = savedProjects;

/* ───────── GROUP 3 — reparent + integration ───────── */
section('Group 3 \u2014 reparentProject + integration');
assert('reparentProject callable', typeof app.reparentProject === 'function');
assertEq('F-14/F-15 starts under pd-north', app.state.org.projects['proj-f14f15'].pdHqId, 'pd-north');

const auditRe = app.state.auditLog.length;
assertEq('reparent to pd-centre succeeds', app.reparentProject('proj-f14f15', 'pd-centre'), true);
assertEq('project pdHqId updated', app.state.org.projects['proj-f14f15'].pdHqId, 'pd-centre');
const reA = app.state.auditLog.slice(auditRe).find(e => e.action === 'org.project.reparent');
assert('reparent audited before\u2192after', reA && reA.before.pdHqId === 'pd-north' && reA.after.pdHqId === 'pd-centre');
assert('getProjectsByPdHq: now under pd-centre', app.getProjectsByPdHq('pd-centre').some(p => p.id === 'proj-f14f15'));
assert('getProjectsByPdHq: gone from pd-north', !app.getProjectsByPdHq('pd-north').some(p => p.id === 'proj-f14f15'));
assertEq('reparent to invalid HQ → false', app.reparentProject('proj-f14f15', 'pd-bogus'), false);
assertEq('reparent to same HQ → false', app.reparentProject('proj-f14f15', 'pd-centre'), false);

/* pd-north is now empty → removable */
assertEq('pd-north removable after reparent (now empty)', app.removePdHq('pd-north').ok, true);
assert('pd-north gone from tree', !app._findNodeInTree('pd-north'));

/* render integration */
app.renderProjectSwitcher();
assert('switcher shows project under its new HQ (HQ PD Centre)',
       elements['projectSwitcherHost'].innerHTML.includes('HQ PD Centre') &&
       elements['projectSwitcherHost'].innerHTML.includes('F-14/15 Islamabad'));
app.renderSettingsProjectsTab();
const setHtml = elements['dxProjectsTree'].innerHTML;
assert('settings shows Rename/Add-PD-HQ controls', setHtml.includes('promptRenamePdHq') && setHtml.includes('orgAddHqName'));
assert('settings shows reparent select', setHtml.includes('org-reparent'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` EDITABLE PD-HQ TREE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

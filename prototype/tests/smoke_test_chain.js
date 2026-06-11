/* ============================================================
   SMOKE TEST — Approval-Chain Routing (Phase C S8, v1.11.0)
   ============================================================
   Group 1 — Accessor + PERMISSIONS fallback (default behaviour intact)
   Group 2 — Override + LIVE wiring (canDo changes; per-project isolation)
   Group 3 — Reset + editor render
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
    ' state, getActionRoles, isActionOverridden, setActionRoleOverride, resetActionOverride,' +
    ' renderApprovalChainHtml, canDo, requireRole, getActiveProject, switchActiveProject,' +
    ' addProject, migrateToOrgTree, partitionProjectData, migrateAccessControl, renderSettingsProjectsTab,' +
    ' PERMISSIONS: (typeof PERMISSIONS !== "undefined") ? PERMISSIONS : null };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' APPROVAL-CHAIN ROUTING SMOKE TEST \u2014 Phase C Session 8 (v1.11.0)');
console.log('\u2550'.repeat(74));

delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();
app.migrateAccessControl();
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass' });
app.migrateAccessControl();
app.state.session = app.state.session || {};
app.state.session.role = 'qs';
app.switchActiveProject('proj-f14f15');

/* ───────── GROUP 1 — Accessor + fallback ───────── */
section('Group 1 \u2014 Accessor + PERMISSIONS fallback');
assert('getActionRoles callable', typeof app.getActionRoles === 'function');
assert('no override → equals PERMISSIONS default (ipc.vet)',
       JSON.stringify(app.getActionRoles('ipc.vet').slice().sort()) === JSON.stringify((app.PERMISSIONS['ipc.vet']).slice().sort()));
assertEq('default: qs cannot vet IPC (canDo)', app.canDo('ipc.vet'), false);
assertEq('default: qs CAN draft IPC (canDo)', app.canDo('ipc.draft'), true);
assert('admin always retained in getActionRoles', app.getActionRoles('ipc.draft').indexOf('admin') !== -1);

/* ───────── GROUP 2 — Override + live wiring ───────── */
section('Group 2 \u2014 Override + LIVE wiring');
const auditO = app.state.auditLog.length;
assertEq('grant qs to ipc.vet (override)', app.setActionRoleOverride('ipc.vet', 'qs', true), true);
assert('getActionRoles(ipc.vet) now includes qs', app.getActionRoles('ipc.vet').indexOf('qs') !== -1);
assertEq('LIVE WIRING: qs canDo(ipc.vet) now true', app.canDo('ipc.vet'), true);
assert('override audited (org.chain.set)', app.state.auditLog.slice(auditO).some(e => e.action === 'org.chain.set'));
assertEq('isActionOverridden(ipc.vet) true', app.isActionOverridden('ipc.vet'), true);

/* removing the default role from the override takes effect live */
app.setActionRoleOverride('ipc.vet', 'preaudit', false);
assertEq('LIVE: preaudit now cannot vet on this project', (function(){ app.state.session.role='preaudit'; const r=app.canDo('ipc.vet'); app.state.session.role='qs'; return r; })(), false);
assertEq('admin still can vet (retained)', (function(){ app.state.session.role='admin'; const r=app.canDo('ipc.vet'); app.state.session.role='qs'; return r; })(), true);

/* per-project isolation: project B has no override → inherits default */
app.switchActiveProject(projB.id);
assertEq('project B (no override): qs canDo(ipc.vet) false (inherits default)', app.canDo('ipc.vet'), false);
app.switchActiveProject('proj-f14f15');
assertEq('back on F-14/F-15: override still applies (qs can vet)', app.canDo('ipc.vet'), true);

assertEq('cannot override admin → false', app.setActionRoleOverride('ipc.vet', 'admin', false), false);
assertEq('unknown action → false', app.setActionRoleOverride('bogus.action', 'qs', true), false);

/* ───────── GROUP 3 — Reset + editor render ───────── */
section('Group 3 \u2014 Reset + editor render');
const auditR = app.state.auditLog.length;
assertEq('resetActionOverride(ipc.vet) → true', app.resetActionOverride('ipc.vet'), true);
assertEq('after reset: isActionOverridden false', app.isActionOverridden('ipc.vet'), false);
assertEq('after reset: qs canDo(ipc.vet) false again (default restored)', app.canDo('ipc.vet'), false);
assert('reset audited (org.chain.reset)', app.state.auditLog.slice(auditR).some(e => e.action === 'org.chain.reset'));

app.renderSettingsProjectsTab();
const setHtml = elements['dxProjectsTree'].innerHTML;
assert('approval-chain editor renders in Settings', setHtml.includes('org-chain-table') && setHtml.includes('Approval chain'));
assert('editor groups actions by pipeline (ipc / rar present)', setHtml.includes('>ipc<') && setHtml.includes('>rar<'));
assert('editor wires setActionRoleOverride checkboxes', (setHtml.match(/setActionRoleOverride\(/g) || []).length > 50);

console.log('\n' + '\u2550'.repeat(74));
console.log(` APPROVAL-CHAIN ROUTING TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

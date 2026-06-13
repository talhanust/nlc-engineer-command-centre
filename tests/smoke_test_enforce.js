/* ============================================================
   SMOKE TEST — Access Enforcement (Phase C S7, v1.10.0)
   ============================================================
   Group 1 — Enforcement composes with the existing action gates
   Group 2 — Read-only is project-scoped + reversible
   Group 3 — Switcher read-only badge
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
let _toasts = [];
global.toast = (msg) => { _toasts.push(msg); };
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
    ' state, _activeProjectAccessible, canDo, requireRole, canAccessProject, setProjectRoleAccess,' +
    ' renderProjectSwitcher, switchActiveProject, addProject, migrateToOrgTree, partitionProjectData, migrateAccessControl };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' ACCESS ENFORCEMENT SMOKE TEST \u2014 Phase C Session 7 (v1.10.0)');
console.log('\u2550'.repeat(74));

delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();
app.migrateAccessControl();
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass' });
app.migrateAccessControl();                       // give B an access list too
app.state.session = app.state.session || {};
app.state.session.role = 'qs';
app.switchActiveProject('proj-f14f15');

/* ───────── GROUP 1 — Enforcement composes with action gates ───────── */
section('Group 1 \u2014 Enforcement composes with action gates');
assert('_activeProjectAccessible callable', typeof app._activeProjectAccessible === 'function');
assertEq('accessible active project → _activeProjectAccessible true', app._activeProjectAccessible(), true);
assertEq('qs can draft IPC when accessible (canDo)', app.canDo('ipc.draft'), true);
assertEq('action gate still applies: qs cannot pay IPC (intersection)', app.canDo('ipc.pay'), false);

/* revoke qs from the active project → read-only */
app.setProjectRoleAccess('proj-f14f15', 'qs', false);
assertEq('after revoke: _activeProjectAccessible false', app._activeProjectAccessible(), false);
assertEq('read-only: canDo(ipc.draft) now false', app.canDo('ipc.draft'), false);
assertEq('read-only: requireRole(ipc.draft) false (toast path)', app.requireRole('ipc.draft'), false);
assertEq('read-only: requireRole(ipc.draft, silent) false too', app.requireRole('ipc.draft', { silent: true }), false);
assertEq('read-only: even an unknown action is blocked', app.canDo('some.unknown.action'), false);

/* admin bypass: same revoked project, role admin */
app.state.session.role = 'admin';
assertEq('admin: _activeProjectAccessible true (bypass)', app._activeProjectAccessible(), true);
assertEq('admin can act despite revoked non-admin roles', app.canDo('ipc.draft'), true);
app.state.session.role = 'qs';

/* ───────── GROUP 2 — Project-scoped + reversible ───────── */
section('Group 2 \u2014 Read-only is project-scoped + reversible');
app.setProjectRoleAccess('proj-f14f15', 'qs', true);    // restore
assertEq('restore: _activeProjectAccessible true again', app._activeProjectAccessible(), true);
assertEq('restore: canDo(ipc.draft) true again', app.canDo('ipc.draft'), true);

/* enforcement keys off the ACTIVE project only */
app.setProjectRoleAccess(projB.id, 'qs', false);        // revoke qs on the OTHER project
assertEq('revoking a non-active project does not make active read-only', app._activeProjectAccessible(), true);
assertEq('still able to act on accessible active project', app.canDo('ipc.draft'), true);

/* non-project context is permissive */
const savedOrg = app.state.org; delete app.state.org;
assertEq('no org context → _activeProjectAccessible permissive', app._activeProjectAccessible(), true);
assertEq('no org context → action gate alone governs (qs draft ok)', app.canDo('ipc.draft'), true);
app.state.org = savedOrg;

/* ───────── GROUP 3 — Switcher read-only badge ───────── */
section('Group 3 \u2014 Switcher read-only badge');
app.setProjectRoleAccess('proj-f14f15', 'qs', false);   // active becomes inaccessible to qs
app.renderProjectSwitcher();
assert('switcher shows read-only badge when active inaccessible',
       elements['projectSwitcherHost'].innerHTML.includes('ro-badge') && elements['projectSwitcherHost'].innerHTML.includes('read-only'));
app.setProjectRoleAccess('proj-f14f15', 'qs', true);
app.renderProjectSwitcher();
assert('switcher hides badge when accessible', !elements['projectSwitcherHost'].innerHTML.includes('ro-badge'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` ACCESS ENFORCEMENT TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

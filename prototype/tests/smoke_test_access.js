/* ============================================================
   SMOKE TEST — Access Control Foundation (Phase C S6, v1.9.0)
   ============================================================
   Group 1 — Migration + accessors
   Group 2 — setProjectRoleAccess (grant / revoke / guards)
   Group 3 — Switcher filtering + access matrix render
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
    ' state, migrateAccessControl, canAccessProject, getAccessibleProjects, setProjectRoleAccess,' +
    ' renderAccessMatrixHtml, renderProjectSwitcher, renderSettingsProjectsTab, addProject,' +
    ' switchActiveProject, migrateToOrgTree, partitionProjectData, _accessRoleKeys };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' ACCESS CONTROL SMOKE TEST \u2014 Phase C Session 6 (v1.9.0)');
console.log('\u2550'.repeat(74));

delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass' });
app.state.session = app.state.session || {};
app.state.session.role = 'qs';                  // current session role for the tests

/* ───────── GROUP 1 — Migration + accessors ───────── */
section('Group 1 \u2014 Migration + accessors');
assert('migrateAccessControl callable', typeof app.migrateAccessControl === 'function');
const auditA = app.state.auditLog.length;
const r1 = app.migrateAccessControl();
assert('returns { migrated, alreadyPresent }', r1 && typeof r1.migrated === 'boolean');
assert('every project gets an access.roles list', Object.values(app.state.org.projects).every(p => p.access && Array.isArray(p.access.roles)));
assert('default grants all non-admin roles', app.state.org.projects['proj-f14f15'].access.roles.length === app._accessRoleKeys().length);
assert('access list excludes admin (implicit)', app.state.org.projects['proj-f14f15'].access.roles.indexOf('admin') === -1);
assert('sets state.org.accessMigrated', app.state.org.accessMigrated === true);
const r2 = app.migrateAccessControl();
assert('idempotency: second run is a no-op', r2.migrated === false && r2.alreadyPresent === true);
assert('audited org.access.migrate', app.state.auditLog.slice(auditA).some(e => e.action === 'org.access.migrate'));

assertEq('canAccessProject: admin always true', app.canAccessProject('proj-f14f15', 'admin'), true);
assertEq('canAccessProject: permitted role → true', app.canAccessProject('proj-f14f15', 'qs'), true);
assertEq('getAccessibleProjects(qs) sees all (default)', app.getAccessibleProjects('qs').length, Object.values(app.state.org.projects).filter(p => !p.archived).length);

/* ───────── GROUP 2 — setProjectRoleAccess ───────── */
section('Group 2 \u2014 setProjectRoleAccess (grant / revoke / guards)');
assert('setProjectRoleAccess callable', typeof app.setProjectRoleAccess === 'function');
const auditS = app.state.auditLog.length;
assertEq('revoke qs from project B', app.setProjectRoleAccess(projB.id, 'qs', false), true);
assertEq('canAccessProject(B, qs) now false', app.canAccessProject(projB.id, 'qs'), false);
assert('revoke audited (org.access.set)', app.state.auditLog.slice(auditS).some(e => e.action === 'org.access.set' && e.refId === projB.id));
assert('getAccessibleProjects(qs) no longer includes B', !app.getAccessibleProjects('qs').some(p => p.id === projB.id));
assertEq('other roles unaffected (pm still has B)', app.canAccessProject(projB.id, 'pm'), true);
assertEq('grant qs back to B', app.setProjectRoleAccess(projB.id, 'qs', true), true);
assertEq('canAccessProject(B, qs) true again', app.canAccessProject(projB.id, 'qs'), true);
assertEq('cannot toggle admin → false', app.setProjectRoleAccess(projB.id, 'admin', false), false);
assertEq('invalid role → false', app.setProjectRoleAccess(projB.id, 'bogus', true), false);
const auditNoop = app.state.auditLog.length;
assertEq('no-op (already permitted) → true', app.setProjectRoleAccess(projB.id, 'qs', true), true);
assertEq('no-op writes no audit entry', app.state.auditLog.length, auditNoop);

/* ───────── GROUP 3 — Switcher filtering + matrix ───────── */
section('Group 3 \u2014 Switcher filtering + access matrix');
/* Revoke qs from the NON-active project B → switcher (role qs) should hide B. */
app.switchActiveProject('proj-f14f15');
app.setProjectRoleAccess(projB.id, 'qs', false);
app.renderProjectSwitcher();
let sw = elements['projectSwitcherHost'].innerHTML;
assert('switcher hides project inaccessible to current role', !sw.includes('Lahore Bypass'));
assert('switcher still shows accessible active project', sw.includes('F-14/15 Islamabad'));

/* Revoke qs from the ACTIVE project → it must STILL appear (never strand the user). */
app.setProjectRoleAccess('proj-f14f15', 'qs', false);
app.renderProjectSwitcher();
sw = elements['projectSwitcherHost'].innerHTML;
assert('active project stays visible even if inaccessible to role', sw.includes('F-14/15 Islamabad'));
app.setProjectRoleAccess('proj-f14f15', 'qs', true);   // restore

app.renderSettingsProjectsTab();
const setHtml = elements['dxProjectsTree'].innerHTML;
assert('access matrix renders in Settings', setHtml.includes('org-access-table') && setHtml.includes('Project access'));
assert('matrix has a checkbox column per non-admin role', (setHtml.match(/setProjectRoleAccess\(/g) || []).length >= app._accessRoleKeys().length);
assert('matrix omits the admin column', !setHtml.includes('>admin<'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` ACCESS CONTROL TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

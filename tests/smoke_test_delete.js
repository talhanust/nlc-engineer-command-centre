/* ============================================================
   SMOKE TEST — Project Hard Delete (Phase C S9, v1.12.0)
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
    ' state, hardDeleteProject, archiveProject, addProject, switchActiveProject, computePortfolio,' +
    ' renderProjectSwitcher, renderSettingsProjectsTab, migrateToOrgTree, partitionProjectData, migrateAccessControl };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' HARD DELETE SMOKE TEST \u2014 Phase C Session 9 (v1.12.0)');
console.log('\u2550'.repeat(74));
console.log('');

delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();
app.migrateAccessControl();
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass' });
const projC = app.addProject('pd-kpk', { name: 'Peshawar Ring Road' });
projB.data.commercial.ipcs.push({ id: 'DEL-SENTINEL', gross: 1 });   // marker in B's partition

assert('hardDeleteProject callable', typeof app.hardDeleteProject === 'function');
assertEq('delete non-existent → not_found', app.hardDeleteProject('nope').reason, 'not_found');
assertEq('delete a LIVE project → not_archived (refused)', app.hardDeleteProject(projB.id).reason, 'not_archived');
assertEq('delete the ACTIVE project → not_archived (can\u2019t archive active)', app.hardDeleteProject('proj-f14f15').reason, 'not_archived');

/* archive B, then delete it */
app.archiveProject(projB.id);
const auditD = app.state.auditLog.length;
const r = app.hardDeleteProject(projB.id);
assertEq('delete an ARCHIVED project → ok', r.ok, true);
assert('project removed from state.org.projects', !app.state.org.projects[projB.id]);
assert('data partition removed with it (sentinel gone)',
       !Object.values(app.state.org.projects).some(p => p.data && p.data.commercial && p.data.commercial.ipcs.some(i => i.id === 'DEL-SENTINEL')));
assert('deletion audited (org.project.delete)', app.state.auditLog.slice(auditD).some(e => e.action === 'org.project.delete' && e.refId === projB.id));

/* gone from portfolio + switcher */
assert('deleted project absent from portfolio', !app.computePortfolio().rows.some(row => row.id === projB.id));
app.renderProjectSwitcher();
assert('deleted project absent from switcher', !elements['projectSwitcherHost'].innerHTML.includes('Lahore Bypass'));

/* survivors intact */
assert('other projects intact (F-14/F-15 + C remain)', !!app.state.org.projects['proj-f14f15'] && !!app.state.org.projects[projC.id]);

/* Settings archived row exposes a Delete button */
app.archiveProject(projC.id);
app.renderSettingsProjectsTab();
assert('Settings archived row shows a Delete button', elements['dxProjectsTree'].innerHTML.includes('org-delete-btn'));

console.log('');
console.log('\u2550'.repeat(74));
console.log(` HARD DELETE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

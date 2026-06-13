/* ============================================================
   SMOKE TEST — Project Archive / Restore (Phase C S4, v1.7.0)
   ============================================================
   Group 1 — Archive guards + behaviour
   Group 2 — Visibility exclusions (switcher / switch / portfolio)
   Group 3 — Restore
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
    ' state, archiveProject, restoreProject, _liveProjects, switchActiveProject, computePortfolio,' +
    ' renderProjectSwitcher, renderSettingsProjectsTab, addProject, migrateToOrgTree, partitionProjectData };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){ if (cond){passed++;console.log(`  \u2713 ${label}`);} else {failed++;console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`);} }
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' ARCHIVE / RESTORE SMOKE TEST \u2014 Phase C Session 4 (v1.7.0)');
console.log('\u2550'.repeat(74));

/* Fresh org: F-14/F-15 (active) + two more live projects. */
delete app.state.org;
app.migrateToOrgTree();
app.partitionProjectData();
const projB = app.addProject('pd-centre', { name: 'Lahore Bypass' });
const projC = app.addProject('pd-kpk', { name: 'Peshawar Ring Road' });
/* plant sentinel in B's stash to verify preservation across archive */
projB.data.commercial.ipcs.push({ id: 'ARCH-SENTINEL', gross: 321 });

/* ───────── GROUP 1 — Archive guards + behaviour ───────── */
section('Group 1 \u2014 Archive guards + behaviour');
assert('archiveProject callable', typeof app.archiveProject === 'function');
assertEq('archive non-existent → not_found', app.archiveProject('nope').reason, 'not_found');

const auditBefore = app.state.auditLog.length;
const rB = app.archiveProject(projB.id);   // B is not active
assert('archive a non-active project succeeds', rB.ok === true);
assert('project flagged archived + archivedAt set',
       app.state.org.projects[projB.id].archived === true && !!app.state.org.projects[projB.id].archivedAt);
assert('archive audited (org.project.archive)',
       app.state.auditLog.slice(auditBefore).some(e => e.action === 'org.project.archive' && e.refId === projB.id));
assert('archived project data partition preserved (sentinel intact)',
       app.state.org.projects[projB.id].data && app.state.org.projects[projB.id].data.commercial.ipcs.some(i => i.id === 'ARCH-SENTINEL'));
assertEq('archive already-archived → already_archived', app.archiveProject(projB.id).reason, 'already_archived');

/* Archive the ACTIVE project (proj-f14f15) → must auto-switch away. */
app.switchActiveProject('proj-f14f15');
const rActive = app.archiveProject('proj-f14f15');
assert('archiving active project succeeds with auto-switch', rActive.ok === true && !!rActive.switchedTo);
assert('active project moved to a live project', app.state.org.activeProjectId !== 'proj-f14f15' && !app.state.org.projects[app.state.org.activeProjectId].archived);
assert('the just-archived project is flagged', app.state.org.projects['proj-f14f15'].archived === true);

/* Now only projC is live (B + f14f15 archived). Cannot archive the last live one. */
assertEq('cannot archive the LAST live project → last_project', app.archiveProject(projC.id).reason, 'last_project');
assert('still exactly one live project', app._liveProjects().length === 1 && app._liveProjects()[0].id === projC.id);

/* ───────── GROUP 2 — Visibility exclusions ───────── */
section('Group 2 \u2014 Visibility exclusions');
assertEq('switchActiveProject refuses archived target', app.switchActiveProject(projB.id), false);
assert('active unchanged after refused switch', app.state.org.activeProjectId === projC.id);

app.renderProjectSwitcher();
const swHtml = elements['projectSwitcherHost'].innerHTML;
assert('switcher excludes archived (no Lahore Bypass)', !swHtml.includes('Lahore Bypass'));
assert('switcher includes the live project', swHtml.includes('Peshawar Ring Road'));

const pf = app.computePortfolio();
assert('portfolio excludes archived projects',
       !pf.rows.some(r => r.id === projB.id) && !pf.rows.some(r => r.id === 'proj-f14f15'));
assert('portfolio includes only live projects', pf.rows.length === app._liveProjects().length && pf.rows.some(r => r.id === projC.id));

/* ───────── GROUP 3 — Restore ───────── */
section('Group 3 \u2014 Restore');
assert('restoreProject callable', typeof app.restoreProject === 'function');
assertEq('restore a non-archived project → false', app.restoreProject(projC.id), false);

const auditR = app.state.auditLog.length;
const okR = app.restoreProject(projB.id);
assert('restore archived project → true', okR === true);
assert('archived flag cleared + archivedAt removed',
       app.state.org.projects[projB.id].archived === false && !('archivedAt' in app.state.org.projects[projB.id]));
assert('restore audited (org.project.restore)',
       app.state.auditLog.slice(auditR).some(e => e.action === 'org.project.restore' && e.refId === projB.id));
assert('restored project reappears in portfolio', app.computePortfolio().rows.some(r => r.id === projB.id));
assertEq('restored project is switchable again', app.switchActiveProject(projB.id), true);
assert('restored project retained its data (sentinel after switch-in)',
       app.state.commercial.ipcs.some(i => i.id === 'ARCH-SENTINEL'));

/* Settings render: live rows carry Archive buttons; archived section has Restore. */
app.restoreProject('proj-f14f15');           // restore so we have live rows with archive buttons
app.archiveProject(projC.id);                 // archive one so archived section exists (projC not active now)
app.renderSettingsProjectsTab();
const setHtml = elements['dxProjectsTree'].innerHTML;
assert('settings shows Archive buttons on live projects', setHtml.includes('org-archive-btn'));
assert('settings shows Archived section with Restore', setHtml.includes('org-archived-title') && setHtml.includes('org-restore-btn'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` ARCHIVE / RESTORE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

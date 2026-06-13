/* ============================================================
   SMOKE TEST — Org Tree Foundation (Phase C Session 1, v1.4.0)
   ============================================================
   Group 1 — Migration (idempotent, seeds tree, migrates F-14/F-15)
   Group 2 — Project CRUD (add + rename, validation, audit)
   Group 3 — Switcher render + parameterized header

   Harness mirrors the existing suites: manual DOM stub (no jsdom),
   load HTML, extract longest <script>, wrap in new Function, expose
   helpers via `return { ... }`.
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
      classList: {
        _set: new Set(),
        add(c){this._set.add(c);}, remove(c){this._set.delete(c);},
        toggle(c,on){ if(on===undefined) this._set.has(c)?this._set.delete(c):this._set.add(c); else on?this._set.add(c):this._set.delete(c); },
        contains(c){return this._set.has(c);}
      },
      dataset: {}, style: { removeProperty(){} }, options: [], _children: [],
      parentElement: { innerHTML: '', appendChild: () => {} },
      addEventListener: () => {}, appendChild(c){this._children.push(c);}, remove: () => {},
      getContext: () => ({ canvas:{width:800,height:400} }), width:800, height:400, disabled:false,
      querySelectorAll: () => []
    };
    if (id === 'boq-data') elements[id].textContent = boqMatch[1];
  }
  return elements[id];
}

global.localStorage = { _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];}};
global.confirm = () => true;
global.alert = () => {};
const TEST_NOW = new Date('2026-05-18T00:00:00.000Z').getTime();
const OD = global.Date;
global.Date = class extends OD {
  constructor(...a){ if(a.length===0) super(TEST_NOW); else super(...a); }
  static now(){ return TEST_NOW; }
};
global.document = {
  documentElement: { setAttribute: () => {}, getAttribute: () => 'light' },
  /* return an element if the HTML defines the id OR we've already created it
     (render functions inject orgAddPdHq / orgAddName via innerHTML; the test
     pre-creates those so submitAddProject() can read their values) */
  getElementById: id => (definedIds.has(id) || elements[id]) ? makeEl(id) : null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: tag => ({ tagName:tag, value:'', textContent:'', innerHTML:'', click:()=>{}, href:'', download:'', style:{removeProperty(){}}, classList:{add(){},remove(){}}, parentElement:null, remove(){}, appendChild(){}, querySelectorAll:()=>[], getContext:()=>({}), width:0, height:0 })
};
global.window = { matchMedia: () => ({ matches:false, addEventListener:()=>{} }), getComputedStyle: () => ({ getPropertyValue: () => '' }), print: () => {} };
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.Blob = class {};
global.URL = { createObjectURL: () => 'x', revokeObjectURL: () => {} };
global.FileReader = class { readAsText(){} };
global.prompt = () => '';
global.setTimeout = fn => { try { fn(); } catch(e){} return 0; };
global.XLSX = { utils:{ aoa_to_sheet:()=>({}), book_new:()=>({}), book_append_sheet:()=>{} }, writeFile:()=>{} };
global.Chart = class { constructor(){} destroy(){} update(){} };

let app;
try {
  const fn = new Function(js + '\n; if (typeof boot === "function") boot(); return {' +
    ' state, migrateToOrgTree, addProject, renameProject, getActiveProject,' +
    ' getProjectsByPdHq, switchActiveProject, renderProjectSwitcher,' +
    ' renderSettingsProjectsTab, renderHeader, submitAddProject, _findNodeInTree };');
  app = fn();
} catch (e) { console.log('boot threw:', e.message); process.exit(1); }

let passed = 0, failed = 0;
function section(t){ console.log('\n' + t); }
function assert(label, cond, detail){
  if (cond){ passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail?' \u2014 '+detail:''}`); }
}
function assertEq(label, got, exp){ assert(label, got === exp, `got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`); }

console.log('\u2550'.repeat(74));
console.log(' ORG TREE SMOKE TEST \u2014 Phase C Session 1 (v1.4.0)');
console.log('\u2550'.repeat(74));

/* ───────── GROUP 1 — Migration ───────── */
section('Group 1 \u2014 Migration');
assert('migrateToOrgTree callable', typeof app.migrateToOrgTree === 'function');

/* Force empty-state, then run fresh to test creation. */
delete app.state.org;
const auditBefore = app.state.auditLog.length;
const r1 = app.migrateToOrgTree();
assert('returns { migrated, alreadyPresent } shape',
       r1 && typeof r1.migrated === 'boolean' && typeof r1.alreadyPresent === 'boolean');
assert('empty state: creates the full tree', !!(app.state.org && app.state.org.tree));

const pdIds = [];
(function walk(n){ if(!n) return; if(n.type==='pd_hq') pdIds.push(n.id); (n.children||[]).forEach(walk); })(app.state.org.tree);
const expectPd = ['pd-north','pd-centre','pd-kpk','pd-sindh','pd-bln'];
assert('tree has 5 PD HQs by id', expectPd.every(id => pdIds.includes(id)) && pdIds.length === 5, `got ${JSON.stringify(pdIds)}`);

const f = app.state.org.projects['proj-f14f15'];
assert('F-14/F-15 project created', !!f);
assertEq('F-14/F-15 placed under pd-north', f && f.pdHqId, 'pd-north');
assertEq('F-14/F-15 client name preserved', f && f.client && f.client.name, 'Federal Government Employees Housing Authority (FGEHA)');
assertEq('F-14/F-15 contract value preserved', f && f.client && f.client.contractValue, 19284461163);
assertEq('activeProjectId set to proj-f14f15', app.state.org.activeProjectId, 'proj-f14f15');

const r2 = app.migrateToOrgTree();
assert('idempotency: second run is a no-op', r2.migrated === false && r2.alreadyPresent === true);

const migAudit = app.state.auditLog.slice(auditBefore).find(e => e.action === 'org.migrate.create');
assert('audit entry org.migrate.create created on first run', !!migAudit);

/* ───────── GROUP 2 — Project CRUD ───────── */
section('Group 2 \u2014 Project CRUD');
assert('addProject callable', typeof app.addProject === 'function');

const auditP = app.state.auditLog.length;
const added = app.addProject('pd-centre', { name: 'M-3 Motorway Interchange' });
assert('addProject under existing pdHqId succeeds', !!added && added.pdHqId === 'pd-centre');
assertEq('addProject under invalid pdHqId returns null', app.addProject('pd-bogus', { name: 'X' }), null);
assertEq('addProject with missing name returns null', app.addProject('pd-centre', {}), null);
assert('new project has unique generated id',
       added && added.id !== 'proj-f14f15' && app.state.org.projects[added.id] === added);
assert('new project audited', app.state.auditLog.slice(auditP).some(e => e.action === 'org.project.add' && e.refId === added.id));

const renOk = app.renameProject(added.id, 'M-3 Interchange (Phase 1)');
assert('renameProject updates name', renOk === true && app.state.org.projects[added.id].name === 'M-3 Interchange (Phase 1)');
const renAudit = app.state.auditLog.filter(e => e.action === 'org.project.rename' && e.refId === added.id).pop();
assert('renameProject audits before\u2192after',
       !!renAudit && renAudit.before && renAudit.before.name === 'M-3 Motorway Interchange' && renAudit.after.name === 'M-3 Interchange (Phase 1)');

const centreProjs = app.getProjectsByPdHq('pd-centre');
assert('getProjectsByPdHq returns array', Array.isArray(centreProjs) && centreProjs.some(p => p.id === added.id));
assertEq('getActiveProject returns the right project', app.getActiveProject().id, 'proj-f14f15');

/* ───────── GROUP 3 — Switcher render + parameterized header ───────── */
section('Group 3 \u2014 Switcher render + parameterized header');
assert('project switcher host exists in top bar', document.getElementById('projectSwitcherHost') !== null);

app.renderProjectSwitcher();
const sw = elements['projectSwitcherHost'];
assert('switcher shows current project name (preserved shortName)', sw && sw.innerHTML.includes('F-14/15 Islamabad'));
assert('switcher dropdown lists projects grouped by PD HQ',
       sw && sw.innerHTML.includes('<optgroup') && sw.innerHTML.includes('HQ PD North') && sw.innerHTML.includes('HQ PD Centre'));

const okSwitch = app.switchActiveProject(added.id);
assertEq('clicking a project sets activeProjectId', app.state.org.activeProjectId, added.id);
assert('active project change re-renders switcher (selected moves)',
       okSwitch === true && elements['projectSwitcherHost'].innerHTML.includes('selected'));

app.switchActiveProject('proj-f14f15');   // restore for header assertions
app.renderHeader();
const title = elements['hdrProjectTitle'].textContent;
const sub = elements['hdrProjectSubtitle'].textContent;
const hmeta = elements['hdrProjectMeta'] ? elements['hdrProjectMeta'].textContent : '';
assert('header title shows NLC command-centre identity', title.includes('NATIONAL LOGISTIC CORPORATION'), `title="${title}"`);
assert('header meta reflects active project client name', hmeta.includes('Federal Government Employees Housing Authority (FGEHA)'), `meta="${hmeta}"`);
assert('header reflects active project name (preserved shortName)', sub.includes('F-14/15 Islamabad'), `sub="${sub}"`);

app.renameProject('proj-f14f15', 'F-14/F-15 Islamabad (renamed)');
app.renderProjectSwitcher(); app.renderHeader();
assert('after rename, switcher + header update',
       elements['projectSwitcherHost'].innerHTML.includes('F-14/F-15 Islamabad (renamed)') &&
       elements['hdrProjectSubtitle'].textContent.includes('F-14/F-15 Islamabad (renamed)'));
app.renameProject('proj-f14f15', 'F-14/F-15 Islamabad');  // restore

app.renderSettingsProjectsTab();
const tree = elements['dxProjectsTree'];
assert('Settings \u2192 Projects tab renders', tree && tree.innerHTML.length > 0);
assert('Settings render shows tree with projects',
       tree && tree.innerHTML.includes('HQ PD North') && tree.innerHTML.includes('F-14/F-15 Islamabad'));

/* Add Project form submission via the render path */
makeEl('orgAddPdHq').value = 'pd-sindh';
makeEl('orgAddName').value = 'Karachi Northern Bypass';
const submitted = app.submitAddProject();
assert('Add Project form submission via render path',
       !!submitted && submitted.pdHqId === 'pd-sindh' &&
       app.getProjectsByPdHq('pd-sindh').some(p => p.name === 'Karachi Northern Bypass'));

console.log('\n' + '\u2550'.repeat(74));
console.log(` ORG TREE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('\u2550'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

/* SMOKE TEST — Execution + Commercial tab visibility (v1.0.2)
 *
 * The earlier smoke_test_execution_tabs.js verified the renderers populate
 * their host elements. But the v1.0.2 bug was different: renderers worked
 * fine, child elements were populated, but the section.page wrapper was
 * still display:none because switchExecutionTab() flipped inline style
 * (-> '') without adding the .active class. The CSS rule
 *   .page { display: none }
 *   .page.active { display: block }
 * meant a section without .active stays hidden regardless of inline style.
 *
 * This test specifically asserts that after switchExecutionTab(tab),
 * the corresponding section has class "active" and (in real DOM) would
 * be display: block.
 */

const fs = require('fs');
const src = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const boqMatch = src.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => a.length > b.length ? a : b);

/* Index every section.page in pane-execution and pane-commercial with their
   initial class state so we can simulate querySelectorAll() correctly. */
const definedIds = new Set();
let m;
const idRe = /id="([^"]+)"/g;
while ((m = idRe.exec(src)) !== null) definedIds.add(m[1]);

/* Parse section.page elements and the panes they live in */

const executionPages = [];
const commercialPages = [];
const mappingPages = [];
/* Simpler scrape: walk every section line in source */
src.split('\n').forEach(line => {
  const m1 = line.match(/<section class="page(?:\s+active)?" id="(ex-page-[^"]+)"/);
  if (m1) executionPages.push({ id: m1[1], initialActive: line.includes('active') });
  const m2 = line.match(/<section class="page(?:\s+active)?" id="(cm-page-[^"]+)"/);
  if (m2) commercialPages.push({ id: m2[1], initialActive: line.includes('active') });
  const m3 = line.match(/<section class="page(?:\s+active)?" id="(m-page-[^"]+)"/);
  if (m3) mappingPages.push({ id: m3[1], initialActive: line.includes('active') });
});

console.log(`Found ${executionPages.length} execution / ${commercialPages.length} commercial / ${mappingPages.length} mapping pages.`);

const elements = {};
function makeEl(id, initialClasses = [], parentPaneId = null) {
  if (!elements[id]) {
    elements[id] = {
      id, value: '', textContent: '', innerHTML: '', checked: false,
      _parentPaneId: parentPaneId,
      _tagName: 'div',
      classList: {
        _set: new Set(initialClasses),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        toggle(c, on) {
          if (on === undefined) this._set.has(c) ? this._set.delete(c) : this._set.add(c);
          else on ? this._set.add(c) : this._set.delete(c);
        },
        contains(c) { return this._set.has(c); }
      },
      dataset: {}, style: {
        display: '',
        removeProperty(prop) { this[prop] = ''; }
      },
      options: [], _children: [],
      parentElement: { innerHTML: '', appendChild: () => {} },
      addEventListener: () => {}, appendChild(c) { this._children.push(c); }, remove: () => {},
      getContext: () => ({ canvas: { width: 800, height: 400 } }),
      width: 800, height: 400, disabled: false,
      querySelectorAll: () => []
    };
    if (id === 'boq-data') elements[id].textContent = boqMatch[1];
  }
  return elements[id];
}

/* Pre-create the page sections with the right initial class state and
   inline style:display so the test mirrors the real HTML. */
executionPages.forEach(p => {
  const el = makeEl(p.id, p.initialActive ? ['page', 'active'] : ['page'], 'pane-execution');
  el._tagName = 'section';
  if (!p.initialActive) el.style.display = 'none';
});
commercialPages.forEach(p => {
  const el = makeEl(p.id, p.initialActive ? ['page', 'active'] : ['page'], 'pane-commercial');
  el._tagName = 'section';
});
mappingPages.forEach(p => {
  const el = makeEl(p.id, p.initialActive ? ['page', 'active'] : ['page'], 'pane-mapping');
  el._tagName = 'section';
  if (!p.initialActive) el.style.display = 'none';
});

global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
global.confirm = () => true;
global.alert = () => {};
const TEST_NOW = new Date('2026-05-18T00:00:00.000Z').getTime();
global.Date.now = () => TEST_NOW;
const OD = global.Date;
global.Date = class extends OD {
  constructor(...a) { if (a.length === 0) super(TEST_NOW); else super(...a); }
  static now() { return TEST_NOW; }
};

global.document = {
  documentElement: { setAttribute: () => {}, getAttribute: () => 'light' },
  getElementById: id => definedIds.has(id) ? makeEl(id) : null,
  querySelectorAll: selector => {
    /* Handle the selectors switchExecutionTab and switchCommercialTab use */
    if (selector === '#pane-execution > section.page') {
      return Object.values(elements).filter(e => e._parentPaneId === 'pane-execution' && e.classList.contains('page'));
    }
    if (selector === '#pane-commercial .page') {
      return Object.values(elements).filter(e => e._parentPaneId === 'pane-commercial' && e.classList.contains('page'));
    }
    if (selector === '#pane-mapping > section.page') {
      return Object.values(elements).filter(e => e._parentPaneId === 'pane-mapping' && e.classList.contains('page'));
    }
    if (selector === '#execTabSeg .seg-btn') return [];
    if (selector === '#pane-commercial .subtab-btn') return [];
    if (selector === '#mappingTabSeg .seg-btn') return [];
    return [];
  },
  addEventListener: () => {},
  createElement: tag => ({
    tagName: tag, value: '', textContent: '', innerHTML: '',
    click: () => {}, href: '', download: '', style: { removeProperty: () => {} },
    classList: { add: () => {}, remove: () => {} },
    parentElement: null, remove: () => {},
    appendChild: () => {}, querySelectorAll: () => [],
    getContext: () => ({}), width: 0, height: 0,
  })
};
global.window = {
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  print: () => {},
};
global.getComputedStyle = el => {
  /* Simulate the CSS rule: .page { display:none } / .page.active { display:block } */
  if (el && el.classList && el.classList.contains('page')) {
    if (el.style.display === 'none') return { display: 'none' };
    if (el.classList.contains('active')) return { display: 'block' };
    return { display: 'none' };  /* the bug: no .active class = hidden */
  }
  return { display: 'block' };
};
global.Blob = class {};
global.URL = { createObjectURL: () => 'x', revokeObjectURL: () => {} };
global.FileReader = class { readAsText() {} };
global.prompt = () => '';
global.setTimeout = fn => { try { fn(); } catch (e) {} return 0; };
global.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
global.Chart = class { constructor() {} destroy() {} update() {} };

const fn = new Function(js + '\n; if (typeof boot === "function") boot(); return { switchExecutionTab, switchCommercialTab, switchMappingTab };');
let app;
try { app = fn(); } catch (e) { console.log('boot threw:', e.message); process.exit(1); }

console.log('═'.repeat(74));
console.log(' TAB VISIBILITY SMOKE TEST — v1.0.2 regression guard');
console.log('═'.repeat(74));

let passed = 0, failed = 0;
function test(label, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('');
console.log('Execution sub-tab visibility:');
const exTabs = ['dashboard', 'activities', 'gantt', 'scurve', 'lookahead', 'store', 'plant', 'equipment', 'rscurve', 'report'];
for (const tab of exTabs) {
  app.switchExecutionTab(tab);
  const targetId = 'ex-page-' + tab;
  const targetEl = elements[targetId];
  if (!targetEl) { failed++; console.log(`  ✗ ${tab.padEnd(12)} — section not found`); continue; }
  const computed = global.getComputedStyle(targetEl);
  const hasActive = targetEl.classList.contains('active');
  /* Check that target IS visible */
  test(`${tab.padEnd(12)} → target section has .active class and is display:block`,
       hasActive && computed.display === 'block',
       `active=${hasActive} display=${computed.display}`);
  /* Check that every OTHER section is hidden */
  let otherActive = 0;
  for (const otherTab of exTabs) {
    if (otherTab === tab) continue;
    const otherEl = elements['ex-page-' + otherTab];
    if (otherEl && otherEl.classList.contains('active')) otherActive++;
  }
  test(`${tab.padEnd(12)} → all other sections lose .active class`,
       otherActive === 0,
       `${otherActive} other sections still active`);
}

console.log('');
console.log('Commercial sub-tab visibility (regression check — was already correct):');
const cmTabs = ['dashboard', 'boq', 'distribution', 'contractors'];
for (const tab of cmTabs) {
  app.switchCommercialTab(tab);
  const targetId = 'cm-page-' + tab;
  const targetEl = elements[targetId];
  if (!targetEl) { failed++; console.log(`  ✗ ${tab.padEnd(12)} — section not found`); continue; }
  const hasActive = targetEl.classList.contains('active');
  test(`${tab.padEnd(12)} → target section has .active class`, hasActive);
}

console.log('');
console.log('Mapping sub-tab visibility (v1.0.3 fix):');
const mapTabs = ['boq-wbs', 'boq-material', 'period-month'];
for (const tab of mapTabs) {
  app.switchMappingTab(tab);
  const targetId = 'm-page-' + tab;
  const targetEl = elements[targetId];
  if (!targetEl) { failed++; console.log(`  ✗ ${tab.padEnd(14)} — section not found`); continue; }
  const computed = global.getComputedStyle(targetEl);
  const hasActive = targetEl.classList.contains('active');
  test(`${tab.padEnd(14)} → target section has .active class and is display:block`,
       hasActive && computed.display === 'block',
       `active=${hasActive} display=${computed.display}`);
  let otherActive = 0;
  for (const otherTab of mapTabs) {
    if (otherTab === tab) continue;
    const otherEl = elements['m-page-' + otherTab];
    if (otherEl && otherEl.classList.contains('active')) otherActive++;
  }
  test(`${tab.padEnd(14)} → all other mapping sections lose .active class`,
       otherActive === 0,
       `${otherActive} other sections still active`);
}

console.log('');
console.log('═'.repeat(74));
console.log(` RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(74));
process.exit(failed > 0 ? 1 : 0);

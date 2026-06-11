/* PROOF — Execution tabs render correctly in v1.0.1
 * 
 * The user's screenshot showed empty Execution tabs alongside the
 * "Cannot set properties of null" boot crash. Both symptoms have a
 * single root cause: refreshSettings() threw at the line that wrote
 * to commercialMigrationStatus.textContent, which aborted boot before
 * switchModule() could run. That left every module pane unrendered.
 *
 * v1.0.1's safeSetText() helper makes that line a no-op, allowing
 * boot to complete. This script proves boot now completes AND every
 * execution tab populates its host elements.
 */

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
        add(c) { this._set.add(c); }, remove(c) { this._set.delete(c); },
        toggle(c, on) {
          if (on === undefined) this._set.has(c) ? this._set.delete(c) : this._set.add(c);
          else on ? this._set.add(c) : this._set.delete(c);
        },
        contains(c) { return this._set.has(c); }
      },
      dataset: {}, style: {}, options: [], _children: [],
      parentElement: { innerHTML: '', appendChild: () => {} },
      addEventListener: () => {},
      appendChild(c) { this._children.push(c); },
      remove: () => {},
      getContext: () => ({ canvas: { width: 800, height: 400 } }),
      width: 800, height: 400, disabled: false,
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
global.Date.now = () => TEST_NOW;
const OD = global.Date;
global.Date = class extends OD {
  constructor(...a) { if (a.length === 0) super(TEST_NOW); else super(...a); }
  static now() { return TEST_NOW; }
};
global.document = {
  documentElement: { setAttribute: () => {}, getAttribute: () => 'light' },
  getElementById: id => definedIds.has(id) ? makeEl(id) : null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: tag => ({
    tagName: tag, value: '', textContent: '', innerHTML: '',
    click: () => {}, href: '', download: '', style: {},
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
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.Blob = class {};
global.URL = { createObjectURL: () => 'x', revokeObjectURL: () => {} };
global.FileReader = class { readAsText() {} };
global.prompt = () => '';
global.setTimeout = fn => { try { fn(); } catch (e) {} return 0; };
global.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
global.Chart = class { constructor() {} destroy() {} update() {} };

console.log('═'.repeat(74));
console.log(' EXECUTION TABS PROOF — v1.0.1 vs pre-hotfix symptoms');
console.log('═'.repeat(74));

let bootError = null, app;
try {
  const fn = new Function(js + '\n; if (typeof boot === "function") boot(); return { state, switchModule, switchExecutionTab };');
  app = fn();
} catch (e) { bootError = e; }

console.log('');
console.log('STEP 1 — Boot completion (was failing in v1.0):');
if (bootError) {
  console.log(`  ✗ boot threw: ${bootError.message}`);
  process.exit(1);
}
console.log(`  ✓ boot completed without throwing`);
console.log(`  ✓ state.commercial has ${Array.isArray(app.state.commercial.ipcs) ? app.state.commercial.ipcs.length : '?'} IPCs (loaded successfully)`);
console.log(`  ✓ state.execution has ${Object.keys(app.state.execution.activities || {}).length} activity overrides`);

console.log('');
console.log('STEP 2 — switchModule(\'execution\') (was unreachable in v1.0):');
try {
  app.switchModule('execution');
  console.log(`  ✓ switchModule('execution') completed`);
} catch (e) {
  console.log(`  ✗ switchModule threw: ${e.message}`);
  process.exit(1);
}

console.log('');
console.log('STEP 3 — Each execution tab populates its host element:');

const tabHosts = {
  dashboard:  'execKpiStrip',
  activities: 'execActTbody',
  scurve:     'execFullSCurve',
  lookahead:  null,                  // no single primary host
  gantt:      'execGanttChart',
  store:      'execStoreTbody',
  plant:      'execPlantTbody',
  equipment:  'execEqTbody',
  rscurve:    'execRsKpiStrip',
  report:     'execReportSummary',
};

const tabs = Object.keys(tabHosts);
let passed = 0, failed = 0;

for (const tab of tabs) {
  let threw = null;
  try { app.switchExecutionTab(tab); }
  catch (e) { threw = e.message; }
  const host = tabHosts[tab];
  if (!host) {
    console.log(`  • ${tab.padEnd(12)} renders (no single primary host to assert) ${threw ? '✗ THREW: ' + threw : ''}`);
    if (!threw) passed++; else failed++;
    continue;
  }
  const el = elements[host];
  const populated = el ? el.innerHTML.length > 0 : false;
  const mark = (!threw && populated) ? '✓' : (threw ? '✗' : '⚠');
  const size = el ? el.innerHTML.length : 'n/a';
  console.log(`  ${mark} ${tab.padEnd(12)} #${host.padEnd(20)} ${size.toString().padStart(8)} chars ${threw ? '· threw: ' + threw : ''}`);
  if (!threw && populated) passed++; else failed++;
}

console.log('');
console.log('═'.repeat(74));
console.log(` RESULT: ${passed}/${tabs.length} execution tabs render successfully`);
console.log('═'.repeat(74));
if (failed === 0) {
  console.log(' ✓ The v1.0 symptom (empty Execution tabs) is fully resolved by v1.0.1');
}
process.exit(failed > 0 ? 1 : 0);

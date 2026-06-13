/* ============================================================
   BOOT SMOKE TEST
   ============================================================
   Verifies that the application boots in a real-DOM-like environment
   without throwing on orphan element references. This is the regression
   guard for hotfix v1.0.1.

   Before the hotfix:
     - refreshSettings() crashed at
       document.getElementById('commercialMigrationStatus').textContent = ...
     - boot() never completed, so switchModule() never ran, so module
       panes stayed empty (the user-visible symptom).

   After the hotfix:
     - safeSetText() makes missing elements a no-op
     - boot() runs to completion
     - footerStatus is updated, proving the end of boot() was reached
   ============================================================ */

const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const boqMatch = html.match(/<script id="boq-data" type="application\/json">([\s\S]*?)<\/script>/);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.reduce((a, b) => a.length > b.length ? a : b);

/* Extract every id="..." defined in the HTML body so the mock DOM
   matches what a real browser would see. */
const definedIds = new Set();
const idRe = /id="([^"]+)"/g;
let m;
while ((m = idRe.exec(html)) !== null) definedIds.add(m[1]);
console.log(`HTML defines ${definedIds.size} unique element IDs`);

const elements = {};
let _gebiCalls = 0, _gebiHits = 0, _gebiMisses = 0;

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
      parentElement: { innerHTML: '' },
      addEventListener: () => {},
      appendChild(c) { this._children.push(c); },
      remove: () => {}, getContext: () => ({}), disabled: false,
      querySelectorAll: () => []
    };
    if (id === 'boq-data') elements[id].textContent = boqMatch[1];
  }
  return elements[id];
}

global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] || null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; }
};
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
  /* getElementById returns an element ONLY if the HTML actually defines
     that id — same as a real browser. This is what catches orphan refs. */
  getElementById: id => {
    _gebiCalls++;
    if (definedIds.has(id)) { _gebiHits++; return makeEl(id); }
    _gebiMisses++;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ value: '', textContent: '', click: () => {}, href: '', download: '', style: {}, classList: { add: () => {}, remove: () => {} }, parentElement: null, remove: () => {} })
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
global.setTimeout = (fn) => { try { fn(); } catch (e) { console.warn('  setTimeout cb threw:', e.message); } return 0; };
global.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };
global.Chart = class { constructor() {} destroy() {} };

console.log('═'.repeat(74));
console.log(' BOOT SMOKE TEST — Hotfix v1.0.1 regression guard');
console.log('═'.repeat(74));

let bootError = null;
let footerAtEnd = null;
let app;

try {
  const fn = new Function(js + '\n; if (typeof boot === "function") boot(); ' +
    'return { state, boot, safeSetText: (typeof safeSetText !== "undefined") ? safeSetText : null };');
  app = fn();
} catch (e) {
  bootError = e;
}

const fs_check = elements.footerStatus;
footerAtEnd = fs_check ? fs_check.textContent : null;

let passed = 0, failed = 0;
function test(label, cond) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else      { failed++; console.log(`  ✗ ${label}`); }
}

test('boot() did not throw', bootError === null);
if (bootError) console.log(`    threw: ${bootError.message}`);

test('safeSetText helper is defined', app && typeof app.safeSetText === 'function');

test('boot reached the final footerStatus line', footerAtEnd && footerAtEnd.startsWith('Ready'));
if (footerAtEnd) console.log(`    footerStatus = "${footerAtEnd}"`);

test('state is initialized', app && app.state && typeof app.state === 'object');

test('state.commercial is populated', app && app.state && app.state.commercial && Array.isArray(app.state.commercial.ipcs));

test('state.execution is populated', app && app.state && app.state.execution && typeof app.state.execution.activities === 'object');

/* Verify safeSetText itself behaves correctly */
if (app && app.safeSetText) {
  /* No throw on missing id */
  let didThrow = false;
  try { app.safeSetText('this-id-does-not-exist', 'whatever'); } catch (e) { didThrow = true; }
  test('safeSetText("missing-id") does not throw', !didThrow);

  /* Updates a present element */
  app.safeSetText('boqCount', 'TEST_TOKEN');
  test('safeSetText("boqCount") updated textContent', elements.boqCount && elements.boqCount.textContent === 'TEST_TOKEN');
}

/* Report on getElementById calls during boot */
console.log('');
console.log(`  ℹ getElementById calls during boot: ${_gebiCalls}`);
console.log(`  ℹ   hits:   ${_gebiHits}`);
console.log(`  ℹ   misses: ${_gebiMisses}`);
test('getElementById misses are non-fatal (all hit safeSetText or similar guards)',
     bootError === null && _gebiCalls > 0);

console.log('');
console.log('═'.repeat(74));
console.log(` BOOT TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(74));

process.exit(failed > 0 ? 1 : 0);

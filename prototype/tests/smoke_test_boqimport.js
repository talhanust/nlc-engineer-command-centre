/* smoke_test_boqimport.js — Phase E S1
   Tests the pure parser + per-project BOQ storage + the live-wiring proof
   (BOQ_DATA re-points to the active project's BOQ on switch). File upload
   itself isn't testable in a DOM stub, so we test parseBoqRows/parseBoqText
   that the upload glue feeds. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);

const boqJsonMatch = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/);
const BUILTIN_BOQ_TEXT = boqJsonMatch[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

const definedIds = { 'boq-data': { textContent: BUILTIN_BOQ_TEXT } };
function elStub() { return { textContent: '', innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {} }, querySelectorAll: () => [], appendChild() {}, addEventListener() {} }; }
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: {
    getElementById: id => definedIds[id] || null,
    querySelector: () => null, querySelectorAll: () => [], createElement: elStub,
    addEventListener() {}, body: elStub(),
  },
  window: {}, navigator: { userAgent: 'node' }, XLSX: { utils: {} }, Chart: function () {}, alert() {}, setTimeout: (f) => { try { f && f(); } catch (e) {} },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;

const TEST_NOW = new Date('2026-05-18T00:00:00Z');
const _RealDate = Date;
sandbox.Date = class extends _RealDate { constructor(...a) { super(...(a.length ? a : [TEST_NOW.getTime()])); } static now() { return TEST_NOW.getTime(); } };

const vm = require('vm');
vm.createContext(sandbox);
const harness = js + `
;(function(){
  try { loadState(); } catch(e) {}
  try { if (typeof ensureProcurementState==='function') ensureProcurementState(); } catch(e){}
  try { if (typeof ensureFinancialState==='function') ensureFinancialState(); } catch(e){}
  try { migrateToOrgTree(); } catch(e){}
  try { partitionProjectData(); } catch(e){}
  try { if (typeof migrateAccessControl==='function') migrateAccessControl(); } catch(e){}
  try { migrateProjectBoq(); } catch(e){}
  try { _repointBoqData(); } catch(e){}
  globalThis.__api = {
    state, parseBoqRows, parseBoqText, _emptyBoq, migrateProjectBoq, setProjectBoq,
    createProjectWithBoq, _repointBoqData, switchActiveProject, addProject,
    getActiveProject, getProjectsByPdHq, _pdHqList,
    currentBoq: () => (typeof BOQ_DATA !== 'undefined' ? BOQ_DATA : null),
    builtinItemCount: () => (typeof BOQ_DATA !== 'undefined' ? BOQ_DATA.items.length : -1),
  };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 15000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// ── 1. parseBoqRows: header + data ──
const rows = [
  ['bill_no', 'bill_name', 'section', 'sr_no', 'item_code', 'description', 'unit', 'quantity', 'rate', 'amount'],
  [1, 'ROAD WORK', 'Earthwork', '2', 'a)', 'Ordinary excavation', '1000 Sft', 1000, 50, 50000],
  [1, 'ROAD WORK', 'Earthwork', '3', 'b)', 'Compaction', '1000 Sft', 200, 100, ''],   // amount derived = 20000
  [2, 'CULVERTS', 'Box', '1', 'i)', 'Concrete', 'Cft', 10, 800, 8000],
];
const b = api.parseBoqRows(rows, 'Test Project');
ok('parseBoqRows item count = 3', b.items.length === 3);
ok('parseBoqRows derives missing amount (qty*rate)', b.items[1].amount === 20000);
ok('parseBoqRows total_contract_value = sum amounts', b.total_contract_value === 78000);
ok('parseBoqRows derives bills map', b.bills['1'] === 'ROAD WORK' && b.bills['2'] === 'CULVERTS');
ok('parseBoqRows ids sequential I0001..', b.items[0].id === 'I0001' && b.items[2].id === 'I0003');
ok('parseBoqRows numeric bill_no coerced', b.items[0].bill_no === 1);

// ── 2. parseBoqText: CSV + TSV ──
const csv = 'bill_no,bill_name,description,unit,quantity,rate,amount\n1,A,Item one,m,2,3,6\n1,A,Item two,m,5,2,10';
const bc = api.parseBoqText(csv, 'CSV');
ok('parseBoqText CSV -> 2 items', bc.items.length === 2);
ok('parseBoqText CSV total = 16', bc.total_contract_value === 16);
const tsv = 'bill_no\tbill_name\tdescription\tunit\tquantity\trate\tamount\n1\tA\tT\tm\t4\t5\t20';
const bt = api.parseBoqText(tsv, 'TSV');
ok('parseBoqText TSV -> 1 item, total 20', bt.items.length === 1 && bt.total_contract_value === 20);
ok('parseBoqText empty -> empty boq', api.parseBoqText('', 'x').items.length === 0);

// ── 3. migrateProjectBoq seeded the built-in into F-14/F-15, empty elsewhere ──
const seed = api.state.org.projects['proj-f14f15'];
ok('F-14/F-15 project has boq', !!(seed && seed.boq));
ok('F-14/F-15 boq = built-in 434 items', seed.boq.items.length === 434);
ok('migrateProjectBoq idempotent', (api.migrateProjectBoq(), seed.boq.items.length === 434));

// ── 4. createProjectWithBoq stores boq + derives contract value ──
const pd = api._pdHqList()[0];
const np = api.createProjectWithBoq(pd.id, 'Imported Project', b);
ok('createProjectWithBoq returns project', !!np);
ok('new project stores boq (3 items)', np.boq.items.length === 3);
ok('new project client.contractValue derived = 78000', np.client && np.client.contractValue === 78000);

// ── 5. live-wiring proof: BOQ_DATA re-points on switch ──
api.switchActiveProject(np.id);
ok('after switch, active project = new', api.getActiveProject().id === np.id);
ok('LIVE-WIRE: BOQ_DATA now = new project boq (3 items)', api.builtinItemCount() === 3);
api.switchActiveProject('proj-f14f15');
ok('LIVE-WIRE: switching back re-points to 434 items', api.builtinItemCount() === 434);

// ── 6. setProjectBoq on active re-points immediately ──
const b2 = api.parseBoqText('bill_no,description,unit,quantity,rate,amount\n9,Solo,ea,1,5,5', 'Solo');
api.setProjectBoq('proj-f14f15', b2);
ok('setProjectBoq replaced active boq + re-pointed (1 item)', api.builtinItemCount() === 1);
ok('setProjectBoq derived contract value on project', api.state.org.projects['proj-f14f15'].client.contractValue === 5);

console.log(`\nboqimport: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

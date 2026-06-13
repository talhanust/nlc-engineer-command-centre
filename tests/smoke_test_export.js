/* smoke_test_export.js — Phase E S21
   Export array-builders produce correct headers/rows; export wrappers build a
   workbook and call writeFile with an .xlsx name; rollup totals row present. */
const fs = require('fs');
const html = fs.readFileSync('FGEHA_NLC_F14F15_UnifiedControl_v1_0.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => a.length > b.length ? a : b);
const boqText = html.match(/<script id="boq-data"[^>]*>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
const ok = (l, c) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : ' FAIL ') + l); };

/* capturing XLSX stub */
const captured = { sheets: [], file: null };
const XLSXstub = {
  utils: {
    aoa_to_sheet: (aoa) => ({ __aoa: aoa }),
    book_new: () => ({ Sheets: {}, SheetNames: [] }),
    book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws; captured.sheets.push({ name, ws }); },
  },
  writeFile: (wb, name) => { captured.file = { name, wb }; },
};
const byId = { 'boq-data': { textContent: boqText } };
const store = {};
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, isNaN, parseFloat, parseInt, RegExp, Set,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => byId[id] || null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), addEventListener() {}, body: {} },
  window: {}, navigator: { userAgent: 'node' }, XLSX: XLSXstub, Chart: function () {}, alert() {}, setTimeout: (f) => { try { f && f(); } catch (e) {} },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
const TEST_NOW = new Date('2026-05-18T00:00:00Z');
const _RD = Date; sandbox.Date = class extends _RD { constructor(...a) { super(...(a.length ? a : [TEST_NOW.getTime()])); } static now() { return TEST_NOW.getTime(); } };

const vm = require('vm'); vm.createContext(sandbox);
const harness = js + `
;(function(){
  try{loadState();}catch(e){}
  try{if(typeof ensureProcurementState==='function')ensureProcurementState();}catch(e){}
  try{if(typeof ensureFinancialState==='function')ensureFinancialState();}catch(e){}
  try{migrateToOrgTree();}catch(e){}
  try{partitionProjectData();}catch(e){}
  try{migrateProjectBoq();_repointBoqData();}catch(e){}
  try{migrateProjectBaselines();_repointBaselines();}catch(e){}
  try{seedDemoData();}catch(e){}
  if(!state.commercial) state.commercial={};
  if(!Array.isArray(state.commercial.ipcs)||!state.commercial.ipcs.length){
    state.commercial.ipcs=[{id:'x1',seq:1,ipcNo:'IPC-01',status:'vetted',gross:1500000,note:'n1'},
                           {id:'x2',seq:2,ipcNo:'IPC-02',status:'paid',gross:2500000,paidAt:'2026-03-01'}];
  }
  if(!Array.isArray(state.commercial.rars)) state.commercial.rars=[];
  globalThis.__api={ state, _ipcExportAoa, _rarExportAoa, _nodeRollupAoa, exportRegisterXlsx, exportNodeRollupXlsx,
    ROOT:(typeof ROOT_NODE_ID!=='undefined')?ROOT_NODE_ID:'hq-nlc' };
})();
`;
try { vm.runInContext(harness, sandbox, { timeout: 20000 }); }
catch (e) { console.log('HARNESS ERROR:', e.message); process.exit(1); }
const api = sandbox.__api;

// IPC aoa
const ipcAoa = api._ipcExportAoa();
ok('IPC aoa has a header row', Array.isArray(ipcAoa[0]) && ipcAoa[0][0] === 'IPC No');
ok('IPC aoa includes Status + Gross columns', ipcAoa[0].indexOf('Status') >= 0 && ipcAoa[0].indexOf('Gross') >= 0);
ok('IPC aoa has one row per IPC', ipcAoa.length === api.state.commercial.ipcs.length + 1);
ok('IPC aoa gross is numeric', typeof ipcAoa[1][2] === 'number');

// rollup aoa
const rAoa = api._nodeRollupAoa(api.ROOT);
ok('rollup aoa header has Project + Cash', rAoa[0][0] === 'Project' && rAoa[0].indexOf('Cash') >= 0);
ok('rollup aoa has a TOTAL row last', /TOTAL/.test(String(rAoa[rAoa.length - 1][0])));
ok('rollup aoa numeric contract values', typeof rAoa[1][2] === 'number');

// export register → workbook + writeFile
captured.sheets.length = 0; captured.file = null;
const regName = api.exportRegisterXlsx();
ok('register export wrote a file', !!captured.file);
ok('register file name ends .xlsx', /\.xlsx$/.test(regName) && /Register/.test(regName));
ok('register workbook has an IPCs sheet', captured.sheets.some(s => s.name === 'IPCs'));
ok('IPCs sheet carries the aoa', captured.sheets.find(s => s.name === 'IPCs').ws.__aoa[0][0] === 'IPC No');

// export rollup → defaults to active node, writes file
captured.file = null;
const rollName = api.exportNodeRollupXlsx();
ok('rollup export wrote a file', !!captured.file);
ok('rollup file name ends .xlsx', /\.xlsx$/.test(rollName) && /Rollup/.test(rollName));
ok('rollup workbook has a Rollup sheet', captured.file.wb.SheetNames.indexOf('Rollup') >= 0);

// RAR sheet only when rars exist
captured.sheets.length = 0;
api.state.commercial.rars = [{ id: 'r1', seq: 1, rarNo: 'RAR-01', status: 'submitted', amount: 400000 }];
api.exportRegisterXlsx();
ok('RAR sheet added when rars exist', captured.sheets.some(s => s.name === 'RARs'));

console.log(`\nexport: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

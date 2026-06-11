/* ============================================================
   §XLSX-EXPORT  Registers + rollup to Excel  (Phase E — S21)
   ============================================================
   Uses the bundled SheetJS (XLSX) and the app's established export pattern
   (aoa_to_sheet → book_new → book_append_sheet → writeFile). Two exports:
   the active project's IPC + RAR registers (one workbook, two sheets) and a
   node's portfolio rollup. Array-builders are pure (testable); the wrappers
   just write the file.
   ============================================================ */

function _xlsxSafe(s) { return String(s || 'export').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60); }
function _xlsxDate() { return new Date().toISOString().slice(0, 10); }

function _ipcExportAoa() {
  const ipcs = (state.commercial && state.commercial.ipcs) || [];
  const head = ['IPC No', 'Status', 'Gross', 'Vetted Gross', 'Net Payable', 'Note', 'Paid On'];
  const rows = ipcs.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)).map(i => [
    i.ipcNo || i.no || ('IPC-' + (i.seq || '')),
    i.status || '',
    Number(i.gross || 0),
    Number(i.vettedGross || i.vetted || 0),
    Number(i.netPayable || i.vettedNetPayable || 0),
    i.note || '',
    i.paidAt || ''
  ]);
  return [head].concat(rows);
}

function _rarExportAoa() {
  const rars = (state.commercial && state.commercial.rars) || [];
  const head = ['RAR No', 'Status', 'Amount', 'Note'];
  const rows = rars.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)).map(r => [
    r.rarNo || r.no || ('RAR-' + (r.seq || '')),
    r.status || '',
    Number(r.amount || r.gross || 0),
    r.note || ''
  ]);
  return [head].concat(rows);
}

function _nodeRollupAoa(nodeId) {
  const head = ['Project', 'PD HQ', 'Contract', 'Gross Revenue', 'Vetted', 'Receipts', 'Payments', 'Cash', 'Net Receivable'];
  if (typeof computeNodeRollup !== 'function') return [head];
  const r = computeNodeRollup(nodeId);
  const rows = (r.rows || []).map(x => [
    x.name, x.pdHqId,
    Number(x.contractValue || 0), Number(x.grossRevenue || 0), Number(x.vettedRevenue || 0),
    Number(x.receipts || 0), Number(x.payments || 0), Number(x.cashPosition || 0), Number(x.netReceivable || 0)
  ]);
  const t = r.totals || {};
  const total = ['TOTAL (' + (t.projectCount || rows.length) + ' projects)', '',
    Number(t.contractValue || 0), Number(t.grossRevenue || 0), Number(t.vettedRevenue || 0),
    Number(t.receipts || 0), Number(t.payments || 0), Number(t.cashPosition || 0), Number(t.netReceivable || 0)];
  return [head].concat(rows).concat([total]);
}

function exportRegisterXlsx() {
  if (typeof XLSX === 'undefined') { if (typeof toast === 'function') toast('XLSX library not loaded', 'error'); return false; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_ipcExportAoa()), 'IPCs');
  const rars = (state.commercial && state.commercial.rars) || [];
  if (rars.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_rarExportAoa()), 'RARs');
  const proj = state.org && state.org.projects && state.org.projects[state.org.activeProjectId];
  const name = 'FGEHA-NLC_Register_' + _xlsxSafe(proj && proj.name) + '_' + _xlsxDate() + '.xlsx';
  XLSX.writeFile(wb, name);
  if (typeof toast === 'function') toast('Register exported to Excel', 'ok');
  return name;
}

function exportNodeRollupXlsx(nodeId) {
  nodeId = nodeId || (state.org && state.org.activeNodeId);
  if (typeof XLSX === 'undefined') { if (typeof toast === 'function') toast('XLSX library not loaded', 'error'); return false; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_nodeRollupAoa(nodeId)), 'Rollup');
  const node = (typeof _findNodeInTree === 'function') ? _findNodeInTree(nodeId) : null;
  const name = 'FGEHA-NLC_Rollup_' + _xlsxSafe(node && node.name) + '_' + _xlsxDate() + '.xlsx';
  XLSX.writeFile(wb, name);
  if (typeof toast === 'function') toast('Rollup exported to Excel', 'ok');
  return name;
}

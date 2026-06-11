/* ============================================================
   §NODE-REPORT  Per-node one-page command brief  (Phase E — S6)
   ============================================================
   buildNodeReportHtml(nodeId) — PURE — returns a standalone printable HTML
   document for the active node:
     • branch/root  → NLC Engineer Command Centre identity, consolidated KPI
       strip, and the subtree project list (contract / gross / certified /
       receipts / net receivable).
     • project leaf → project name + salients (Client/Consultant/Ref/dates/
       value), KPI strip, BOQ summary, and IPC + RAR registers.
   exportNodeReport() opens the document in a new window and prints it.
   ============================================================ */

function _rptMoney(n) {
  if (typeof fmt !== 'undefined' && fmt.money) { try { return fmt.money(n); } catch (e) {} }
  const v = Number(n || 0);
  return 'PKR ' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function _rptEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
function _rptDate(iso) { return (typeof _fmtMonthYear === 'function') ? _fmtMonthYear(iso) : String(iso || ''); }

function buildNodeReportHtml(nodeId) {
  const root = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
  nodeId = nodeId || (state.org && state.org.activeNodeId) || root;
  const isProject = !!(state.org && state.org.projects && state.org.projects[nodeId]);
  const rollup = (typeof computeNodeRollup === 'function') ? computeNodeRollup(nodeId) : { rows: [], totals: {} };
  const t = rollup.totals || {};
  const path = (typeof _nodePath === 'function') ? _nodePath(nodeId) : [];
  const pathTxt = path.map(c => _rptEsc(c.name)).join(' \u203a ');
  const title = isProject ? (state.org.projects[nodeId].name || 'Project')
    : (path.length ? path[path.length - 1].name : 'Consolidated Portfolio');
  const now = new Date();
  const genTxt = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const kpi = (label, val) => '<div class="k"><div class="kl">' + label + '</div><div class="kv">' + _rptMoney(val) + '</div></div>';
  let kpis = '<div class="kpis">';
  if (!isProject) kpis += '<div class="k"><div class="kl">Projects</div><div class="kv">' + (t.projectCount || 0) + '</div></div>';
  kpis += kpi('Contract Value', t.contractValue) + kpi('Gross Revenue', t.grossRevenue) + kpi('Certified', t.vettedRevenue) +
    kpi('Receipts', t.receipts) + kpi('Payments', t.payments) + kpi('Cash Position', t.cashPosition) + kpi('Net Receivable', t.netReceivable);
  kpis += '</div>';

  let body = '';
  if (isProject) {
    const p = state.org.projects[nodeId];
    const cl = p.client || {}; const w = cl.window || {};
    const span = (w.start || w.end) ? (_rptDate(w.start) + ' \u2013 ' + _rptDate(w.end)) : '\u2014';
    body += '<table class="sal"><tbody>' +
      '<tr><th>Client</th><td>' + _rptEsc(cl.name || '\u2014') + '</td><th>Consultant</th><td>' + _rptEsc(cl.designConsultant || '\u2014') + '</td></tr>' +
      '<tr><th>Contract Ref</th><td>' + _rptEsc(cl.contractRef || '\u2014') + '</td><th>Period</th><td>' + span + '</td></tr>' +
      '</tbody></table>';
    const boq = p.boq || { items: [], bills: {}, total_contract_value: 0 };
    body += '<h2>Bill of Quantities</h2><p class="sub">' + (boq.items ? boq.items.length : 0) + ' items \u00b7 ' +
      Object.keys(boq.bills || {}).length + ' bills \u00b7 value ' + _rptMoney(boq.total_contract_value) + '</p>';

    const ipcs = (typeof collectNodeDocs === 'function') ? collectNodeDocs(nodeId, 'ipcs') : [];
    body += '<h2>IPC Register</h2>';
    if (ipcs.length) {
      body += '<table class="reg"><thead><tr><th>IPC</th><th>Period</th><th>Status</th><th class="n">Gross</th><th class="n">Certified</th><th class="n">Net Payable</th></tr></thead><tbody>';
      ipcs.forEach(r => { const d = r.doc; body += '<tr><td>' + _rptEsc(d.ipcNo || d.id) + '</td><td>' + _rptEsc(d.period) + '</td><td>' + _rptEsc(d.status) + '</td><td class="n">' + _rptMoney(d.gross) + '</td><td class="n">' + _rptMoney(d.vettedGross || d.gross) + '</td><td class="n">' + _rptMoney(d.vettedNetPayable != null ? d.vettedNetPayable : d.netPayable) + '</td></tr>'; });
      body += '</tbody></table>';
    } else body += '<p class="empty">No IPCs.</p>';

    const rars = (typeof collectNodeDocs === 'function') ? collectNodeDocs(nodeId, 'rars') : [];
    body += '<h2>RAR Register</h2>';
    if (rars.length) {
      body += '<table class="reg"><thead><tr><th>RAR</th><th>Period</th><th>Status</th><th class="n">Gross</th><th class="n">Net Payable</th><th class="n">Paid</th></tr></thead><tbody>';
      rars.forEach(r => { const d = r.doc; body += '<tr><td>' + _rptEsc(d.rarNo || d.id) + '</td><td>' + _rptEsc(d.period) + '</td><td>' + _rptEsc(d.status) + '</td><td class="n">' + _rptMoney(d.gross) + '</td><td class="n">' + _rptMoney(d.netPayable) + '</td><td class="n">' + _rptMoney(d.paidAmount) + '</td></tr>'; });
      body += '</tbody></table>';
    } else body += '<p class="empty">No RARs.</p>';
  } else {
    /* branch — subtree project list */
    const rows = rollup.rows || [];
    body += '<h2>Projects (' + rows.length + ')</h2>';
    if (rows.length) {
      body += '<table class="reg"><thead><tr><th>Project</th><th class="n">Contract</th><th class="n">Gross Rev</th><th class="n">Certified</th><th class="n">Receipts</th><th class="n">Net Recv.</th></tr></thead><tbody>';
      rows.forEach(r => { body += '<tr><td>' + _rptEsc(r.name) + '</td><td class="n">' + _rptMoney(r.contractValue) + '</td><td class="n">' + _rptMoney(r.grossRevenue) + '</td><td class="n">' + _rptMoney(r.vettedRevenue) + '</td><td class="n">' + _rptMoney(r.receipts) + '</td><td class="n">' + _rptMoney(r.netReceivable) + '</td></tr>'; });
      body += '</tbody></table>';
    } else body += '<p class="empty">No projects under this node.</p>';
  }

  const css = 'body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a2230;margin:0;padding:28px 34px;}' +
    '.org{font-size:11px;letter-spacing:.08em;color:#e87722;font-weight:700;text-transform:uppercase;}' +
    'h1{font-size:21px;margin:4px 0 2px;}.path{color:#8a94a3;font-size:11.5px;}.gen{color:#8a94a3;font-size:11px;margin-top:2px;}' +
    'header{border-bottom:2px solid #0b3d2e;padding-bottom:10px;margin-bottom:14px;}' +
    '.kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;}' +
    '.k{flex:1 1 120px;border:1px solid #e3e8ef;border-radius:7px;padding:8px 10px;}' +
    '.kl{font-size:10px;color:#8a94a3;text-transform:uppercase;letter-spacing:.04em;}.kv{font-size:15px;font-weight:700;margin-top:2px;}' +
    'h2{font-size:13.5px;margin:16px 0 6px;color:#0b3d2e;border-bottom:1px solid #e3e8ef;padding-bottom:3px;}' +
    '.sub{color:#44506a;font-size:12px;margin:2px 0 6px;}.empty{color:#8a94a3;font-style:italic;}' +
    'table{width:100%;border-collapse:collapse;font-size:11.5px;}th,td{text-align:left;padding:4px 7px;border-bottom:1px solid #eef1f6;}' +
    'th{color:#44506a;}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;}' +
    'table.sal th{width:14%;color:#8a94a3;font-weight:600;}table.sal td{width:36%;}' +
    'footer{margin-top:20px;padding-top:8px;border-top:1px solid #e3e8ef;color:#8a94a3;font-size:10.5px;}' +
    '.rag-line{margin-top:6px;font-size:12px;}' +
    '.rag-dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;margin-right:5px;}' +
    '.rag-green{background:#2e9b57;}.rag-amber{background:#e0a106;}.rag-red{background:#c0392b;}' +
    '.cmd-childtitle{font-size:12px;color:#0b3d2e;font-weight:600;margin:6px 0 4px;}.cmd-scurve{margin:6px 0 4px;}' +
    '.sc-svg{width:100%;height:200px;display:block;}.sc-grid{stroke:#e8edf4;stroke-width:1;}.sc-axis{fill:#8a94a3;font-size:9px;}' +
    '.sc-planned{fill:none;stroke:#1e3a5f;stroke-width:2;}.sc-actual{fill:none;stroke:#e87722;stroke-width:2;}' +
    '.sc-legend{font-size:11px;color:#44506a;margin-top:2px;}.sc-key{display:inline-block;width:14px;height:3px;vertical-align:middle;margin:0 4px 0 8px;}' +
    '.sc-k-planned{background:#1e3a5f;}.sc-k-actual{background:#e87722;}' +
    '@media print{body{padding:0;}.k{break-inside:avoid;}tr{break-inside:avoid;}.cmd-scurve{break-inside:avoid;}}';

  const _health = (typeof nodeHealth === 'function') ? nodeHealth(nodeId) : { status: 'green', reasons: [] };
  const ragLine = '<div class="rag-line"><span class="rag-dot rag-' + _health.status + '"></span>Health: <b>' + String(_health.status).toUpperCase() + '</b>' +
    (_health.reasons && _health.reasons.length ? ' \u2014 ' + _rptEsc(_health.reasons.join(', ')) : '') + '</div>';
  const _sc = (typeof renderNodeSCurveHtml === 'function') ? renderNodeSCurveHtml(nodeId) : '';
  const scurveSection = _sc ? ('<h2>Progress</h2>' + _sc) : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + _rptEsc(title) + ' \u2014 NLC Engineer Command Centre</title><style>' + css + '</style></head><body>' +
    '<header><div class="org">National Logistic Corporation \u00b7 Engineer Command Centre</div>' +
    '<h1>' + _rptEsc(title) + '</h1>' +
    (pathTxt ? '<div class="path">' + pathTxt + '</div>' : '') +
    '<div class="gen">' + (isProject ? 'Project Brief' : 'Command Brief') + ' \u00b7 Generated ' + genTxt + '</div>' + ragLine + '</header>' +
    kpis + scurveSection + body +
    '<footer>NLC Engineer Command Centre \u00b7 Confidential \u2014 for internal management use.</footer>' +
    '</body></html>';
}

function exportNodeReport() {
  const nodeId = (state.org && state.org.activeNodeId) || ((typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc');
  let html;
  try { html = buildNodeReportHtml(nodeId); } catch (e) { if (typeof toast === 'function') toast('Could not build the report', 'error'); return; }
  const w = window.open('', '_blank');
  if (!w) { if (typeof toast === 'function') toast('Allow pop-ups to export the brief', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  try { w.focus(); } catch (e) {}
  setTimeout(() => { try { w.print(); } catch (e) {} }, 350);
  if (typeof toast === 'function') toast('Brief opened in a new tab \u2014 use your browser\u2019s Print / Save as PDF', 'info');
}

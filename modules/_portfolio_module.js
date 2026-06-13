/* ============================================================
   §PORTFOLIO  Cross-project KPI rollup  (Phase C — Session 3)
   ============================================================
   Read-only portfolio view across all projects / PD HQs.

   Compute model (locked): SWAP-COMPUTE-SWAP. For each project, transiently
   hydrate a CLONE of its data into the working set, run the existing
   computeAllKpis() verbatim (so portfolio numbers reconcile exactly with
   each project's own dashboard — no parallel arithmetic, per rev 4.7
   precedent), capture the result, then restore the ORIGINAL slice
   references. Stored partitions are never mutated; nothing is persisted
   during the loop (computeAllKpis / ensureFinancialState do not saveState).
   ============================================================ */

function computePortfolio() {
  const out = { rows: [], totals: null, activeProjectId: null };
  if (!state.org || !state.org.projects) return out;
  const active = state.org.activeProjectId;
  out.activeProjectId = active;

  /* Save EXACT original slice references so restore is reference-identical. */
  const savedRefs = {};
  _ORG_DATA_SLICES.forEach(k => { savedRefs[k] = state[k]; });
  const activeClone = _extractWorkingSet();   // clone of the live active data

  try {
    for (const id of Object.keys(state.org.projects)) {
      const p = state.org.projects[id];
      const data = (id === active)
        ? activeClone
        : JSON.parse(JSON.stringify(p.data || {}));
      _applyWorkingSet(data);                 // hydrate clone (mutation-safe)
      let k = {};
      try { k = computeAllKpis(null) || {}; } catch (e) { k = {}; }
      const t = k._totals || {};
      out.rows.push({
        id, name: p.name, pdHqId: p.pdHqId,
        client: (p.client && p.client.name) || '',
        contractValue: (p.client && p.client.contractValue) || 0,
        grossRevenue:  Number(k.grossRevenue || 0),
        vettedRevenue: Number(k.vettedRevenue || 0),
        receipts:      Number(t.totalAllReceipts || 0),
        payments:      Number(t.totalAllPayments || 0),
        cashPosition:  Number(t.cumulativeNet || 0),
        netReceivable: Number(k.netReceivable || 0),
        isActive: id === active,
      });
    }
  } finally {
    /* ALWAYS restore the original slice objects (reference-identical). */
    _ORG_DATA_SLICES.forEach(k => { state[k] = savedRefs[k]; });
  }

  out.totals = _portfolioTotals(out.rows);
  return out;
}

function _portfolioTotals(rows) {
  const keys = ['contractValue', 'grossRevenue', 'vettedRevenue', 'receipts', 'payments', 'cashPosition', 'netReceivable'];
  const t = { projectCount: rows.length };
  keys.forEach(k => { t[k] = rows.reduce((s, r) => s + Number(r[k] || 0), 0); });
  return t;
}

/* Drill-through: open a project from the rollup (reuses the S2 swap). */
function openProjectFromPortfolio(projId) {
  if (!state.org || !state.org.projects[projId]) return;
  switchActiveProject(projId);
  if (typeof switchModule === 'function') switchModule('executive');
}

function renderPortfolio() {
  const host = document.getElementById('portfolioHost');
  if (!host) return;
  const esc   = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.short) ? fmt.short : (n => String(Math.round(n)));

  const pf = computePortfolio();
  if (!pf.rows.length) { host.innerHTML = '<div class="portfolio-empty">No projects yet.</div>'; return; }

  const hqName = id => { const n = (typeof _findNodeInTree === 'function') ? _findNodeInTree(id) : null; return n ? n.name : id; };

  const cols = [
    ['Contract', 'contractValue'], ['Gross Rev', 'grossRevenue'],
    ['Certified', 'vettedRevenue'], ['Receipts', 'receipts'],
    ['Payments', 'payments'], ['Cash Pos.', 'cashPosition'],
    ['Net Recv.', 'netReceivable'],
  ];

  let head = '<th class="pf-name">Project</th><th>PD HQ</th>' + cols.map(c => '<th class="num">' + c[0] + '</th>').join('');
  let body = '';
  for (const r of pf.rows) {
    const cells = cols.map(c => '<td class="num">' + money(r[c[1]]) + '</td>').join('');
    body += '<tr class="pf-row' + (r.isActive ? ' pf-active' : '') + '" onclick="openProjectFromPortfolio(\'' + esc(r.id) + '\')" title="Open this project">' +
            '<td class="pf-name">' + esc(r.name) + (r.isActive ? ' <span class="pf-badge">active</span>' : '') + '</td>' +
            '<td>' + esc(hqName(r.pdHqId)) + '</td>' + cells + '</tr>';
  }
  const t = pf.totals;
  const totCells = cols.map(c => '<td class="num">' + money(t[c[1]]) + '</td>').join('');
  const foot = '<tr class="pf-total"><td class="pf-name">Total \u00b7 ' + t.projectCount + ' project' + (t.projectCount === 1 ? '' : 's') + '</td><td></td>' + totCells + '</tr>';

  host.innerHTML =
    '<div class="portfolio-wrap"><table class="portfolio-table">' +
    '<thead><tr>' + head + '</tr></thead>' +
    '<tbody>' + body + '</tbody>' +
    '<tfoot>' + foot + '</tfoot>' +
    '</table></div>' +
    '<div class="portfolio-note">All figures in PKR. Per-project numbers use the same <code>computeAllKpis()</code> path as each project\u2019s own dashboard. Click a row to open that project.</div>';
}

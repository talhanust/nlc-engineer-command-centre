/* ============================================================
   §CMD5  Portfolio merged into command  (Phase D — Session 5)
   ============================================================
   Folds the flat per-project portfolio table into the command center as an
   access-scoped "all projects in subtree" list, built straight from
   computeNodeRollup(nodeId).rows (already access-scoped via _projectsUnderNode).
   The standalone Portfolio nav button is retired by the merger; its
   underlying computePortfolio/renderPortfolio remain for back-compat.
   ============================================================ */

function renderSubtreeProjectsHtml(nodeId) {
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.short) ? fmt.short : (n => String(Math.round(n)));
  const rollup = computeNodeRollup(nodeId);
  const rows = rollup.rows || [];

  if (!rows.length) {
    return '<div class="cmd-allproj"><div class="cmd-childtitle">All projects in subtree (flat view)</div>' +
           '<div class="cmd-empty">No accessible projects in this subtree.</div></div>';
  }

  const body = rows.map(r => {
    const pd = (typeof _findNodeInTree === 'function') ? _findNodeInTree(r.pdHqId) : null;
    const pdName = pd ? pd.name : (r.pdHqId || '');
    return '<tr class="cmd-row" onclick="setActiveNode(\'' + esc(r.id) + '\')" title="Open ' + esc(r.name) + '">' +
           '<td class="cmd-name">' + esc(r.name) + '</td>' +
           '<td>' + esc(pdName) + '</td>' +
           '<td class="num">' + money(Number(r.contractValue || 0)) + '</td>' +
           '<td class="num">' + money(Number(r.grossRevenue || 0)) + '</td>' +
           '<td class="num">' + money(Number(r.receipts || 0)) + '</td>' +
           '<td class="num">' + money(Number(r.cashPosition || 0)) + '</td></tr>';
  }).join('');

  return '<div class="cmd-allproj">' +
         '<div class="cmd-childtitle">All projects in subtree \u2014 ' + rows.length + ' (flat view, click to open)</div>' +
         '<div class="cmd-wrap"><table class="cmd-table cmd-allproj-table"><thead><tr>' +
         '<th class="cmd-name">Project</th><th>PD HQ</th><th class="num">Contract</th><th class="num">Gross</th><th class="num">Receipts</th><th class="num">Cash Pos.</th>' +
         '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
}

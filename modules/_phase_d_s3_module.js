/* ============================================================
   §CMD3  Consolidated IPC + RAR registers  (Phase D — Session 3)
   ============================================================
   Branch control centers list every IPC and RAR across the node's subtree
   in one register, tagged by project. Pure reads of each project's
   commercial slice (active = working set, inactive = its stash) — no
   computeAllKpis, no working-set mutation, no aggregation math. Row count
   trivially equals the sum of per-project document counts.
   ============================================================ */

function collectNodeDocs(nodeId, kind) {   // kind: 'ipcs' | 'rars'
  if (!state.org || !state.org.projects) return [];
  const active = state.org.activeProjectId;
  const projects = _projectsUnderNode(nodeId);
  const out = [];
  projects.forEach(p => {
    const slice = (p.id === active) ? state.commercial : (p.data && p.data.commercial);
    const items = (slice && Array.isArray(slice[kind])) ? slice[kind] : [];
    items.forEach(doc => out.push({ projectName: p.name, projectId: p.id, doc }));
  });
  return out;
}

function renderNodeRegistersHtml(nodeId) {
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.short) ? fmt.short : (n => String(Math.round(n)));

  const ipcs = collectNodeDocs(nodeId, 'ipcs');
  const rars = collectNodeDocs(nodeId, 'rars');

  const ipcRows = ipcs.length
    ? ipcs.map(e => {
        const d = e.doc;
        return '<tr><td class="cmd-name">' + esc(e.projectName) + '</td>' +
               '<td>' + esc(d.ipcNo || d.id || '') + '</td>' +
               '<td>' + esc(d.period || '') + '</td>' +
               '<td><span class="cmd-status">' + esc(d.status || '') + '</span></td>' +
               '<td class="num">' + money(Number(d.gross || 0)) + '</td>' +
               '<td class="num">' + money(Number(d.netPayable || 0)) + '</td></tr>';
      }).join('')
    : '<tr><td colspan="6" class="cmd-empty">No IPCs in this subtree.</td></tr>';

  const rarRows = rars.length
    ? rars.map(e => {
        const d = e.doc;
        const sub = d.subId ? (d.subId + (d.subType ? ' \u00b7 ' + d.subType : '')) : '';
        return '<tr><td class="cmd-name">' + esc(e.projectName) + '</td>' +
               '<td>' + esc(d.rarNo || d.id || '') + '</td>' +
               '<td>' + esc(sub) + '</td>' +
               '<td><span class="cmd-status">' + esc(d.status || '') + '</span></td>' +
               '<td class="num">' + money(Number(d.gross || 0)) + '</td>' +
               '<td class="num">' + money(Number(d.netPayable || 0)) + '</td></tr>';
      }).join('')
    : '<tr><td colspan="6" class="cmd-empty">No RARs in this subtree.</td></tr>';

  return '<div class="cmd-registers">' +
    '<div class="cmd-childtitle">IPC register \u2014 ' + ipcs.length + ' across subtree (client billings)</div>' +
    '<div class="cmd-wrap"><table class="cmd-table cmd-reg-table"><thead><tr>' +
    '<th class="cmd-name">Project</th><th>IPC No</th><th>Period</th><th>Status</th><th class="num">Gross</th><th class="num">Net Payable</th>' +
    '</tr></thead><tbody>' + ipcRows + '</tbody></table></div>' +
    '<div class="cmd-childtitle">RAR register \u2014 ' + rars.length + ' across subtree (sub-contractor)</div>' +
    '<div class="cmd-wrap"><table class="cmd-table cmd-reg-table"><thead><tr>' +
    '<th class="cmd-name">Project</th><th>RAR No</th><th>Sub-contractor</th><th>Status</th><th class="num">Gross</th><th class="num">Net Payable</th>' +
    '</tr></thead><tbody>' + rarRows + '</tbody></table></div>' +
    '</div>';
}

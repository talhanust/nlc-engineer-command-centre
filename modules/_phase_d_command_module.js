/* ============================================================
   §CMD  Hierarchical Command Center  (Phase D — Session 1)
   ============================================================
   Generalises "active project" → "active NODE". A leaf (project) node
   behaves as before (switch active project, detailed control center). A
   branch node (HQ NLC / HQ Engrs / a PD) shows a roll-up control center
   aggregating every project in its subtree — same template at each level,
   differing only in scope. Reuses the S3 swap-compute-swap engine.

   Foundation only: KPI roll-up + drill-down child list + breadcrumb.
   Richer per-module aggregation (S-curves, cash flow, IPC lists) deferred.
   ============================================================ */

const ROOT_NODE_ID = 'hq-nlc';

/* ---- node helpers ---- */
function getActiveNode() {
  const id = (state.org && state.org.activeNodeId) || ROOT_NODE_ID;
  const n = _findNodeInTree(id);
  if (n) return n;
  if (state.org && state.org.projects[id]) {
    const p = state.org.projects[id];
    return { id, name: p.name, type: 'project', pdHqId: p.pdHqId };
  }
  return _findNodeInTree(ROOT_NODE_ID);
}

/* pd_hq ids contained in a node's subtree (the node itself if it IS a pd_hq) */
function _subtreePdHqIds(nodeId) {
  const out = [];
  const start = _findNodeInTree(nodeId);
  (function walk(n) { if (!n) return; if (n.type === 'pd_hq') out.push(n.id); (n.children || []).forEach(walk); })(start);
  return out;
}

/* live projects under a node (subtree); a project node → just itself */
function _projectsUnderNode(nodeId) {
  if (state.org && state.org.projects[nodeId]) {
    const p = state.org.projects[nodeId];
    return p.archived ? [] : [p];
  }
  const pdIds = _subtreePdHqIds(nodeId);
  return Object.values(state.org.projects).filter(p => !p.archived && pdIds.indexOf(p.pdHqId) !== -1);
}

/* immediate navigable children of a node */
function _immediateChildNodes(nodeId) {
  const n = _findNodeInTree(nodeId);
  if (!n) return [];
  if (n.type === 'pd_hq') {
    return Object.values(state.org.projects)
      .filter(p => !p.archived && p.pdHqId === nodeId)
      .map(p => ({ id: p.id, name: p.name, type: 'project', pdHqId: p.pdHqId }));
  }
  return (n.children || []).map(c => ({ id: c.id, name: c.name, type: c.type }));
}

/* breadcrumb path root → node */
function _nodePath(nodeId) {
  const path = [];
  let cur = nodeId;
  if (state.org && state.org.projects[cur]) {
    const p = state.org.projects[cur];
    path.unshift({ id: cur, name: p.name, type: 'project' });
    cur = p.pdHqId;
  }
  let guard = 0;
  while (cur && guard++ < 12) {
    const n = _findNodeInTree(cur);
    if (!n) break;
    path.unshift({ id: n.id, name: n.name, type: n.type });
    const parent = _findParentInTree(n.id);
    cur = parent ? parent.id : null;
  }
  return path;
}

/* ---- subtree rollup (swap-compute-swap, scoped) ---- */
function computeNodeRollup(nodeId) {
  const out = { nodeId, rows: [], totals: null };
  if (!state.org || !state.org.projects) return out;
  const active = state.org.activeProjectId;
  const projects = _projectsUnderNode(nodeId);

  const savedRefs = {};
  _ORG_DATA_SLICES.forEach(k => { savedRefs[k] = state[k]; });
  const activeClone = _extractWorkingSet();
  try {
    for (const p of projects) {
      const data = (p.id === active) ? activeClone : JSON.parse(JSON.stringify(p.data || {}));
      _applyWorkingSet(data);
      let k = {};
      try { k = computeAllKpis(null) || {}; } catch (e) { k = {}; }
      const t = k._totals || {};
      out.rows.push({
        id: p.id, name: p.name, pdHqId: p.pdHqId,
        contractValue: (p.client && p.client.contractValue) || 0,
        grossRevenue: Number(k.grossRevenue || 0),
        vettedRevenue: Number(k.vettedRevenue || 0),
        receipts: Number(t.totalAllReceipts || 0),
        payments: Number(t.totalAllPayments || 0),
        cashPosition: Number(t.cumulativeNet || 0),
        netReceivable: Number(k.netReceivable || 0),
      });
    }
  } finally {
    _ORG_DATA_SLICES.forEach(k => { state[k] = savedRefs[k]; });
  }
  const keys = ['contractValue', 'grossRevenue', 'vettedRevenue', 'receipts', 'payments', 'cashPosition', 'netReceivable'];
  const tot = { projectCount: out.rows.length };
  keys.forEach(k => { tot[k] = out.rows.reduce((s, r) => s + Number(r[k] || 0), 0); });
  out.totals = tot;
  return out;
}

/* ---- navigation ---- */
function setActiveNode(nodeId) {
  if (!state.org) return false;
  const isProject = !!state.org.projects[nodeId];
  const node = isProject ? null : _findNodeInTree(nodeId);
  if (!isProject && !node) return false;

  state.org.activeNodeId = nodeId;
  if (isProject) {
    /* leaf → become the active project + open its detailed control center */
    if (typeof switchActiveProject === 'function') switchActiveProject(nodeId);
    if (typeof saveState === 'function') saveState();
    if (typeof switchModule === 'function') switchModule('executive');
    return true;
  }
  /* branch → stay in the command module, re-render the rollup */
  if (typeof saveState === 'function') saveState();
  if (typeof state.ui === 'object' && state.ui.activeModule === 'command') renderCommandCenter();
  else if (typeof switchModule === 'function') switchModule('command');
  return true;
}

/* ---- render ---- */
function renderCommandCenter() {
  const host = document.getElementById('commandHost');
  if (!host) return;
  if (!state.org) { host.innerHTML = ''; return; }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.short) ? fmt.short : (n => String(Math.round(n)));

  const node = getActiveNode();
  const rollup = computeNodeRollup(node.id);

  /* breadcrumb */
  const path = _nodePath(node.id);
  const crumbs = path.map((c, i) =>
    (i === path.length - 1)
      ? '<span class="cmd-crumb cmd-crumb-cur">' + esc(c.name) + '</span>'
      : '<a class="cmd-crumb" onclick="setActiveNode(\'' + esc(c.id) + '\')">' + esc(c.name) + '</a>'
  ).join('<span class="cmd-sep">\u203a</span>');

  /* KPI strip from node totals */
  const t = rollup.totals;
  const kpi = (label, val) => '<div class="cmd-kpi"><div class="cmd-kpi-label">' + label + '</div><div class="cmd-kpi-val">' + money(val) + '</div></div>';
  const strip =
    '<div class="cmd-kpis">' +
    '<div class="cmd-kpi"><div class="cmd-kpi-label">Projects</div><div class="cmd-kpi-val">' + t.projectCount + '</div></div>' +
    kpi('Contract', t.contractValue) + kpi('Gross Rev', t.grossRevenue) + kpi('Certified', t.vettedRevenue) +
    kpi('Receipts', t.receipts) + kpi('Payments', t.payments) + kpi('Cash Pos.', t.cashPosition) + kpi('Net Recv.', t.netReceivable) +
    '</div>';

  /* child drill-down: subtotal each immediate child from rollup rows */
  const children = _immediateChildNodes(node.id);
  let childRows = ''; let _shownChildren = 0, _hiddenChildren = 0;
  if (children.length) {
    for (const ch of children) {
      const chPdIds = (ch.type === 'project') ? null : _subtreePdHqIds(ch.id);
      const rows = (ch.type === 'project')
        ? rollup.rows.filter(r => r.id === ch.id)
        : rollup.rows.filter(r => chPdIds.indexOf(r.pdHqId) !== -1);
      const sum = key => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
      const typeLabel = ch.type === 'project' ? 'project' : (ch.type === 'pd_hq' ? 'PD HQ' : ch.type);
      const _h = (typeof nodeHealth === 'function')
        ? nodeHealth(ch.id)
        : { status: 'green', reasons: [] };
      if (typeof _childMatchesFilter === 'function' && !_childMatchesFilter(ch, _h.status)) { _hiddenChildren++; continue; }
      _shownChildren++;
      childRows +=
        '<tr class="cmd-row" onclick="setActiveNode(\'' + esc(ch.id) + '\')" title="Open ' + esc(ch.name) + (_h.reasons && _h.reasons.length ? ' \u2014 ' + esc(_h.reasons.join(', ')) : '') + '">' +
        '<td class="cmd-name">' + (typeof _ragDot === 'function' ? _ragDot(_h.status) : '') + esc(ch.name) + ' <span class="cmd-type">' + esc(typeLabel) + '</span></td>' +
        '<td class="num">' + (ch.type === 'project' ? 1 : rows.length) + '</td>' +
        '<td class="num">' + money(sum('contractValue')) + '</td>' +
        '<td class="num">' + money(sum('grossRevenue')) + '</td>' +
        '<td class="num">' + money(sum('receipts')) + '</td>' +
        '<td class="num">' + money(sum('payments')) + '</td>' +
        '<td class="num">' + money(sum('cashPosition')) + '</td>' +
        '</tr>';
    }
    if (typeof _filterNoteHtml === 'function' && _hiddenChildren) {
      childRows += '<tr class="filter-note-row"><td colspan="7">' + _filterNoteHtml(_shownChildren, _hiddenChildren) + '</td></tr>';
    }
  } else {
    childRows = '<tr><td colspan="7" class="cmd-empty">' + (typeof _emptyStateHtml === 'function' ? _emptyStateHtml(node) : 'Leaf node \u2014 open its control center from the breadcrumb.') + '</td></tr>';
  }

  const childLabel = (node.type === 'pd_hq') ? 'Projects' : (node.type === 'hq_engrs') ? 'PD HQs' : (node.type === 'hq') ? 'Subordinate HQ' : 'Children';

  host.innerHTML =
    '<div class="cmd-breadcrumb">' + crumbs + '</div>' +
    '<div class="cmd-nodehead"><span class="cmd-nodetype">' + esc(node.type) + '</span> ' + esc(node.name) + '</div>' +
    strip +
    '<div class="cmd-export"><button class="btn btn-sm" onclick="exportNodeRollupXlsx()">\u2b07 Export rollup (XLSX)</button></div>' +
    (typeof renderExceptionsFeed === 'function' ? renderExceptionsFeed(node.id) : '') +
    '<div class="cmd-childtitle">' + childLabel + ' under this node \u2014 click to drill down</div>' +
    '<div class="cmd-wrap"><table class="cmd-table"><thead><tr>' +
    '<th class="cmd-name">Node</th><th class="num">Projects</th><th class="num">Contract</th><th class="num">Gross Rev</th>' +
    '<th class="num">Receipts</th><th class="num">Payments</th><th class="num">Cash Pos.</th>' +
    '</tr></thead><tbody>' + childRows + '</tbody></table></div>' +
    (typeof renderLeagueTable === 'function' ? renderLeagueTable(node.id) : '') +
    (typeof renderPipelineHtml === 'function' ? renderPipelineHtml(node.id) : '') +
    (typeof renderNodeComments === 'function' ? renderNodeComments(node.id) : '') +
    '<div class="cmd-note">All figures PKR \u00b7 aggregated across this node\u2019s subtree via the same <code>computeAllKpis()</code> path as each project\u2019s dashboard.</div>';
}

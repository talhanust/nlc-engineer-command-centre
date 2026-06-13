/* ============================================================
   §CMD2  Aggregated cash flow + top-bar navigator  (Phase D — S2)
   ============================================================
   - computeNodeCashFlow(nodeId): subtree-scoped monthly cash-flow,
     merging each project's computeCashFlowByMonth() buckets (money sums
     cleanly across projects), recomputing net + cumulative. Reuses the
     existing renderCashFlowChart() for the visual. Non-destructive.
   - renderOrgNavigator(): a top-bar select to jump to any org node from
     anywhere (branch -> Command module; leaf project -> its control center).
   ============================================================ */

function computeNodeCashFlow(nodeId) {
  if (!state.org || !state.org.projects) return [];
  const active = state.org.activeProjectId;
  const projects = _projectsUnderNode(nodeId);

  const savedRefs = {};
  _ORG_DATA_SLICES.forEach(k => { savedRefs[k] = state[k]; });
  const activeClone = _extractWorkingSet();
  const merged = {};   // monthKey -> { monthKey, receipts, payments }
  try {
    for (const p of projects) {
      const data = (p.id === active) ? activeClone : JSON.parse(JSON.stringify(p.data || {}));
      _applyWorkingSet(data);
      let buckets = [];
      try { buckets = computeCashFlowByMonth() || []; } catch (e) { buckets = []; }
      buckets.forEach(b => {
        if (!merged[b.monthKey]) merged[b.monthKey] = { monthKey: b.monthKey, receipts: 0, payments: 0, net: 0, cumulative: 0 };
        merged[b.monthKey].receipts += Number(b.receipts || 0);
        merged[b.monthKey].payments += Number(b.payments || 0);
      });
    }
  } finally {
    _ORG_DATA_SLICES.forEach(k => { state[k] = savedRefs[k]; });
  }
  const sorted = Object.values(merged).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  let running = 0;
  sorted.forEach(b => { b.net = b.receipts - b.payments; running += b.net; b.cumulative = running; });
  return sorted;
}

/* HTML section injected into the command center (chart reuses the app's
   existing renderCashFlowChart; a compact monthly table follows). */
function renderNodeCashFlowHtml(nodeId) {
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.short) ? fmt.short : (n => String(Math.round(n)));
  const series = computeNodeCashFlow(nodeId);
  let chart = '';
  if (typeof renderCashFlowChart === 'function') { try { chart = renderCashFlowChart(series); } catch (e) { chart = ''; } }

  let rows = '';
  if (!series.length) {
    rows = '<tr><td colspan="5" class="cmd-empty">No cash-flow activity in this subtree yet.</td></tr>';
  } else {
    series.forEach(b => {
      rows += '<tr><td class="cmd-name">' + esc(b.monthKey) + '</td>' +
              '<td class="num">' + money(b.receipts) + '</td>' +
              '<td class="num">' + money(b.payments) + '</td>' +
              '<td class="num">' + money(b.net) + '</td>' +
              '<td class="num">' + money(b.cumulative) + '</td></tr>';
    });
  }
  return '<div class="cmd-cashflow">' +
         '<div class="cmd-childtitle">Aggregated cash flow \u2014 ' + series.length + ' month' + (series.length === 1 ? '' : 's') + ' across this subtree</div>' +
         '<div class="cmd-cf-chart">' + chart + '</div>' +
         '<div class="cmd-wrap"><table class="cmd-table cmd-cf-table"><thead><tr>' +
         '<th class="cmd-name">Month</th><th class="num">Receipts</th><th class="num">Payments</th><th class="num">Net</th><th class="num">Cumulative</th>' +
         '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

/* ---- top-bar org navigator ---- */
function renderOrgNavigator() {
  const host = document.getElementById('orgNavHost');
  if (!host) return;
  if (!state.org || !state.org.tree) { host.innerHTML = ''; return; }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const activeId = (state.org.activeNodeId) || ROOT_NODE_ID;

  let opts = '';
  (function walk(n, depth) {
    if (!n) return;
    const pad = '\u00a0\u00a0'.repeat(depth);
    const sel = (n.id === activeId) ? ' selected' : '';
    opts += '<option value="' + esc(n.id) + '"' + sel + '>' + pad + esc(n.name) + '</option>';
    (n.children || []).forEach(c => walk(c, depth + 1));
    /* projects under a pd_hq are navigable leaves */
    if (n.type === 'pd_hq') {
      Object.values(state.org.projects)
        .filter(p => !p.archived && p.pdHqId === n.id)
        .forEach(p => {
          const psel = (p.id === activeId) ? ' selected' : '';
          opts += '<option value="' + esc(p.id) + '"' + psel + '>' + '\u00a0\u00a0'.repeat(depth + 1) + '\u2022 ' + esc(p.name) + '</option>';
        });
    }
  })(state.org.tree, 0);

  host.innerHTML = '<span class="ctrl-label">Node</span>' +
                   '<select id="orgNavSelect" onchange="setActiveNode(this.value)">' + opts + '</select>';
}

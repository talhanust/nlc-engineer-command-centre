/* ============================================================
   §BILLING-PIPELINE  IPCs by stage  (Phase E — S20)
   ============================================================
   A funnel of IPC value by workflow stage (draft → submitted → vetted →
   forwarded → approved → paid-pending → paid), aggregated across every project
   under the node. Active project's IPCs come from state.commercial; inactive
   projects from their stashed p.data.commercial.ipcs (same active/inactive
   split as computeNodeSCurve). Pure HTML-returning; empty → omitted.
   ============================================================ */

function _pipelineStages() {
  if (typeof IPC_PIPELINE_STAGES !== 'undefined' && IPC_PIPELINE_STAGES) return Object.keys(IPC_PIPELINE_STAGES);
  return ['draft', 'submitted', 'vetted', 'forwarded_to_client', 'approved', 'paid_pending_ack', 'paid'];
}

function _projectIpcs(p) {
  if (!p) return [];
  if (state.org && state.org.activeProjectId === p.id) return (state.commercial && state.commercial.ipcs) || [];
  return (p.data && p.data.commercial && p.data.commercial.ipcs) || [];
}

function computeNodePipeline(nodeId) {
  const stages = _pipelineStages();
  const buckets = {}; stages.forEach(s => { buckets[s] = { key: s, count: 0, value: 0 }; });
  const projs = (typeof _projectsUnderNode === 'function') ? _projectsUnderNode(nodeId) : [];
  (projs || []).forEach(p => {
    if (!p || p.archived) return;
    _projectIpcs(p).forEach(ipc => {
      const k = ipc && ipc.status;
      if (buckets[k]) { buckets[k].count++; buckets[k].value += Number(ipc.gross || 0); }
    });
  });
  const arr = stages.map(s => buckets[s]);
  const totalValue = arr.reduce((a, b) => a + b.value, 0);
  const totalCount = arr.reduce((a, b) => a + b.count, 0);
  return { stages: arr, totalValue: totalValue, totalCount: totalCount };
}

function _pipelineLabel(k) { return String(k || '').replace(/_/g, ' '); }

function renderPipelineHtml(nodeId) {
  const p = computeNodePipeline(nodeId);
  if (!p.totalCount) return '';
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.money) ? fmt.money : (n => String(n));
  const max = Math.max(1, ...p.stages.map(s => s.value));
  const rows = p.stages.map(s => {
    const w = Math.max(s.count ? 2 : 0, Math.round(s.value / max * 100));
    return '<div class="pipe-row">' +
      '<div class="pipe-label">' + esc(_pipelineLabel(s.key)) + '</div>' +
      '<div class="pipe-bar-wrap"><div class="pipe-bar pipe-' + esc(s.key) + '" style="width:' + w + '%"></div></div>' +
      '<div class="pipe-meta"><span class="pipe-count">' + s.count + '</span><span class="pipe-val">' + money(s.value) + '</span></div>' +
      '</div>';
  }).join('');
  return '<div class="pipe-wrap"><div class="cmd-childtitle">Billing pipeline \u2014 IPCs by stage ' +
    '<span class="pipe-tot">' + p.totalCount + ' IPCs \u00b7 ' + money(p.totalValue) + '</span></div>' + rows + '</div>';
}

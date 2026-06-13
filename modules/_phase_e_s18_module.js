/* ============================================================
   §EXCEPTIONS-FEED  (Phase E — S18)
   ============================================================
   Branch dashboards surface an exceptions feed: every non-green project under
   the node, red first then amber, each with its health reasons and a click to
   drill straight in. Reuses nodeHealth (S8) over _projectsUnderNode, so it
   reflects the same RAG thresholds, schedule-slippage and collection signals
   as the rest of the app. Pure HTML-returning (composes into the command
   center innerHTML); empty → an all-clear note.
   ============================================================ */

function computeNodeExceptions(nodeId) {
  const out = [];
  const projs = (typeof _projectsUnderNode === 'function') ? _projectsUnderNode(nodeId) : [];
  (projs || []).forEach(p => {
    if (!p || p.archived) return;
    const h = (typeof nodeHealth === 'function') ? nodeHealth(p.id) : { status: 'green', reasons: [] };
    if (h.status === 'red' || h.status === 'amber') {
      out.push({ id: p.id, name: p.name || p.id, status: h.status, reasons: (h.reasons || []).slice() });
    }
  });
  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'red' ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  return out;
}

function renderExceptionsFeed(nodeId) {
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const ex = computeNodeExceptions(nodeId);
  if (!ex.length) {
    return '<div class="exc-feed exc-clear"><div class="exc-h">Exceptions</div>' +
      '<div class="exc-none">\u2713 No exceptions \u2014 every project under this node is green.</div></div>';
  }
  const redN = ex.filter(e => e.status === 'red').length;
  const ambN = ex.length - redN;
  const rows = ex.map(e =>
    '<div class="exc-row exc-' + e.status + '" onclick="if(typeof setActiveNode===\'function\')setActiveNode(\'' + esc(e.id) + '\')" title="Open ' + esc(e.name) + '">' +
    '<span class="exc-dot exc-dot-' + e.status + '"></span>' +
    '<span class="exc-name">' + esc(e.name) + '</span>' +
    '<span class="exc-reasons">' + esc((e.reasons || []).join(' \u00b7 ') || (e.status === 'red' ? 'At risk' : 'Watch')) + '</span>' +
    '<span class="exc-go">\u203a</span>' +
    '</div>'
  ).join('');
  return '<div class="exc-feed"><div class="exc-h">Exceptions ' +
    '<span class="exc-badge">' + redN + ' red \u00b7 ' + ambN + ' amber</span></div>' + rows + '</div>';
}

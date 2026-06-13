/* ============================================================
   §HEADER-CONTEXT  Active-node-aware header  (Phase E — S4)
   ============================================================
   The header band reflects the ACTIVE NODE, not always a project:
     • root / branch (HQ / HQ Engineers / PD HQ) → org identity:
         "NATIONAL LOGISTIC CORPORATION" / "Engineer Command Centre"
         + scope line ("{node} · N projects").
     • project leaf → the project's own identity:
         org tagline (small) / project name + salients line
         (Client · Consultant · start–finish · Ref).
   Driven by state.org.activeNodeId (set on every project pick), so the
   identity follows the user as they drill the hierarchy.
   ============================================================ */

var _HDR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function _fmtMonthYear(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length < 2) return String(iso);
  const mi = parseInt(parts[1], 10) - 1;
  return (_HDR_MON[mi] || '') + ' ' + parts[0];
}

function _hdrNodeName(nodeId) {
  let found = '';
  (function walk(n) { if (!n || found) return; if (n.id === nodeId) { found = n.name || ''; return; } (n.children || []).forEach(walk); })(state.org && state.org.tree);
  return found;
}

function _renderHeaderImpl() {
  const ORG_TITLE = 'NATIONAL LOGISTIC CORPORATION';
  const ORG_SUB = 'Engineer Command Centre';
  const nodeId = (state.org && state.org.activeNodeId) || null;
  const isProject = !!(state.org && state.org.projects && nodeId && state.org.projects[nodeId]);

  if (!state.org || !isProject) {
    /* org / branch level — consolidated command-centre identity */
    safeSetText('hdrProjectTitle', ORG_TITLE);
    safeSetText('hdrProjectSubtitle', ORG_SUB);
    let meta = 'Consolidated Portfolio';
    try {
      const root = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
      const n = (typeof _projectsUnderNode === 'function' && nodeId) ? _projectsUnderNode(nodeId).length : null;
      const nodeName = (nodeId && nodeId !== root) ? _hdrNodeName(nodeId) : '';
      if (nodeName) meta = nodeName + (n != null ? ' \u00b7 ' + n + ' project' + (n === 1 ? '' : 's') : '');
      else if (n != null) meta = 'Consolidated Portfolio \u00b7 ' + n + ' project' + (n === 1 ? '' : 's');
    } catch (e) {}
    safeSetText('hdrProjectMeta', meta);
    return;
  }

  /* project leaf — show its own salients on every page */
  const p = state.org.projects[nodeId];
  const cl = p.client || {};
  safeSetText('hdrProjectTitle', ORG_TITLE + ' \u00b7 ' + ORG_SUB);
  safeSetText('hdrProjectSubtitle', p.name || p.shortName || 'Project');
  const w = cl.window || {};
  const span = (w.start || w.end) ? (_fmtMonthYear(w.start) + ' \u2013 ' + _fmtMonthYear(w.end)) : '';
  const bits = [];
  if (cl.name) bits.push('Client: ' + cl.name);
  if (cl.designConsultant) bits.push('Consultant: ' + cl.designConsultant);
  if (span) bits.push(span);
  if (cl.contractRef) bits.push('Ref: ' + cl.contractRef);
  safeSetText('hdrProjectMeta', bits.join('  \u00b7  '));

  /* keep the parameterized commercial-tab client labels working */
  const clientName = cl.name || PROJECT_META.client;
  const m = /\(([^)]+)\)\s*$/.exec(clientName || '');
  const clientShort = m ? m[1] : clientName;
  safeSetText('advClientLabel', 'Client Receipts (' + clientShort + ' \u2192 NLC)');
  safeSetText('epcClientLabel', clientShort);
  safeSetText('reconClientLabel', clientShort);
}

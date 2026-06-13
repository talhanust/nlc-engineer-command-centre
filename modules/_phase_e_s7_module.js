/* ============================================================
   §SHELL-MODE  Guided drill-down shell  (Phase E — S7)
   ============================================================
   The active node's TYPE decides what's on screen:
     • branch (HQ NLC / HQ Engineers / PD HQ) → ONLY that level's Dashboard
       (the command centre); the five project tabs are hidden. Drill down via
       the breadcrumb chips / dashboard child cards; climb up via breadcrumb.
     • project leaf → the project tabs (Executive default) appear.
   Admin (the Settings pane: add project, BOQ/baseline import, demo data,
   project details) is reachable ONLY at HQ Engineers and PD HQ levels, via the
   ⚙ Admin button (toggles Dashboard ⇄ Admin). The app lands on HQ NLC.
   ============================================================ */

var _PROJECT_TABS = ['executive', 'commercial', 'execution', 'mapping', 'procurement', 'financial'];

function _shellNode(nodeId) {
  let found = null;
  (function walk(n) { if (!n || found) return; if (n.id === nodeId) { found = n; return; } (n.children || []).forEach(walk); })(state.org && state.org.tree);
  return found;
}
function _shellNodeType(nodeId) {
  const root = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
  if (nodeId === root) return 'root';
  if (state.org && state.org.projects && state.org.projects[nodeId]) return 'project';
  const n = _shellNode(nodeId);
  return n ? (n.type || 'branch') : 'branch';
}

function applyShellMode() {
  if (!state.org) return;
  if (!document || typeof document.querySelector !== 'function') return;
  try {
    const root = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
    const nodeId = state.org.activeNodeId || root;
    const isProject = !!(state.org.projects && state.org.projects[nodeId]);
    const nav = document.querySelector('.module-switch');
    const adminCtrl = document.getElementById('adminCtrl');
    const adminBtn = document.getElementById('adminBtn');

    if (isProject) {
      /* project workspace — show the project tabs only */
      if (nav) nav.style.display = '';
      document.querySelectorAll('.mod-btn').forEach(b => {
        b.style.display = (_PROJECT_TABS.indexOf(b.dataset.module) >= 0) ? '' : 'none';
      });
      const cur = state.ui.activeModule;
      if (typeof switchModule === 'function') switchModule(_PROJECT_TABS.indexOf(cur) >= 0 ? cur : 'executive');
      if (adminCtrl) adminCtrl.style.display = 'none';
    } else {
      /* branch dashboard — hide the project tab bar entirely */
      if (nav) nav.style.display = 'none';
      const nt = _shellNodeType(nodeId);
      const showAdmin = (nodeId === 'hq-engrs') || (nt === 'pd_hq');
      const valid = (state.ui.activeModule === 'command') || (state.ui.activeModule === 'settings' && showAdmin);
      if (!valid && typeof switchModule === 'function') switchModule('command');
      if (adminCtrl) adminCtrl.style.display = showAdmin ? '' : 'none';
      if (adminBtn) adminBtn.textContent = (state.ui.activeModule === 'settings') ? '\u2190 Dashboard' : '\u2699 Admin';
    }
  } catch (e) { /* shell is cosmetic — never break refreshAll/boot */ }
  if (typeof _syncNodeHash === 'function') { try { _syncNodeHash(); } catch (e) {} }
  if (typeof _pushRecentNode === 'function') { try { _pushRecentNode(state.org && state.org.activeNodeId); } catch (e) {} }
}

function openAdmin() {
  if (!state.org || typeof switchModule !== 'function') return;
  switchModule(state.ui.activeModule === 'settings' ? 'command' : 'settings');
  if (typeof applyShellMode === 'function') applyShellMode();
}

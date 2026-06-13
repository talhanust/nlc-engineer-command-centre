/* ============================================================
   §PROJECT-COMMENTS  Notes on project views  (Phase E — S23)
   ============================================================
   Surfaces the per-node comments (S22) on project leaf views too: the active
   project's notes render into a host on the Executive pane. Reuses the exact
   same store + renderNodeComments, so a project's thread is identical whether
   viewed here or referenced elsewhere. Cleared on branch views (whose command
   center already shows the panel), so the host is never double-rendered.
   ============================================================ */

function renderProjectComments() {
  const host = document.getElementById('projectCommentsHost');
  if (!host) return;
  const id = state.org && state.org.activeNodeId;
  const isProject = !!(state.org && state.org.projects && id && state.org.projects[id]);
  if (isProject && typeof renderNodeComments === 'function') host.innerHTML = renderNodeComments(id);
  else host.innerHTML = '';
}

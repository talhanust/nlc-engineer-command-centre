/* ============================================================
   §ORG-DELETE  Project hard delete  (Phase C — Session 9 / closeout)
   ============================================================
   Irreversible removal of an ARCHIVED project and its data partition.
   Archived-only by design (locked): you must archive a project first,
   making deletion a deliberate two-step and structurally guaranteeing
   the last LIVE project can never be deleted (S4 forbids archiving it).
   ============================================================ */

function hardDeleteProject(projId) {
  if (!state.org || !state.org.projects[projId]) return { ok: false, reason: 'not_found' };
  const p = state.org.projects[projId];
  if (!p.archived) return { ok: false, reason: 'not_archived' };          // archived-only
  if (state.org.activeProjectId === projId) return { ok: false, reason: 'active' };  // defensive

  const meta = { name: p.name, pdHqId: p.pdHqId };
  delete state.org.projects[projId];      // removes the project AND its data-partition stash
  audit('org.project.delete', 'org', projId,
        { name: meta.name, pdHqId: meta.pdHqId, archived: true }, null,
        'Project permanently deleted (was archived)');
  saveState();

  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  if (typeof renderPortfolio === 'function') { try { renderPortfolio(); } catch (e) {} }
  return { ok: true };
}

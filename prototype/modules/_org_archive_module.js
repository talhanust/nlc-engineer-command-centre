/* ============================================================
   §ORG-ARCHIVE  Project archive / restore  (Phase C — Session 4)
   ============================================================
   Soft delete only (recoverable). archiveProject() flags a project
   archived; its data partition is preserved untouched in its stash.
   Archived projects are hidden from the switcher and excluded from the
   portfolio rollup, but remain visible (with a Restore action) in
   Settings → Projects. No hard delete this session.

   Guards:
     - cannot archive a non-existent or already-archived project
     - cannot archive the LAST non-archived project (always keep one live)
     - archiving the ACTIVE project auto-switches to another live project
       first (via switchActiveProject, which safely stashes its data)
   ============================================================ */

function _liveProjects() {
  if (!state.org || !state.org.projects) return [];
  return Object.values(state.org.projects).filter(p => !p.archived);
}

function archiveProject(projId) {
  if (!state.org || !state.org.projects[projId]) return { ok: false, reason: 'not_found' };
  const p = state.org.projects[projId];
  if (p.archived) return { ok: false, reason: 'already_archived' };

  const live = _liveProjects();
  if (live.length <= 1) return { ok: false, reason: 'last_project' };

  let switchedTo = null;
  if (state.org.activeProjectId === projId) {
    /* Move off the project before archiving so the working set holds a
       live project; switchActiveProject stashes projId's data safely. */
    const next = live.find(x => x.id !== projId);
    switchActiveProject(next.id);
    switchedTo = next.id;
  }

  p.archived = true;
  p.archivedAt = new Date().toISOString();
  audit('org.project.archive', 'org', projId,
        { archived: false }, { archived: true, archivedAt: p.archivedAt, switchedTo },
        'Project archived (soft delete; data partition preserved)');
  saveState();

  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  if (typeof renderPortfolio === 'function') { try { renderPortfolio(); } catch (e) {} }
  return { ok: true, switchedTo };
}

function restoreProject(projId) {
  if (!state.org || !state.org.projects[projId]) return false;
  const p = state.org.projects[projId];
  if (!p.archived) return false;

  p.archived = false;
  delete p.archivedAt;
  audit('org.project.restore', 'org', projId, { archived: true }, { archived: false }, 'Project restored');
  saveState();

  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  if (typeof renderPortfolio === 'function') { try { renderPortfolio(); } catch (e) {} }
  return true;
}

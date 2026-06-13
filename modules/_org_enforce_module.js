/* ============================================================
   §ORG-ENFORCE  Access enforcement  (Phase C — Session 7)
   ============================================================
   Composes the project×role axis (S6 canAccessProject) into the app's
   existing action×role gates (canDo / requireRole). When the current
   role has no access to the ACTIVE project, every gated action is denied
   (read-only); viewing is unaffected. admin bypasses (via canAccessProject).

   Permissive in non-project contexts (no org / no active project) so
   legacy paths and early boot are unaffected.
   ============================================================ */

function _activeProjectAccessible() {
  if (!state.org || !state.org.activeProjectId) return true;   // no project context → permissive
  if (typeof canAccessProject !== 'function') return true;
  return canAccessProject(state.org.activeProjectId);          // current role; admin bypass inside
}

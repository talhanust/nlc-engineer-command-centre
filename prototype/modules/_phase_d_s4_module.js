/* ============================================================
   §CMD4  Access-scoped rollups  (Phase D — Session 4)
   ============================================================
   Composes Phase C access control (canAccessProject, S6) with the Phase D
   hierarchy: branch roll-ups (KPIs, cash flow, registers), the drill-down
   child list, and the top-bar navigator only include projects the CURRENT
   role may access. admin bypasses; legacy/no-list projects stay permissive.
   Single predicate `_accessibleProject` is wired into _projectsUnderNode,
   _immediateChildNodes and renderOrgNavigator, so every rollup that flows
   through them is scoped at once.
   ============================================================ */

function _accessibleProject(p) {
  if (!p) return false;
  if (typeof canAccessProject !== 'function') return true;   // permissive if access layer absent
  return canAccessProject(p.id);                             // current role; admin bypass inside
}

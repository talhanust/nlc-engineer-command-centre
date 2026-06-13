/* ============================================================
   §ORG-ACCESS  Access control foundation  (Phase C — Session 6)
   ============================================================
   FOUNDATION ONLY: per-project role membership + accessors + switcher
   filtering + Settings matrix editor. This session does NOT yet gate
   module renders or individual actions (deferred to a follow-on) — it
   establishes the data model and the most visible integration (the
   project switcher only lists projects the current role may access).

   Model: project.access = { roles: [<non-admin role keys>] }.
   admin always passes (implicit, not stored/toggled). Projects with no
   access list (legacy) are treated as all-access (permissive default).
   ============================================================ */

function _allRoleKeys() { return (typeof ROLES === 'object') ? Object.keys(ROLES) : []; }
function _accessRoleKeys() { return _allRoleKeys().filter(r => r !== 'admin'); }
function _currentRole() { return (state.session && state.session.role) || 'qs'; }

/* Idempotent boot migration — give every project an access list (all
   non-admin roles permitted by default so nothing disappears on upgrade). */
function migrateAccessControl() {
  if (!state.org || !state.org.projects) return { migrated: false, alreadyPresent: true };
  if (state.org.accessMigrated) return { migrated: false, alreadyPresent: true };
  const all = _accessRoleKeys();
  let projectsInitialized = 0;
  for (const id of Object.keys(state.org.projects)) {
    const p = state.org.projects[id];
    if (!p.access || !Array.isArray(p.access.roles)) {
      p.access = { roles: all.slice() };
      projectsInitialized++;
    }
  }
  state.org.accessMigrated = true;
  audit('org.access.migrate', 'org', null, null, { projectsInitialized },
        'Access control initialized (all non-admin roles permitted by default)');
  saveState();
  return { migrated: true, alreadyPresent: false, projectsInitialized };
}

function canAccessProject(projId, role) {
  role = role || _currentRole();
  if (role === 'admin') return true;                       // admin bypass
  const p = state.org && state.org.projects[projId];
  if (!p) return false;
  if (!p.access || !Array.isArray(p.access.roles)) return true;   // permissive (legacy/no list)
  return p.access.roles.indexOf(role) !== -1;
}

function getAccessibleProjects(role) {
  role = role || _currentRole();
  if (!state.org || !state.org.projects) return [];
  return Object.values(state.org.projects).filter(p => !p.archived && canAccessProject(p.id, role));
}

function setProjectRoleAccess(projId, role, allowed) {
  const p = state.org && state.org.projects[projId];
  if (!p) return false;
  if (role === 'admin') return false;                      // admin access is implicit
  if (typeof ROLES === 'object' && !ROLES[role]) return false;
  if (!p.access || !Array.isArray(p.access.roles)) p.access = { roles: _accessRoleKeys() };
  const has = p.access.roles.indexOf(role) !== -1;
  if (allowed === has) return true;                        // no change
  const before = p.access.roles.slice();
  if (allowed) p.access.roles.push(role);
  else p.access.roles = p.access.roles.filter(r => r !== role);
  audit('org.access.set', 'org', projId, { roles: before }, { roles: p.access.roles.slice() },
        (allowed ? 'Granted ' : 'Revoked ') + role + ' access');
  saveState();
  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  return true;
}

/* Settings: role × project access matrix (returns HTML, injected by
   renderSettingsProjectsTab). Live projects only; admin column omitted. */
function renderAccessMatrixHtml() {
  if (!state.org || !state.org.projects) return '';
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const live = Object.values(state.org.projects).filter(p => !p.archived);
  if (!live.length) return '';
  const roles = _accessRoleKeys();
  let h = '<div class="org-access"><div class="org-access-title">Project access (role \u00d7 project) \u2014 admin always has access</div>';
  h += '<div class="org-access-wrap"><table class="org-access-table"><thead><tr><th class="oa-name">Project</th>';
  roles.forEach(r => { h += '<th title="' + esc((ROLES[r] && ROLES[r].label) || r) + '">' + esc(r) + '</th>'; });
  h += '</tr></thead><tbody>';
  for (const p of live) {
    h += '<tr><td class="oa-name">' + esc(p.name) + '</td>';
    roles.forEach(r => {
      const on = canAccessProject(p.id, r);
      h += '<td class="num"><input type="checkbox" ' + (on ? 'checked' : '') +
           ' onclick="setProjectRoleAccess(\'' + esc(p.id) + '\',\'' + r + '\',this.checked)"></td>';
    });
    h += '</tr>';
  }
  h += '</tbody></table></div></div>';
  return h;
}

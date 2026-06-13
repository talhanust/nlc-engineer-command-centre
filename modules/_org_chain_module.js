/* ============================================================
   §ORG-CHAIN  Per-project approval-chain routing  (Phase C — Session 8)
   ============================================================
   Lets each project override WHICH roles perform each permissioned action
   (the IPC/RAR/EPC/advance pipelines). Sparse overrides live at
   project.approvalChain = { <actionKey>: [roles] }. The accessor
   getActionRoles() falls through to the global PERMISSIONS when a project
   has no override for that action — so default behaviour is byte-identical
   and existing flows are untouched. admin is always retained (system role).

   Live wiring: canDo()/requireRole() consult getActionRoles() instead of
   PERMISSIONS[action] directly (patched by the merger).
   ============================================================ */

function getActionRoles(action) {
  const ap = (typeof getActiveProject === 'function') ? getActiveProject() : null;
  let roles;
  if (ap && ap.approvalChain && Array.isArray(ap.approvalChain[action])) roles = ap.approvalChain[action].slice();
  else roles = PERMISSIONS[action];
  if (Array.isArray(roles) && roles.indexOf('admin') === -1) roles = roles.concat('admin');  // admin always retained
  return roles;
}

function isActionOverridden(action) {
  const ap = (typeof getActiveProject === 'function') ? getActiveProject() : null;
  return !!(ap && ap.approvalChain && Array.isArray(ap.approvalChain[action]));
}

function setActionRoleOverride(action, role, allowed) {
  const ap = (typeof getActiveProject === 'function') ? getActiveProject() : null;
  if (!ap) return false;
  if (role === 'admin') return false;                       // admin implicit
  if (!PERMISSIONS[action]) return false;                   // known actions only
  if (typeof ROLES === 'object' && !ROLES[role]) return false;
  if (!ap.approvalChain) ap.approvalChain = {};
  if (!Array.isArray(ap.approvalChain[action])) {
    ap.approvalChain[action] = (PERMISSIONS[action] || []).filter(r => r !== 'admin');   // seed from current default
  }
  const list = ap.approvalChain[action];
  const has = list.indexOf(role) !== -1;
  if (allowed === has) return true;                         // no change
  const before = list.slice();
  if (allowed) list.push(role);
  else ap.approvalChain[action] = list.filter(r => r !== role);
  audit('org.chain.set', 'org', ap.id, { action, roles: before }, { action, roles: ap.approvalChain[action].slice() },
        (allowed ? 'Granted ' : 'Revoked ') + role + ' for ' + action);
  saveState();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  return true;
}

function resetActionOverride(action) {
  const ap = (typeof getActiveProject === 'function') ? getActiveProject() : null;
  if (!ap || !ap.approvalChain || !Array.isArray(ap.approvalChain[action])) return false;
  const before = ap.approvalChain[action].slice();
  delete ap.approvalChain[action];
  audit('org.chain.reset', 'org', ap.id, { action, roles: before }, { action, roles: '(default)' }, 'Reset ' + action + ' to default chain');
  saveState();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  return true;
}

/* Settings editor: per-project action × role routing matrix (all
   permissioned actions, grouped by prefix). Returns HTML string. */
function renderApprovalChainHtml() {
  const ap = (typeof getActiveProject === 'function') ? getActiveProject() : null;
  if (!ap || typeof PERMISSIONS !== 'object') return '';
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const roles = (typeof _accessRoleKeys === 'function') ? _accessRoleKeys() : Object.keys(ROLES).filter(r => r !== 'admin');
  const actions = Object.keys(PERMISSIONS);
  const groups = {};
  actions.forEach(a => { const g = a.split('.')[0]; (groups[g] = groups[g] || []).push(a); });

  let h = '<div class="org-chain"><div class="org-chain-title">Approval chain \u2014 ' + esc(ap.name) +
          ' <span class="org-chain-sub">(admin always permitted \u00b7 \u21ba resets a row to the global default)</span></div>';
  h += '<div class="org-chain-wrap"><table class="org-chain-table"><thead><tr><th class="oc-act">Action</th>';
  roles.forEach(r => { h += '<th title="' + esc((ROLES[r] && ROLES[r].label) || r) + '">' + esc(r) + '</th>'; });
  h += '<th>\u00b7</th></tr></thead><tbody>';
  Object.keys(groups).sort().forEach(g => {
    h += '<tr class="oc-group"><td colspan="' + (roles.length + 2) + '">' + esc(g) + '</td></tr>';
    groups[g].forEach(action => {
      const eff = getActionRoles(action) || [];
      const ov = isActionOverridden(action);
      h += '<tr class="' + (ov ? 'oc-ov' : '') + '"><td class="oc-act" title="' + esc(action) + '">' + esc(action) +
           (ov ? ' <span class="oc-badge">override</span>' : '') + '</td>';
      roles.forEach(r => {
        const on = eff.indexOf(r) !== -1;
        h += '<td class="num"><input type="checkbox" ' + (on ? 'checked' : '') +
             ' onclick="setActionRoleOverride(\'' + esc(action) + '\',\'' + r + '\',this.checked)"></td>';
      });
      h += '<td class="num">' + (ov ? '<button class="oc-reset" title="Reset to default" onclick="resetActionOverride(\'' + esc(action) + '\')">\u21ba</button>' : '') + '</td>';
      h += '</tr>';
    });
  });
  h += '</tbody></table></div></div>';
  return h;
}

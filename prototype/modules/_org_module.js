/* ============================================================
   §ORG  ORG-TREE MODULE  (Phase C — Session 1)
   ============================================================
   Foundation only: org tree + projects map + active-project
   switcher + idempotent migration + parameterized header.

   NO per-project data partitioning, NO portfolio rollup,
   NO project deletion, NO access control — all deferred.

   Conventions reused (grep-verified, not invented):
     - audit(action, refType, refId, before, after, notes)
     - safeSetText(id, value[, prop])
     - fmt.money(n)
     - escapeHtml(s)   (guarded with typeof)
     - PROJECT_META    (seed source for the F-14/F-15 migration)

   Action prefix: 'org.*'  (deriveModuleFromAction → 'other'; fine for S1)
   ============================================================ */

/* ---------- Seeded PD-HQ tree (5 PD HQs fixed this session) ---------- */
function _defaultOrgTree() {
  return {
    id: 'hq-nlc', name: 'HQ NLC', type: 'hq',
    children: [{
      id: 'hq-engrs', name: 'HQ Engrs', type: 'hq_engrs',
      children: [
        { id: 'pd-north',  name: 'HQ PD North',  type: 'pd_hq', children: [] },
        { id: 'pd-centre', name: 'HQ PD Centre', type: 'pd_hq', children: [] },
        { id: 'pd-kpk',    name: 'HQ PD KPK',    type: 'pd_hq', children: [] },
        { id: 'pd-sindh',  name: 'HQ PD Sindh',  type: 'pd_hq', children: [] },
        { id: 'pd-bln',    name: 'HQ PD Bln',    type: 'pd_hq', children: [] },
      ],
    }],
  };
}

/* ---------- Recursive node finder ---------- */
function _findNodeInTree(id, node) {
  node = node || (state.org && state.org.tree);
  if (!node) return null;
  if (node.id === id) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const hit = _findNodeInTree(id, child);
      if (hit) return hit;
    }
  }
  return null;
}

/* ---------- Idempotent boot migration ---------- */
function migrateToOrgTree() {
  /* Already migrated → no-op. Guard on the full shape, not just presence. */
  if (state.org && state.org.tree && state.org.projects &&
      state.org.activeProjectId && state.org.projects[state.org.activeProjectId]) {
    return { migrated: false, alreadyPresent: true };
  }

  const now = new Date().toISOString();

  state.org = {
    tree: _defaultOrgTree(),
    projects: {
      'proj-f14f15': {
        id: 'proj-f14f15',
        name: PROJECT_META.shortName || 'F-14/F-15 Islamabad',
        fullName: PROJECT_META.name,
        pdHqId: 'pd-north',                       // existing F-14/F-15 lands in HQ PD North
        client: {
          name: PROJECT_META.client,
          designConsultant: PROJECT_META.consultant,
          contractRef: PROJECT_META.reference,
          contractValue: PROJECT_META.contractValue,
          window: {
            start: PROJECT_META.commencementDate,
            end: PROJECT_META.completionDate,
            durationDays: PROJECT_META.durationDays,
          },
        },
        contractor: { name: PROJECT_META.contractor },
        createdAt: now,
      },
    },
    activeProjectId: 'proj-f14f15',
  };

  audit('org.migrate.create', 'org', 'proj-f14f15', null,
        { activeProjectId: 'proj-f14f15', pdHqId: 'pd-north' },
        'Seeded NLC org tree (5 PD HQs); migrated existing F-14/F-15 into HQ PD North');

  return { migrated: true, alreadyPresent: false };
}

/* ---------- Accessors ---------- */
function getActiveProject() {
  if (!state.org || !state.org.activeProjectId) return null;
  return state.org.projects[state.org.activeProjectId] || null;
}

function getProjectsByPdHq(pdHqId) {
  if (!state.org || !state.org.projects) return [];
  return Object.values(state.org.projects).filter(p => p.pdHqId === pdHqId);
}

/* ---------- Unique id generator ---------- */
function _genProjectId(name) {
  const slug = String(name || 'project').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'project';
  let base = 'proj-' + slug, id = base, n = 2;
  while (state.org.projects[id]) { id = base + '-' + n; n++; }
  return id;
}

/* ---------- Project CRUD (add + rename only this session) ---------- */
function addProject(pdHqId, payload) {
  if (!state.org) migrateToOrgTree();
  payload = payload || {};
  const name = (payload.name || '').trim();
  if (!name) return null;                                  // missing name → reject
  if (!_findNodeInTree(pdHqId)) return null;               // unknown PD HQ → reject

  const id = _genProjectId(name);
  const proj = {
    id, name,
    fullName: payload.fullName || name,
    pdHqId,
    client: payload.client || { name: '', designConsultant: '', contractRef: '', contractValue: 0, window: null },
    contractor: payload.contractor || { name: PROJECT_META.contractor },
    createdAt: new Date().toISOString(),
  };
  state.org.projects[id] = proj;
  audit('org.project.add', 'org', id, null, { name, pdHqId }, 'Project added');
  saveState();
  return proj;
}

function renameProject(projId, newName) {
  if (!state.org || !state.org.projects[projId]) return false;
  newName = (newName || '').trim();
  if (!newName) return false;
  const before = state.org.projects[projId].name;
  state.org.projects[projId].name = newName;
  audit('org.project.rename', 'org', projId, { name: before }, { name: newName }, 'Project renamed');
  saveState();
  return true;
}

function switchActiveProject(projId) {
  if (!state.org || !state.org.projects[projId]) return false;
  const before = state.org.activeProjectId;
  if (before === projId) { renderProjectSwitcher(); renderHeader(); return true; }
  state.org.activeProjectId = projId;
  audit('org.project.switch', 'org', projId, { activeProjectId: before }, { activeProjectId: projId }, 'Active project switched');
  saveState();
  /* Re-render dependent UI (header + switcher; full refresh if available). */
  renderProjectSwitcher();
  renderHeader();
  if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) { /* non-fatal in tests */ } }
  return true;
}

/* ---------- Render: parameterized header ---------- */
function renderHeader() {
  const p = getActiveProject();
  const clientName = (p && p.client && p.client.name) ? p.client.name : PROJECT_META.client;
  const projName   = (p && p.name) ? p.name : PROJECT_META.shortName;
  /* Short client tag for compact contexts: text inside first parens, else full. */
  const m = /\(([^)]+)\)\s*$/.exec(clientName || '');
  const clientShort = m ? m[1] : clientName;
  safeSetText('hdrProjectTitle', clientName + ' × ' + PROJECT_META.contractor.replace(/\s*\(.*\)\s*/, '').trim() + ' · Unified Project Control');
  safeSetText('hdrProjectSubtitle', projName + ' — Infrastructure Development');
  /* Parameterized commercial subtitles (were hardcoded "FGEHA"). */
  safeSetText('advClientLabel', 'Client Receipts (' + clientShort + ' \u2192 NLC)');
  safeSetText('epcClientLabel', clientShort);
  safeSetText('reconClientLabel', clientShort);
}

/* ---------- Render: top-bar project switcher ---------- */
function renderProjectSwitcher() {
  const host = document.getElementById('projectSwitcherHost');
  if (!host) return;
  if (!state.org || !state.org.projects) { host.innerHTML = ''; return; }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const active = state.org.activeProjectId;

  const pdHqs = [];
  (function walk(n) {
    if (!n) return;
    if (n.type === 'pd_hq') pdHqs.push(n);
    (n.children || []).forEach(walk);
  })(state.org.tree);

  let opts = '';
  for (const hq of pdHqs) {
    const projs = getProjectsByPdHq(hq.id);
    if (!projs.length) continue;
    opts += '<optgroup label="' + esc(hq.name) + '">';
    for (const pr of projs) {
      opts += '<option value="' + esc(pr.id) + '"' + (pr.id === active ? ' selected' : '') + '>' + esc(pr.name) + '</option>';
    }
    opts += '</optgroup>';
  }
  host.innerHTML =
    '<span class="ctrl-label">Project</span>' +
    '<select id="projectSwitcherSelect" onchange="switchActiveProject(this.value)">' + opts + '</select>';
}

/* ---------- Render: Settings → Projects card ---------- */
function renderSettingsProjectsTab() {
  const host = document.getElementById('dxProjectsTree');
  if (!host) return;
  if (!state.org) migrateToOrgTree();
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.money) ? fmt.money : (n => 'PKR ' + n);

  const pdHqs = [];
  (function walk(n) {
    if (!n) return;
    if (n.type === 'pd_hq') pdHqs.push(n);
    (n.children || []).forEach(walk);
  })(state.org.tree);

  let html = '<div class="org-tree">';
  for (const hq of pdHqs) {
    const projs = getProjectsByPdHq(hq.id);
    html += '<div class="org-hq"><div class="org-hq-name">' + esc(hq.name) +
            ' <span class="org-count">(' + projs.length + ')</span></div>';
    if (projs.length) {
      html += '<ul class="org-proj-list">';
      for (const pr of projs) {
        const cv = pr.client && pr.client.contractValue ? ' · ' + money(pr.client.contractValue) : '';
        html += '<li data-proj="' + esc(pr.id) + '"><span class="org-proj-name">' + esc(pr.name) + '</span>' +
                '<span class="org-proj-meta">' + esc((pr.client && pr.client.name) || '') + cv + '</span></li>';
      }
      html += '</ul>';
    } else {
      html += '<div class="org-empty">No projects</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  /* Add-project mini form (PD HQ select + name) */
  let pdOpts = pdHqs.map(h => '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>').join('');
  html += '<div class="org-add-form">' +
          '<select id="orgAddPdHq">' + pdOpts + '</select>' +
          '<input type="text" id="orgAddName" placeholder="New project name" maxlength="80">' +
          '<button class="btn" onclick="submitAddProject()">Add Project</button>' +
          '</div>';
  host.innerHTML = html;
}

/* ---------- Add-project form submit (render path) ---------- */
function submitAddProject() {
  const pdSel = document.getElementById('orgAddPdHq');
  const nameEl = document.getElementById('orgAddName');
  if (!pdSel || !nameEl) return null;
  const proj = addProject(pdSel.value, { name: nameEl.value });
  if (!proj) { if (typeof alert === 'function') alert('Could not add project — name required and PD HQ must be valid.'); return null; }
  nameEl.value = '';
  renderSettingsProjectsTab();
  renderProjectSwitcher();
  return proj;
}

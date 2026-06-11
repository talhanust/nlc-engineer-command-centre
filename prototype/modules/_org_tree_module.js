/* ============================================================
   §ORG-TREE-EDIT  Editable PD-HQ tree  (Phase C — Session 5)
   ============================================================
   CRUD on PD-HQ nodes + project reparenting, preserving the fixed
   3-level shape: HQ NLC → HQ Engrs → PD HQs → projects. New PD HQs
   attach under HQ Engrs (the parent of the seeded five); deeper nesting
   is intentionally not supported (it would break switcher optgroups and
   portfolio grouping downstream).

   Guards:
     - removePdHq: node must be a pd_hq with NO projects (live OR archived),
       and never the last pd_hq. (Safe true-delete: the node is empty.)
     - reparentProject: target must be an existing pd_hq, different from current.
   ============================================================ */

function _findParentInTree(id, node, parent) {
  node = node || (state.org && state.org.tree);
  if (!node) return null;
  if (node.id === id) return parent || null;
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      const r = _findParentInTree(id, c, node);
      if (r) return r;
    }
  }
  return null;
}

function _hqEngrsNode() {
  let found = null;
  (function walk(n) { if (!n || found) return; if (n.type === 'hq_engrs') { found = n; return; } (n.children || []).forEach(walk); })(state.org.tree);
  return found;
}

function _pdHqList() {
  const out = [];
  (function walk(n) { if (!n) return; if (n.type === 'pd_hq') out.push(n); (n.children || []).forEach(walk); })(state.org.tree);
  return out;
}

function _genPdHqId(name) {
  const slug = String(name || 'pd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'pd';
  let base = 'pd-' + slug, id = base, n = 2;
  while (_findNodeInTree(id)) { id = base + '-' + n; n++; }
  return id;
}

function addPdHq(name) {
  if (!state.org) migrateToOrgTree();
  name = (name || '').trim();
  if (!name) return null;
  const parent = _hqEngrsNode();
  if (!parent) return null;
  if (!Array.isArray(parent.children)) parent.children = [];
  const id = _genPdHqId(name);
  const node = { id, name, type: 'pd_hq', children: [] };
  parent.children.push(node);
  audit('org.pdhq.add', 'org', id, null, { name }, 'PD HQ added');
  saveState();
  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  return node;
}

function renamePdHq(id, newName) {
  const node = _findNodeInTree(id);
  if (!node || node.type !== 'pd_hq') return false;
  newName = (newName || '').trim();
  if (!newName) return false;
  const before = node.name;
  node.name = newName;
  audit('org.pdhq.rename', 'org', id, { name: before }, { name: newName }, 'PD HQ renamed');
  saveState();
  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  return true;
}

function removePdHq(id) {
  const node = _findNodeInTree(id);
  if (!node || node.type !== 'pd_hq') return { ok: false, reason: 'not_found' };
  const attached = Object.values(state.org.projects).filter(p => p.pdHqId === id);
  if (attached.length) return { ok: false, reason: 'has_projects' };
  if (_pdHqList().length <= 1) return { ok: false, reason: 'last_pdhq' };
  const parent = _findParentInTree(id);
  if (!parent || !Array.isArray(parent.children)) return { ok: false, reason: 'no_parent' };
  parent.children = parent.children.filter(c => c.id !== id);
  audit('org.pdhq.remove', 'org', id, { name: node.name }, null, 'PD HQ removed (was empty)');
  saveState();
  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  return { ok: true };
}

function reparentProject(projId, newPdHqId) {
  if (!state.org || !state.org.projects[projId]) return false;
  const target = _findNodeInTree(newPdHqId);
  if (!target || target.type !== 'pd_hq') return false;
  const before = state.org.projects[projId].pdHqId;
  if (before === newPdHqId) return false;
  state.org.projects[projId].pdHqId = newPdHqId;
  audit('org.project.reparent', 'org', projId, { pdHqId: before }, { pdHqId: newPdHqId }, 'Project moved to another PD HQ');
  saveState();
  if (typeof renderProjectSwitcher === 'function') renderProjectSwitcher();
  if (typeof renderSettingsProjectsTab === 'function') renderSettingsProjectsTab();
  if (typeof renderPortfolio === 'function') { try { renderPortfolio(); } catch (e) {} }
  return true;
}

/* ---------- UI helpers (render path) ---------- */
function promptRenamePdHq(id) {
  const node = _findNodeInTree(id);
  if (!node) return;
  const n = (typeof prompt === 'function') ? prompt('Rename PD HQ', node.name) : null;
  if (n) renamePdHq(id, n);
}
function submitAddPdHq() {
  const el = document.getElementById('orgAddHqName');
  if (!el) return null;
  const node = addPdHq(el.value);
  if (!node) { if (typeof alert === 'function') alert('PD HQ name required.'); return null; }
  el.value = '';
  return node;
}

/* ============================================================
   §SALIENTS-NAV  Editable project salients + global breadcrumb  (Phase E — S5)
   ============================================================
   (A) Editable salients: a Settings form to set any project's Client,
       Consultant, Contract reference, Start/Finish dates and Contract value
       (the fields the context-aware header shows). Writes to project.client.
   (B) Persistent breadcrumb: a slim top bar (above the module tabs, on every
       page) showing the active node path — each ancestor clickable to drill
       UP, plus "Drill into" chips for the immediate children to drill DOWN.
   ============================================================ */

/* ---------- (A) editable salients ---------- */
function setProjectSalients(projId, s) {
  if (!state.org || !state.org.projects[projId] || !s) return false;
  const p = state.org.projects[projId];
  p.client = p.client || {};
  const before = { name: p.client.name, consultant: p.client.designConsultant, ref: p.client.contractRef, value: p.client.contractValue, window: p.client.window };
  const _san = (typeof _sanitizeText === 'function') ? (x => _sanitizeText(x, 200)) : (x => String(x == null ? '' : x));
  if (s.client != null) p.client.name = _san(s.client);
  if (s.consultant != null) p.client.designConsultant = _san(s.consultant);
  if (s.contractRef != null) p.client.contractRef = _san(s.contractRef);
  if (s.contractValue != null && isFinite(s.contractValue)) p.client.contractValue = s.contractValue;
  if (s.start != null || s.end != null) {
    p.client.window = p.client.window || {};
    if (s.start != null) p.client.window.start = s.start;
    if (s.end != null) p.client.window.end = s.end;
  }
  audit('org.project.salients', 'org', projId,
    before, { name: p.client.name, consultant: p.client.designConsultant, ref: p.client.contractRef, value: p.client.contractValue, window: p.client.window },
    'Updated project details');
  saveState();
  if (typeof renderHeader === 'function') renderHeader();
  return true;
}

function renderSalientsEditor() {
  const host = document.getElementById('salientsHost');
  if (!host || !state.org) return;
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const live = Object.values(state.org.projects).filter(p => !p.archived);
  if (!live.length) { host.innerHTML = '<div class="boq-intake-empty">No projects yet.</div>'; return; }
  const active = state.org.activeProjectId;
  let opts = '';
  live.forEach(p => { opts += '<option value="' + esc(p.id) + '"' + (p.id === active ? ' selected' : '') + '>' + esc(p.name) + '</option>'; });
  host.innerHTML =
    '<div class="boq-intake-row"><label>Project</label><select id="salientTarget" onchange="loadSalientsForm()">' + opts + '</select></div>' +
    '<div class="boq-intake-row"><label>Project name</label><input id="salName" type="text"></div>' +
    '<div class="boq-intake-row"><label>Client</label><input id="salClient" type="text" placeholder="e.g. National Highway Authority (NHA)"></div>' +
    '<div class="boq-intake-row"><label>Consultant</label><input id="salConsultant" type="text" placeholder="e.g. NESPAK (Pvt) Ltd"></div>' +
    '<div class="boq-intake-row"><label>Contract reference</label><input id="salRef" type="text"></div>' +
    '<div class="boq-intake-row"><label>Start date</label><input id="salStart" type="date"></div>' +
    '<div class="boq-intake-row"><label>Finish date</label><input id="salFinish" type="date"></div>' +
    '<div class="boq-intake-row"><label>Contract value</label><input id="salValue" type="number" step="any"></div>' +
    '<div class="boq-intake-actions"><button class="btn btn-primary" onclick="submitSalients()">Save project details</button></div>';
  loadSalientsForm();
}

function loadSalientsForm() {
  const sel = document.getElementById('salientTarget'); if (!sel) return;
  const p = state.org.projects[sel.value]; if (!p) return;
  const cl = p.client || {}; const w = cl.window || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  set('salName', p.name);
  set('salClient', cl.name);
  set('salConsultant', cl.designConsultant);
  set('salRef', cl.contractRef);
  set('salStart', w.start);
  set('salFinish', w.end);
  set('salValue', cl.contractValue);
}

function submitSalients() {
  const sel = document.getElementById('salientTarget'); if (!sel) return;
  const projId = sel.value;
  const p = state.org.projects[projId]; if (!p) return;
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
  const newName = (val('salName') || '').trim();
  if (newName && newName !== p.name && typeof renameProject === 'function') { try { renameProject(projId, newName); } catch (e) {} }
  const vRaw = val('salValue');
  setProjectSalients(projId, {
    client: (val('salClient') || '').trim(),
    consultant: (val('salConsultant') || '').trim(),
    contractRef: (val('salRef') || '').trim(),
    start: (val('salStart') || '').trim(),
    end: (val('salFinish') || '').trim(),
    contractValue: (vRaw === '' || vRaw == null) ? null : parseFloat(vRaw),
  });
  if (typeof toast === 'function') toast('Project details saved', 'success');
  if (typeof refreshAll === 'function') refreshAll();
  if (typeof renderSalientsEditor === 'function') renderSalientsEditor();
}

/* ---------- (B) persistent breadcrumb drill-down ---------- */
function renderBreadcrumb() {
  const host = document.getElementById('breadcrumbHost');
  if (!host) return;
  if (!state.org || !state.org.tree) { host.innerHTML = ''; return; }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const root = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
  const nodeId = state.org.activeNodeId || root;
  const path = (typeof _nodePath === 'function') ? _nodePath(nodeId) : [];
  if (!path.length) { host.innerHTML = ''; return; }
  const crumbs = path.map((c, i) =>
    (i === path.length - 1)
      ? '<span class="bc-crumb bc-cur">' + esc(c.name) + '</span>'
      : '<a class="bc-crumb" onclick="setActiveNode(\'' + esc(c.id) + '\')">' + esc(c.name) + '</a>'
  ).join('<span class="bc-sep">\u203a</span>');

  let down = '';
  if (typeof _immediateChildNodes === 'function') {
    const kids = _immediateChildNodes(nodeId);
    if (kids.length) {
      down = '<span class="bc-down-label">Drill into:</span>' +
        kids.slice(0, 10).map(k => '<a class="bc-chip" onclick="setActiveNode(\'' + esc(k.id) + '\')" title="Open ' + esc(k.name) + '">' + ((typeof nodeHealth === 'function' && typeof _ragDot === 'function') ? _ragDot(nodeHealth(k.id).status) : '') + esc(k.name) + '</a>').join('');
    }
  }
  host.innerHTML = '<div class="bc-path">' + crumbs + '</div>' + (down ? '<div class="bc-down">' + down + '</div>' : '');
}

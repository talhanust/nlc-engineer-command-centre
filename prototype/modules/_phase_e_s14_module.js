/* ============================================================
   §GLOBAL-FILTER  Persistent dashboard filter bar  (Phase E — S14)
   ============================================================
   A filter bar (search / client / RAG) that lives in state.ui.filters and
   PERSISTS as you drill between nodes. It filters the dashboard child cards
   live (search + RAG apply to any child; client applies to project children,
   leaving branch nodes drillable). Default-empty = everything shows, so it is
   a no-op until used. The aggregate KPIs stay full-scope; a note reports how
   many children are hidden, with a one-click clear.
   ============================================================ */

function _globalFilters() {
  if (!state.ui) return { search: '', client: '', rag: '' };
  if (!state.ui.filters) state.ui.filters = { search: '', client: '', rag: '' };
  const f = state.ui.filters;
  if (f.search == null) f.search = '';
  if (f.client == null) f.client = '';
  if (f.rag == null) f.rag = '';
  return f;
}
function _filterActive() {
  const f = _globalFilters();
  return !!(f.search || f.client || f.rag);
}
function setGlobalFilter(key, val) {
  if (['search', 'client', 'rag'].indexOf(key) < 0) return false;
  _globalFilters()[key] = (val == null ? '' : String(val));
  if (typeof saveState === 'function') saveState();
  return true;
}
function clearGlobalFilters() {
  state.ui.filters = { search: '', client: '', rag: '' };
  if (typeof saveState === 'function') saveState();
}

function _childMatchesFilter(ch, status) {
  const f = _globalFilters();
  if (!ch) return true;
  if (f.search) { if ((ch.name || '').toLowerCase().indexOf(f.search.toLowerCase()) < 0) return false; }
  if (f.rag) { if ((status || 'green') !== f.rag) return false; }
  if (f.client && ch.type === 'project') {
    const p = state.org && state.org.projects && state.org.projects[ch.id];
    const cn = (p && p.client && p.client.name) || '';
    if (cn !== f.client) return false;
  }
  return true;
}

function _filterNoteHtml(shown, hidden) {
  if (!hidden) return '';
  return '<div class="filter-note">Showing ' + shown + ' \u00b7 ' + hidden + ' hidden by filter \u2014 ' +
    '<a onclick="clearGlobalFilters(); if(typeof refreshAll===\'function\')refreshAll();">clear filter</a></div>';
}

function _distinctClients() {
  const set = {};
  if (state.org && state.org.projects) Object.values(state.org.projects).forEach(p => {
    if (p.archived) return;
    const cn = p.client && p.client.name; if (cn) set[cn] = 1;
  });
  return Object.keys(set).sort();
}

/* ---- filter bar UI ---- */
function renderFilterBar() {
  const host = document.getElementById('filterBarHost');
  if (!host || !state.org) return;
  const root = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
  const nodeId = state.org.activeNodeId || root;
  const isProject = !!(state.org.projects && state.org.projects[nodeId]);
  if (isProject) { host.innerHTML = ''; return; }   /* dashboards only */
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const f = _globalFilters();
  let clientOpts = '<option value="">All clients</option>';
  _distinctClients().forEach(c => { clientOpts += '<option value="' + esc(c) + '"' + (c === f.client ? ' selected' : '') + '>' + esc(c) + '</option>'; });
  const ragOpt = (v, lbl) => '<option value="' + v + '"' + (f.rag === v ? ' selected' : '') + '>' + lbl + '</option>';
  host.innerHTML =
    '<span class="fb-label">Filter</span>' +
    '<input id="fbSearch" class="fb-search" type="text" placeholder="Search name\u2026" value="' + esc(f.search) + '" oninput="onFilterChange(\'search\', this.value)">' +
    '<select id="fbClient" onchange="onFilterChange(\'client\', this.value)">' + clientOpts + '</select>' +
    '<select id="fbRag" onchange="onFilterChange(\'rag\', this.value)">' + '<option value="">All status</option>' + ragOpt('red', '\u25cf Red') + ragOpt('amber', '\u25cf Amber') + ragOpt('green', '\u25cf Green') + '</select>' +
    (_filterActive() ? '<button class="fb-clear" onclick="onFilterClear()">Clear</button>' : '');
}

function onFilterChange(key, val) {
  setGlobalFilter(key, val);
  if (typeof refreshAll === 'function') refreshAll();
  /* keep focus + caret in the search box across the re-render */
  if (key === 'search') { const el = document.getElementById('fbSearch'); if (el && el.focus) { try { el.focus(); const v = el.value; el.value = ''; el.value = v; } catch (e) {} } }
}
function onFilterClear() {
  clearGlobalFilters();
  if (typeof refreshAll === 'function') refreshAll();
}

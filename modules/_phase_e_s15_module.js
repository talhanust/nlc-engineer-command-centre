/* ============================================================
   §CMD-PALETTE  Quick-jump command palette  (Phase E — S15)
   ============================================================
   Ctrl-K / Cmd-K opens a palette to jump to any HQ, PD HQ or project by name.
   Empty query shows recently-visited nodes (state.ui.recentNodes, tracked on
   every navigation). Arrow keys move the selection, Enter navigates, Esc
   closes. Selecting a node calls setActiveNode — same drill path as the tree.
   ============================================================ */

function _recentNodes() {
  if (!state.ui) return [];
  if (!Array.isArray(state.ui.recentNodes)) state.ui.recentNodes = [];
  return state.ui.recentNodes;
}
function _pushRecentNode(id) {
  if (!id) return;
  const r = _recentNodes();
  const i = r.indexOf(id); if (i >= 0) r.splice(i, 1);
  r.unshift(id);
  if (r.length > 8) r.length = 8;
}

function _allNavNodes() {
  const out = []; const seen = {};
  (function walk(n) { if (!n) return; if (!seen[n.id]) { seen[n.id] = 1; out.push({ id: n.id, name: n.name || n.id, type: n.type || 'node' }); } (n.children || []).forEach(walk); })(state.org && state.org.tree);
  if (state.org && state.org.projects) Object.values(state.org.projects).forEach(p => {
    if (p.archived) return;
    if (!seen[p.id]) { seen[p.id] = 1; out.push({ id: p.id, name: p.name || p.id, type: 'project' }); }
  });
  return out;
}

function _paletteItems(query) {
  query = (query || '').trim().toLowerCase();
  const all = _allNavNodes();
  if (!query) {
    const rec = _recentNodes().map(id => all.find(n => n.id === id)).filter(Boolean);
    return (rec.length ? rec : all).slice(0, 12);
  }
  return all.filter(n => (n.name || '').toLowerCase().indexOf(query) >= 0).slice(0, 12);
}

var _paletteOpen = false, _paletteSel = 0, _paletteList = [];

function _paletteTypeLabel(t) {
  return t === 'project' ? 'project' : t === 'pd_hq' ? 'PD HQ' : t === 'hq_engrs' ? 'HQ Engineers' : t === 'hq' ? 'HQ' : (t || 'node');
}

function renderPaletteItems(query) {
  _paletteList = _paletteItems(query);
  if (_paletteSel >= _paletteList.length) _paletteSel = Math.max(0, _paletteList.length - 1);
  const list = document.getElementById('cmdpList'); if (!list) return;
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  list.innerHTML = _paletteList.length
    ? _paletteList.map((n, i) => '<div class="cmdp-item' + (i === _paletteSel ? ' sel' : '') + '" onclick="_paletteNavigate(\'' + esc(n.id) + '\')"><span class="cmdp-name">' + esc(n.name) + '</span><span class="cmdp-type">' + esc(_paletteTypeLabel(n.type)) + '</span></div>').join('')
    : '<div class="cmdp-empty">No matches</div>';
}

function openCommandPalette() {
  const host = document.getElementById('cmdPaletteHost'); if (!host) return;
  _paletteOpen = true; _paletteSel = 0;
  host.style.display = 'block';
  host.innerHTML = '<div class="cmdp-backdrop" onclick="closeCommandPalette()"></div>' +
    '<div class="cmdp-modal" role="dialog"><input id="cmdpInput" class="cmdp-input" type="text" placeholder="Jump to HQ, PD HQ or project\u2026" oninput="onPaletteInput(this.value)" autocomplete="off"><div id="cmdpList" class="cmdp-list"></div><div class="cmdp-foot">\u2191\u2193 move \u00b7 \u23ce open \u00b7 esc close</div></div>';
  renderPaletteItems('');
  const inp = document.getElementById('cmdpInput'); if (inp && inp.focus) { try { inp.focus(); } catch (e) {} }
}
function closeCommandPalette() {
  _paletteOpen = false;
  const host = document.getElementById('cmdPaletteHost');
  if (host) { host.style.display = 'none'; host.innerHTML = ''; }
}
function onPaletteInput(v) { _paletteSel = 0; renderPaletteItems(v); }
function _paletteNavigate(id) {
  closeCommandPalette();
  if (typeof setActiveNode === 'function') { try { setActiveNode(id); } catch (e) {} }
}
function _paletteMove(d) {
  if (!_paletteList.length) return;
  _paletteSel = (_paletteSel + d + _paletteList.length) % _paletteList.length;
  const inp = document.getElementById('cmdpInput');
  renderPaletteItems(inp ? inp.value : '');
}
function _paletteEnter() { const n = _paletteList[_paletteSel]; if (n) _paletteNavigate(n.id); }

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'K')) { e.preventDefault(); _paletteOpen ? closeCommandPalette() : openCommandPalette(); return; }
    if (!_paletteOpen) return;
    if (k === 'Escape') { e.preventDefault(); closeCommandPalette(); }
    else if (k === 'ArrowDown') { e.preventDefault(); _paletteMove(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); _paletteMove(-1); }
    else if (k === 'Enter') { e.preventDefault(); _paletteEnter(); }
  });
}

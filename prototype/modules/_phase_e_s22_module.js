/* ============================================================
   §NODE-COMMENTS  Notes per node  (Phase E — S22)
   ============================================================
   Timestamped notes attached to any org node (HQ / PD HQ / project), kept in
   state.comments keyed by node id and persisted with the rest of the state.
   The panel renders on branch command centers; the data layer is node-agnostic
   so a project's notes are stored under its id too. Every add/delete is audited.
   ============================================================ */

function _ensureComments() {
  if (!state.comments || typeof state.comments !== 'object') state.comments = {};
  return state.comments;
}
function _nodeComments(nodeId) {
  const c = _ensureComments();
  if (!Array.isArray(c[nodeId])) c[nodeId] = [];
  return c[nodeId];
}
function _commentCount(nodeId) { return _nodeComments(nodeId).length; }
function _commentAuthor() { return (state.session && state.session.role) ? String(state.session.role) : 'User'; }

function addNodeComment(nodeId, text) {
  if (!nodeId) return false;
  const t = (typeof _sanitizeText === 'function' ? _sanitizeText(text, 2000) : String(text == null ? '' : text)).trim();
  if (!t) return false;
  const list = _nodeComments(nodeId);
  const c = { id: 'cmt-' + Date.now() + '-' + Math.floor(Math.random() * 1e4), text: t, author: _commentAuthor(), at: new Date().toISOString() };
  list.push(c);
  if (typeof audit === 'function') audit('node.comment.add', 'node', nodeId, null, { text: t }, 'Note added');
  if (typeof saveState === 'function') saveState();
  return c;
}
function deleteNodeComment(nodeId, commentId) {
  const list = _nodeComments(nodeId);
  const i = list.findIndex(c => c.id === commentId);
  if (i < 0) return false;
  const removed = list.splice(i, 1)[0];
  if (typeof audit === 'function') audit('node.comment.delete', 'node', nodeId, { text: removed.text }, null, 'Note deleted');
  if (typeof saveState === 'function') saveState();
  return true;
}

function _commentDate(iso) {
  try { const d = new Date(iso); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso || ''; }
}

function renderNodeComments(nodeId) {
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const list = _nodeComments(nodeId).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  const items = list.length
    ? list.map(c =>
      '<div class="cmt-item"><div class="cmt-text">' + esc(c.text) + '</div>' +
      '<div class="cmt-meta"><span>' + esc(c.author) + ' \u00b7 ' + esc(_commentDate(c.at)) + '</span>' +
      '<button class="cmt-del" title="Delete note" onclick="onDeleteComment(\'' + esc(nodeId) + '\', \'' + esc(c.id) + '\')">\u00d7</button></div></div>'
    ).join('')
    : '<div class="cmt-empty">No notes yet \u2014 add the first one below.</div>';
  return '<div class="cmt-wrap"><div class="cmd-childtitle">Notes &amp; comments <span class="cmt-count">' + list.length + '</span></div>' +
    '<div class="cmt-list">' + items + '</div>' +
    '<div class="cmt-add"><input id="nodeCommentInput" class="cmt-input" type="text" placeholder="Add a note for this node\u2026" ' +
    'onkeydown="if(event.key===\'Enter\'){onAddComment(\'' + esc(nodeId) + '\');}">' +
    '<button class="cmt-addbtn" onclick="onAddComment(\'' + esc(nodeId) + '\')">Add note</button></div></div>';
}

function onAddComment(nodeId) {
  const el = document.getElementById('nodeCommentInput');
  if (!el) return;
  const r = addNodeComment(nodeId, el.value);
  if (r) {
    el.value = '';
    if (typeof toast === 'function') toast('Note added', 'ok');
    if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
  }
}
function onDeleteComment(nodeId, commentId) {
  if (deleteNodeComment(nodeId, commentId)) {
    if (typeof toast === 'function') toast('Note deleted', 'ok');
    if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
  }
}

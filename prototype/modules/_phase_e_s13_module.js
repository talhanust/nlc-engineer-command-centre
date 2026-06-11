/* ============================================================
   §DEEP-LINK  Shareable node URLs  (Phase E — S13)
   ============================================================
   The address bar reflects the active node as #node=<id> (via replaceState,
   so no per-node history is created — Back leaves the app, per the chosen
   behaviour). Opening / pasting such a URL navigates straight to that node
   on load, and editing the hash live navigates too. Loop-safe: replaceState
   does not fire 'hashchange', and the listener no-ops when the id already
   matches the active node.
   ============================================================ */

function _nodeHash() {
  const id = state.org && state.org.activeNodeId;
  return id ? ('#node=' + id) : '';
}

function _parseNodeHash() {
  if (typeof location === 'undefined' || !location.hash) return null;
  const m = /[#&]node=([\w-]+)/.exec(location.hash);
  return m ? m[1] : null;
}

function _validNode(id) {
  if (!state.org || !id) return false;
  const root = (typeof ROOT_NODE_ID !== 'undefined') ? ROOT_NODE_ID : 'hq-nlc';
  if (id === root) return true;
  if (state.org.projects && state.org.projects[id]) return true;
  return (typeof _shellNode === 'function') ? !!_shellNode(id) : false;
}

function _syncNodeHash() {
  if (typeof location === 'undefined' || typeof history === 'undefined' || !history.replaceState) return;
  const h = _nodeHash();
  if (!h || location.hash === h) return;
  try { history.replaceState(null, '', h); } catch (e) { try { location.hash = h; } catch (_) {} }
}

function _applyNodeHashNav() {
  const id = _parseNodeHash();
  if (id && _validNode(id) && state.org && state.org.activeNodeId !== id && typeof setActiveNode === 'function') {
    try { setActiveNode(id); } catch (e) {}
    return true;
  }
  return false;
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('hashchange', function () { try { _applyNodeHashNav(); } catch (e) {} });
}

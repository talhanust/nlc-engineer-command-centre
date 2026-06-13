/* ============================================================
   §UNDO + EMPTY-STATES  (Phase E — S16)
   ============================================================
   Undo toasts: mutating actions surface a toast with an Undo button that
   reverts the change (archive is wrapped here as the first reversible action,
   using the existing restoreProject as its inverse). Empty-state guidance:
   branch dashboards with no children show a helpful, type-aware prompt
   instead of a blank/"leaf node" row.
   ============================================================ */

var _undoAction = null;

function showUndoToast(msg, undoFn) {
  _undoAction = (typeof undoFn === 'function') ? undoFn : null;
  const host = document.getElementById('toastHost');
  if (!host || typeof host.appendChild !== 'function' || typeof document.createElement !== 'function') {
    if (typeof toast === 'function') toast(msg);
    return null;
  }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const el = document.createElement('div');
  el.className = 'toast undo-toast';
  el.innerHTML = '<span class="undo-msg">' + esc(msg) + '</span><button class="undo-btn" onclick="performUndo(this)">Undo</button>';
  el._undo = _undoAction;
  host.appendChild(el);
  setTimeout(function () { try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) {} }, 8000);
  return el;
}

function performUndo(btn) {
  const el = (btn && btn.parentNode) ? btn.parentNode : null;
  const fn = (el && el._undo) || _undoAction;
  _undoAction = null;
  if (typeof fn === 'function') { try { fn(); } catch (e) {} }
  if (el && el.parentNode) { try { el.parentNode.removeChild(el); } catch (e) {} }
  if (typeof toast === 'function') { try { toast('Reverted', 'ok'); } catch (e) {} }
  if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
}

/* reversible archive: archiveProject + an Undo that calls restoreProject */
function archiveProjectWithUndo(projId) {
  const r = (typeof archiveProject === 'function') ? archiveProject(projId) : { ok: false, reason: 'unavailable' };
  if (r && r.ok) {
    showUndoToast('Project archived', function () { if (typeof restoreProject === 'function') restoreProject(projId); });
    if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
  } else if (r && r.reason === 'last_project') {
    if (typeof toast === 'function') toast('Cannot archive the last live project', 'warn');
  }
  return r;
}

/* type-aware empty-state copy for branch dashboards with no children */
function _emptyStateHtml(node) {
  const t = node && node.type;
  if (t === 'pd_hq') return 'No projects under this PD HQ yet. Use <strong>Admin \u2192 Add Project</strong> to create one, or import a BOQ to get started.';
  if (t === 'hq_engrs') return 'No PD HQ formations configured yet. Add one from <strong>Admin \u2192 Org Tree</strong>.';
  if (t === 'hq') return 'No subordinate formations yet. Build the structure from <strong>Admin \u2192 Org Tree</strong>.';
  return 'Nothing to show here yet \u2014 add projects or formations from Admin.';
}

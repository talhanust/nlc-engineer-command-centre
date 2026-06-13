/* ============================================================
   §REGISTER-EDIT  Bulk-select + status + inline notes  (Phase E — S17)
   ============================================================
   An additive editor beneath the IPC register: tick rows, bulk-set their
   workflow status, and edit a free-text note per IPC. Amounts stay READ-ONLY
   (they drive the KPIs). Operates on the active project's state.commercial.ipcs
   and audits every change. The existing register render is left untouched.
   ============================================================ */

var _regSel = {};

function _ipcStatusKeys() {
  if (typeof IPC_PIPELINE_STAGES !== 'undefined' && IPC_PIPELINE_STAGES) return Object.keys(IPC_PIPELINE_STAGES);
  return ['draft', 'submitted', 'vetted', 'forwarded_to_client', 'approved', 'paid_pending_ack', 'paid'];
}
function _statusLabel(k) { return String(k || '').replace(/_/g, ' '); }
function _regIpcs() { return (state.commercial && state.commercial.ipcs) ? state.commercial.ipcs : []; }
function _findIpc(id) { return _regIpcs().find(i => String(i.id) === String(id)) || null; }

function setIpcStatus(id, status) {
  if (_ipcStatusKeys().indexOf(status) < 0) return false;
  const ipc = _findIpc(id); if (!ipc) return false;
  const before = ipc.status;
  if (before === status) return true;
  ipc.status = status; ipc.updatedAt = new Date().toISOString();
  if (typeof audit === 'function') audit('commercial.ipc.status', 'ipc', ipc.id, { status: before }, { status: status }, 'Status changed via register editor');
  if (typeof saveState === 'function') saveState();
  return true;
}
function setIpcNote(id, note) {
  const ipc = _findIpc(id); if (!ipc) return false;
  const before = ipc.note || '';
  ipc.note = (typeof _sanitizeText === 'function') ? _sanitizeText(note, 500) : String(note == null ? '' : note);
  if (typeof audit === 'function') audit('commercial.ipc.note', 'ipc', ipc.id, { note: before }, { note: ipc.note }, 'Note edited via register editor');
  if (typeof saveState === 'function') saveState();
  return true;
}
function bulkSetIpcStatus(ids, status) {
  if (_ipcStatusKeys().indexOf(status) < 0) return 0;
  let n = 0; (ids || []).forEach(id => { if (setIpcStatus(id, status)) n++; });
  return n;
}

/* ---- selection model ---- */
function _regSelIds() { return Object.keys(_regSel).filter(k => _regSel[k]); }
function _regSelCount() { return _regSelIds().length; }
function toggleRegSelect(id) { id = String(id); _regSel[id] = !_regSel[id]; if (!_regSel[id]) delete _regSel[id]; }
function clearRegSel() { _regSel = {}; }
function regSelectAll(on) {
  _regSel = {};
  if (on) _regIpcs().forEach(i => { _regSel[String(i.id)] = true; });
}

/* ---- UI ---- */
function renderRegisterEditor() {
  const host = document.getElementById('regEditorHost'); if (!host) return;
  const ipcs = _regIpcs().slice().sort((a, b) => (b.seq || 0) - (a.seq || 0));
  if (!ipcs.length) { host.innerHTML = ''; return; }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const money = (typeof fmt !== 'undefined' && fmt.money) ? fmt.money : (n => String(n));
  const statusOpts = sel => _ipcStatusKeys().map(k => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(_statusLabel(k)) + '</option>').join('');
  const selCount = _regSelCount();
  const allOn = selCount > 0 && selCount === ipcs.length;
  const bulkBar =
    '<div class="reg-bulkbar">' +
    '<label class="reg-selall"><input type="checkbox"' + (allOn ? ' checked' : '') + ' onclick="onRegSelectAll(this.checked)"> Select all</label>' +
    '<span class="reg-selcount">' + selCount + ' selected</span>' +
    '<span class="reg-bulkact"' + (selCount ? '' : ' style="opacity:.45"') + '>Set status to ' +
    '<select id="regBulkStatus">' + statusOpts('') + '</select>' +
    '<button class="reg-apply" onclick="onRegBulkApply()"' + (selCount ? '' : ' disabled') + '>Apply</button></span>' +
    (selCount ? '<button class="reg-clear" onclick="onRegClearSel()">Clear</button>' : '') +
    '</div>';
  const rows = ipcs.map(ipc => {
    const id = String(ipc.id);
    const checked = _regSel[id] ? ' checked' : '';
    return '<tr class="reg-row' + (_regSel[id] ? ' sel' : '') + '">' +
      '<td class="reg-ck"><input type="checkbox"' + checked + ' onclick="onRegSelectToggle(\'' + esc(id) + '\')"></td>' +
      '<td class="reg-no">' + esc(ipc.ipcNo || ipc.no || ('IPC-' + (ipc.seq || ''))) + '</td>' +
      '<td class="reg-amt num">' + money(ipc.gross || 0) + '</td>' +
      '<td class="reg-status"><select onchange="onRegStatus(\'' + esc(id) + '\', this.value)">' + statusOpts(ipc.status) + '</select></td>' +
      '<td class="reg-note"><input type="text" class="reg-note-in" placeholder="Add a note\u2026" value="' + esc(ipc.note || '') + '" onchange="onRegNote(\'' + esc(id) + '\', this.value)"></td>' +
      '</tr>';
  }).join('');
  host.innerHTML =
    '<div class="reg-editor-h">Register editor \u2014 bulk status &amp; notes <span class="reg-ro">amounts read-only</span><button class="reg-export" onclick="exportRegisterXlsx()">\u2b07 Excel</button></div>' +
    bulkBar +
    '<table class="reg-table"><thead><tr><th></th><th>IPC</th><th class="num">Gross</th><th>Status</th><th>Note</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function onRegSelectToggle(id) { toggleRegSelect(id); renderRegisterEditor(); }
function onRegSelectAll(on) { regSelectAll(on); renderRegisterEditor(); }
function onRegClearSel() { clearRegSel(); renderRegisterEditor(); }
function onRegStatus(id, val) {
  if (setIpcStatus(id, val)) { if (typeof toast === 'function') toast('Status updated', 'ok'); if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} } }
}
function onRegNote(id, val) {
  setIpcNote(id, val);
  if (typeof toast === 'function') toast('Note saved', 'ok');
}
function onRegBulkApply() {
  const selEl = document.getElementById('regBulkStatus');
  const status = selEl ? selEl.value : '';
  const ids = _regSelIds();
  if (!ids.length || !status) return;
  const n = bulkSetIpcStatus(ids, status);
  clearRegSel();
  if (typeof toast === 'function') toast(n + ' IPC' + (n === 1 ? '' : 's') + ' set to ' + _statusLabel(status), 'ok');
  if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
  renderRegisterEditor();
}

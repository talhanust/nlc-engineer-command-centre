/* ============================================================
   §BASELINE-INTAKE  Per-project baseline plans  (Phase E — S2)
   ============================================================
   Two single-global baselines become per-project, same trick as BOQ:
     SCURVE_BASELINE  (const->let)  : [{month,planned}]  progress S-curve
     BASELINE_DATA    (const->let)  : [{id,name,dur,ps,pf,wbs,parent,milestone}] schedule/WBS
   Stored on the node as project.scurve / project.schedule; the global
   bindings are re-pointed to the active project's baselines on every switch.
   Re-point defaults to [] when a project has no baseline, so a stale
   baseline from the previous project is never shown.

   Supply (both): XLSX/CSV upload (bundled SheetJS) OR pasted TSV/CSV, into an
   EXISTING project chosen from a dropdown. Parsers are pure.
   ============================================================ */

function _emptyScurve() { return []; }
function _emptySchedule() { return []; }

/* seed per-project baselines: proj-f14f15 inherits the built-ins, others empty. Idempotent. */
function migrateProjectBaselines() {
  if (!state.org || !state.org.projects) return;
  if (state.org.baselinesMigrated) return;
  Object.values(state.org.projects).forEach(p => {
    if (!Array.isArray(p.scurve)) p.scurve = (p.id === 'proj-f14f15' && typeof SCURVE_BASELINE !== 'undefined' && Array.isArray(SCURVE_BASELINE)) ? SCURVE_BASELINE : [];
    if (!Array.isArray(p.schedule)) p.schedule = (p.id === 'proj-f14f15' && typeof BASELINE_DATA !== 'undefined' && Array.isArray(BASELINE_DATA)) ? BASELINE_DATA : [];
  });
  state.org.baselinesMigrated = true;
}

/* re-point both baseline bindings at the active project (default [] if absent) */
function _repointBaselines() {
  const ap = (typeof getActiveProject === 'function') ? getActiveProject() : null;
  if (!ap) return;
  if (typeof SCURVE_BASELINE !== 'undefined') SCURVE_BASELINE = Array.isArray(ap.scurve) ? ap.scurve : [];
  if (typeof BASELINE_DATA !== 'undefined') BASELINE_DATA = Array.isArray(ap.schedule) ? ap.schedule : [];
}

/* ---- pure parsers ---- */
function _hdr(rows) { return rows[0].map(s => String(s == null ? '' : s).trim().toLowerCase().replace(/[ _.%]/g, '')); }
function _colFinder(header) { return (...names) => { for (const n of names) { const k = header.indexOf(n.replace(/[ _.%]/g, '')); if (k >= 0) return k; } return -1; }; }

function parseScurveRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const header = _hdr(rows); const idx = _colFinder(header);
  const cM = idx('month', 'period', 'mon'); const cP = idx('planned', 'plan', 'plannedpct', 'plannedprogress', 'progress');
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!Array.isArray(row) || !row.length) continue;
    const get = c => (c >= 0 && c < row.length) ? row[c] : '';
    const month = String(get(cM) || '').trim();
    if (!month) continue;
    out.push({ month: month, planned: parseFloat(get(cP)) || 0 });
  }
  return out;
}
function parseScurveText(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const delim = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
  return parseScurveRows(lines.map(l => l.split(delim)));
}

function parseScheduleRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const header = _hdr(rows); const idx = _colFinder(header);
  const c = {
    id: idx('id', 'activityid', 'actid', 'taskid'), name: idx('name', 'activity', 'description', 'task'),
    dur: idx('dur', 'duration', 'days'), ps: idx('ps', 'start', 'plannedstart', 'planstart', 'startdate'),
    pf: idx('pf', 'finish', 'plannedfinish', 'planfinish', 'end', 'finishdate', 'enddate'),
    wbs: idx('wbs', 'level', 'outline'), parent: idx('parent', 'parentid'), ms: idx('milestone', 'ms'),
  };
  const out = []; let seq = 1;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!Array.isArray(row) || !row.length) continue;
    const get = k => (k >= 0 && k < row.length) ? row[k] : '';
    const name = String(get(c.name) || '').trim();
    let id = String(get(c.id) || '').trim();
    if (!id && !name) continue;
    if (!id) id = 'A' + String(seq++).padStart(4, '0');
    const dur = parseFloat(get(c.dur)); const durN = isFinite(dur) ? dur : 0;
    const msRaw = String(get(c.ms) || '').trim().toLowerCase();
    const milestone = (msRaw === 'true' || msRaw === 'yes' || msRaw === '1' || msRaw === 'y') || durN === 0;
    const parent = String(get(c.parent) || '').trim() || null;
    const wbs = parseInt(get(c.wbs), 10);
    out.push({
      id: id, name: name, dur: durN,
      ps: String(get(c.ps) || '').trim(), pf: String(get(c.pf) || '').trim(),
      wbs: isFinite(wbs) ? wbs : 0, parent: parent, milestone: milestone,
    });
  }
  return out;
}
function parseScheduleText(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const delim = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
  return parseScheduleRows(lines.map(l => l.split(delim)));
}

/* ---- storage + re-point ---- */
function setProjectScurve(projId, scurve) {
  if (!state.org || !state.org.projects[projId] || !Array.isArray(scurve)) return false;
  state.org.projects[projId].scurve = scurve;
  if (state.org.activeProjectId === projId) _repointBaselines();
  audit('org.project.scurve', 'org', projId, null, { months: scurve.length }, 'S-curve baseline imported (' + scurve.length + ' months)');
  saveState();
  return true;
}
function setProjectSchedule(projId, schedule) {
  if (!state.org || !state.org.projects[projId] || !Array.isArray(schedule)) return false;
  state.org.projects[projId].schedule = schedule;
  if (state.org.activeProjectId === projId) _repointBaselines();
  audit('org.project.schedule', 'org', projId, null, { activities: schedule.length }, 'Schedule baseline imported (' + schedule.length + ' activities)');
  saveState();
  return true;
}

/* ---- intake UI ---- */
var _pendingScurve = null, _pendingSchedule = null;

function _scurvePreviewHtml(sc) {
  if (!sc || !sc.length) return '<div class="boq-intake-empty">No S-curve loaded.</div>';
  const last = sc[sc.length - 1];
  const rows = sc.slice(0, 6).map(m => '<tr><td>' + String(m.month) + '</td><td class="num">' + m.planned + '</td></tr>').join('');
  return '<div class="boq-intake-summary"><b>' + sc.length + '</b> months \u00b7 final planned <b>' + (last ? last.planned : 0) + '</b></div>' +
    '<table class="boq-intake-table"><thead><tr><th>Month</th><th class="num">Planned</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function _schedulePreviewHtml(sd) {
  if (!sd || !sd.length) return '<div class="boq-intake-empty">No schedule loaded.</div>';
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const ms = sd.filter(a => a.milestone).length;
  const starts = sd.map(a => a.ps).filter(Boolean).sort();
  const fins = sd.map(a => a.pf).filter(Boolean).sort();
  const rows = sd.slice(0, 6).map(a => '<tr><td>' + esc(a.id) + '</td><td>' + esc((a.name || '').slice(0, 40)) + '</td><td class="num">' + a.dur + '</td><td>' + esc(a.ps) + '</td><td>' + esc(a.pf) + '</td></tr>').join('');
  return '<div class="boq-intake-summary"><b>' + sd.length + '</b> activities \u00b7 <b>' + ms + '</b> milestones' + (starts.length ? ' \u00b7 ' + esc(starts[0]) + ' \u2192 ' + esc(fins[fins.length - 1] || '') : '') + '</div>' +
    '<table class="boq-intake-table"><thead><tr><th>ID</th><th>Activity</th><th class="num">Dur</th><th>Start</th><th>Finish</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderBaselineIntake() {
  const host = document.getElementById('baselineIntakeHost');
  if (!host) return;
  if (!state.org) { host.innerHTML = ''; return; }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  let opts = '';
  Object.values(state.org.projects).filter(p => !p.archived).forEach(p => { opts += '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; });
  host.innerHTML =
    '<div class="boq-intake-row"><label>Target project</label><select id="baselineTarget">' + opts + '</select></div>' +
    '<div class="baseline-cols">' +
    '<div class="baseline-col"><div class="baseline-col-h">Progress S-curve <span>(month, planned)</span></div>' +
    '<input id="scurveFile" type="file" accept=".xlsx,.xls,.csv" onchange="handleScurveFile(this)">' +
    '<textarea id="scurvePaste" class="boq-intake-paste" placeholder="month,planned\\nFeb-26,0\\nMar-26,80"></textarea>' +
    '<button class="btn" onclick="parseScurvePaste()">Parse pasted S-curve</button>' +
    '<div id="scurvePreview" class="boq-intake-preview">' + _scurvePreviewHtml(_pendingScurve) + '</div></div>' +
    '<div class="baseline-col"><div class="baseline-col-h">Schedule / programme <span>(id, name, dur, ps, pf, wbs, parent)</span></div>' +
    '<input id="scheduleFile" type="file" accept=".xlsx,.xls,.csv" onchange="handleScheduleFile(this)">' +
    '<textarea id="schedulePaste" class="boq-intake-paste" placeholder="id,name,dur,ps,pf,wbs,parent"></textarea>' +
    '<button class="btn" onclick="parseSchedulePaste()">Parse pasted schedule</button>' +
    '<div id="schedulePreview" class="boq-intake-preview">' + _schedulePreviewHtml(_pendingSchedule) + '</div></div>' +
    '</div>' +
    '<div class="boq-intake-actions"><button class="btn btn-primary" onclick="submitBaselineIntake()">Import baselines into project</button></div>';
}

function _refreshScurvePreview() { const el = document.getElementById('scurvePreview'); if (el) el.innerHTML = _scurvePreviewHtml(_pendingScurve); }
function _refreshSchedulePreview() { const el = document.getElementById('schedulePreview'); if (el) el.innerHTML = _schedulePreviewHtml(_pendingSchedule); }

function _readBaselineFile(input, kind) {
  const file = input && input.files && input.files[0]; if (!file) return;
  const name = (file.name || '').toLowerCase(); const reader = new FileReader();
  const apply = rowsOrText => {
    if (kind === 'scurve') { _pendingScurve = (typeof rowsOrText === 'string') ? parseScurveText(rowsOrText) : parseScurveRows(rowsOrText); _refreshScurvePreview(); }
    else { _pendingSchedule = (typeof rowsOrText === 'string') ? parseScheduleText(rowsOrText) : parseScheduleRows(rowsOrText); _refreshSchedulePreview(); }
  };
  if (name.endsWith('.csv')) { reader.onload = e => apply(String(e.target.result || '')); reader.readAsText(file); }
  else {
    reader.onload = e => {
      try { const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; apply(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })); }
      catch (err) { if (typeof toast === 'function') toast('Could not read that spreadsheet', 'error'); }
    };
    reader.readAsArrayBuffer(file);
  }
}
function handleScurveFile(input) { _readBaselineFile(input, 'scurve'); }
function handleScheduleFile(input) { _readBaselineFile(input, 'schedule'); }
function parseScurvePaste() { const ta = document.getElementById('scurvePaste'); _pendingScurve = parseScurveText(ta ? ta.value : ''); _refreshScurvePreview(); }
function parseSchedulePaste() { const ta = document.getElementById('schedulePaste'); _pendingSchedule = parseScheduleText(ta ? ta.value : ''); _refreshSchedulePreview(); }

function submitBaselineIntake() {
  const sel = document.getElementById('baselineTarget');
  const projId = sel ? sel.value : '';
  if (!projId || !state.org.projects[projId]) { if (typeof toast === 'function') toast('Pick a target project', 'error'); return; }
  if (!_pendingScurve && !_pendingSchedule) { if (typeof toast === 'function') toast('Load an S-curve or schedule first', 'error'); return; }
  let msg = [];
  if (_pendingScurve) { setProjectScurve(projId, _pendingScurve); msg.push(_pendingScurve.length + ' S-curve months'); }
  if (_pendingSchedule) { setProjectSchedule(projId, _pendingSchedule); msg.push(_pendingSchedule.length + ' activities'); }
  _pendingScurve = null; _pendingSchedule = null;
  if (typeof toast === 'function') toast('Imported ' + msg.join(' + '), 'success');
  if (typeof refreshAll === 'function') refreshAll();
  if (typeof renderBaselineIntake === 'function') renderBaselineIntake();
}

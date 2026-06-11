/* ============================================================
   §BOQ-INTAKE  Per-project BOQ import + live wiring  (Phase E — S1)
   ============================================================
   The app was single-project: `BOQ_DATA` is one module-level binding every
   commercial view reads. This makes BOQ per-project by (a) storing each
   project's BOQ on its node (project.boq), and (b) re-pointing the global
   BOQ_DATA binding to the active project's BOQ on every switch. The merger
   changes `const BOQ_DATA` -> `let BOQ_DATA` so it can be re-pointed.

   Supply: XLSX/CSV upload (via the bundled SheetJS) OR pasted TSV/CSV.
   Both feed one pure parser (parseBoqRows) -> {project, bills, items[],
   total_contract_value}. Contract value is derived from the line items.
   ============================================================ */

function _emptyBoq(name) { return { project: name || '', bills: {}, items: [], total_contract_value: 0 }; }

/* seed per-project BOQ: the existing F-14/F-15 project inherits the built-in
   BOQ_DATA; everyone else starts empty. Idempotent. */
function migrateProjectBoq() {
  if (!state.org || !state.org.projects) return;
  if (state.org.boqMigrated) return;
  Object.values(state.org.projects).forEach(p => {
    if (p.boq) return;
    if (p.id === 'proj-f14f15' && typeof BOQ_DATA === 'object' && BOQ_DATA) p.boq = BOQ_DATA;
    else p.boq = _emptyBoq(p.name);
  });
  state.org.boqMigrated = true;
}

/* re-point the global BOQ_DATA binding at the active project's BOQ */
function _repointBoqData() {
  const ap = (typeof getActiveProject === 'function') ? getActiveProject() : null;
  if (ap && ap.boq && typeof BOQ_DATA !== 'undefined') { BOQ_DATA = ap.boq; }
}

/* ---- pure parser: rows = array-of-arrays, first row = header ---- */
function parseBoqRows(rows, projectName) {
  if (!Array.isArray(rows) || rows.length < 2) return _emptyBoq(projectName);
  const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/[ _.]/g, '');
  const header = rows[0].map(norm);
  const idx = (...names) => { for (const n of names) { const k = header.indexOf(norm(n)); if (k >= 0) return k; } return -1; };
  const col = {
    bill_no: idx('bill_no', 'billno', 'bill'), bill_name: idx('bill_name', 'billname'),
    section: idx('section'), sr_no: idx('sr_no', 'srno', 'sno', 'sr'),
    item_code: idx('item_code', 'itemcode', 'code'), description: idx('description', 'desc', 'particulars'),
    unit: idx('unit', 'uom'), quantity: idx('quantity', 'qty'), rate: idx('rate'), amount: idx('amount', 'total'),
  };
  const items = []; const bills = {}; let total = 0; let seq = 1;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!Array.isArray(row) || !row.length) continue;
    const get = c => (c >= 0 && c < row.length) ? row[c] : '';
    const desc = String(get(col.description) || '').trim();
    const billNoRaw = get(col.bill_no);
    if (!desc && (billNoRaw === '' || billNoRaw == null)) continue;   // blank row
    const qty = parseFloat(get(col.quantity)) || 0;
    const rate = parseFloat(get(col.rate)) || 0;
    let amount = parseFloat(get(col.amount));
    if (!isFinite(amount) || amount === 0) amount = qty * rate;
    const billName = String(get(col.bill_name) || '').trim();
    const bn = (billNoRaw === '' || billNoRaw == null) ? '' : String(billNoRaw).trim();
    if (bn && billName && !bills[bn]) bills[bn] = billName;
    items.push({
      id: 'I' + String(seq++).padStart(4, '0'),
      bill_no: bn === '' ? null : (isNaN(+bn) ? bn : +bn),
      bill_name: billName, section: String(get(col.section) || '').trim(),
      sr_no: String(get(col.sr_no) || '').trim(), item_code: String(get(col.item_code) || '').trim(),
      description: desc, unit: String(get(col.unit) || '').trim(),
      quantity: qty, rate: rate, amount: amount,
    });
    total += amount;
  }
  return { project: projectName || '', bills, items, total_contract_value: total };
}

/* parse pasted CSV/TSV text */
function parseBoqText(text, projectName) {
  if (!text) return _emptyBoq(projectName);
  const lines = String(text).replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return _emptyBoq(projectName);
  const delim = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
  return parseBoqRows(lines.map(l => l.split(delim)), projectName);
}

/* set a project's BOQ + derive contract value + re-point if active */
function setProjectBoq(projId, boq) {
  if (!state.org || !state.org.projects[projId] || !boq) return false;
  const p = state.org.projects[projId];
  p.boq = boq;
  p.client = p.client || {};
  p.client.contractValue = boq.total_contract_value || 0;
  if (state.org.activeProjectId === projId) _repointBoqData();
  audit('org.project.boq', 'org', projId, null, { items: (boq.items || []).length, value: boq.total_contract_value }, 'BOQ imported (' + (boq.items || []).length + ' items)');
  saveState();
  return true;
}

/* create a new project under a PD HQ, with an optional parsed BOQ */
function createProjectWithBoq(pdHqId, name, boq) {
  if (typeof addProject !== 'function') return null;
  const p = addProject(pdHqId, { name: name });
  if (!p) return null;
  p.boq = boq || _emptyBoq(name);
  p.client = p.client || {};
  p.client.contractValue = (boq && boq.total_contract_value) || 0;
  if (typeof migrateAccessControl === 'function') { try { migrateAccessControl(); } catch (e) {} }
  audit('org.project.boq', 'org', p.id, null, { items: (p.boq.items || []).length, value: p.boq.total_contract_value }, 'Project created with BOQ');
  saveState();
  return p;
}

/* ---- intake UI ---- */
var _pendingBoq = null;

function _boqPreviewHtml(boq) {
  if (!boq || !boq.items || !boq.items.length) return '<div class="boq-intake-empty">No BOQ loaded yet.</div>';
  const money = (typeof fmt !== 'undefined' && fmt.short) ? fmt.short : (n => String(Math.round(n)));
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const billCount = Object.keys(boq.bills || {}).length;
  const sample = boq.items.slice(0, 5).map(it =>
    '<tr><td>' + esc(it.bill_no == null ? '' : it.bill_no) + '</td><td>' + esc((it.description || '').slice(0, 60)) +
    '</td><td>' + esc(it.unit) + '</td><td class="num">' + money(it.quantity) + '</td><td class="num">' + money(it.amount) + '</td></tr>'
  ).join('');
  return '<div class="boq-intake-summary"><b>' + boq.items.length + '</b> items \u00b7 <b>' + billCount + '</b> bills \u00b7 contract value <b>' + money(boq.total_contract_value) + '</b></div>' +
    '<table class="boq-intake-table"><thead><tr><th>Bill</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>' +
    sample + '</tbody></table><div class="boq-intake-note">Showing first ' + Math.min(5, boq.items.length) + ' of ' + boq.items.length + ' rows.</div>';
}

function renderBoqIntake() {
  const host = document.getElementById('boqIntakeHost');
  if (!host) return;
  if (!state.org) { host.innerHTML = ''; return; }
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  let pdOpts = '';
  if (typeof _pdHqList === 'function') _pdHqList().forEach(h => { pdOpts += '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>'; });

  host.innerHTML =
    '<div class="boq-intake-row"><label>Project name</label><input id="boqIntakeName" type="text" placeholder="e.g. Ring Road Phase II"></div>' +
    '<div class="boq-intake-row"><label>PD HQ</label><select id="boqIntakePd">' + pdOpts + '</select></div>' +
    '<div class="boq-intake-row"><label>Upload BOQ (.xlsx / .csv)</label><input id="boqIntakeFile" type="file" accept=".xlsx,.xls,.csv" onchange="handleBoqFile(this)"></div>' +
    '<div class="boq-intake-or">\u2014 or paste rows (tab/comma separated, header first) \u2014</div>' +
    '<textarea id="boqIntakePaste" class="boq-intake-paste" placeholder="bill_no,bill_name,section,sr_no,item_code,description,unit,quantity,rate,amount"></textarea>' +
    '<div class="boq-intake-actions"><button class="btn" onclick="parseBoqPaste()">Parse pasted rows</button>' +
    '<button class="btn btn-primary" onclick="submitBoqIntake()">Create project with BOQ</button></div>' +
    '<div id="boqIntakePreview" class="boq-intake-preview">' + _boqPreviewHtml(_pendingBoq) + '</div>';
}

function _refreshBoqPreview() {
  const el = document.getElementById('boqIntakePreview');
  if (el) el.innerHTML = _boqPreviewHtml(_pendingBoq);
}

function handleBoqFile(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  const name = (file.name || '').toLowerCase();
  const reader = new FileReader();
  if (name.endsWith('.csv')) {
    reader.onload = e => { _pendingBoq = parseBoqText(String(e.target.result || ''), document.getElementById('boqIntakeName') ? document.getElementById('boqIntakeName').value : ''); _refreshBoqPreview(); };
    reader.readAsText(file);
  } else {
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        _pendingBoq = parseBoqRows(rows, document.getElementById('boqIntakeName') ? document.getElementById('boqIntakeName').value : '');
      } catch (err) { _pendingBoq = _emptyBoq(''); if (typeof toast === 'function') toast('Could not read that spreadsheet', 'error'); }
      _refreshBoqPreview();
    };
    reader.readAsArrayBuffer(file);
  }
}

function parseBoqPaste() {
  const ta = document.getElementById('boqIntakePaste');
  const nm = document.getElementById('boqIntakeName');
  _pendingBoq = parseBoqText(ta ? ta.value : '', nm ? nm.value : '');
  _refreshBoqPreview();
}

function submitBoqIntake() {
  const nm = document.getElementById('boqIntakeName');
  const pd = document.getElementById('boqIntakePd');
  const name = nm ? nm.value.trim() : '';
  const pdHqId = pd ? pd.value : '';
  if (!name) { if (typeof toast === 'function') toast('Enter a project name', 'error'); return; }
  if (!pdHqId) { if (typeof toast === 'function') toast('Pick a PD HQ', 'error'); return; }
  const p = createProjectWithBoq(pdHqId, name, _pendingBoq);
  if (!p) { if (typeof toast === 'function') toast('Could not create project', 'error'); return; }
  _pendingBoq = null;
  if (typeof toast === 'function') toast('Project "' + name + '" created' + (p.boq && p.boq.items.length ? ' with ' + p.boq.items.length + ' BOQ items' : ''), 'success');
  if (typeof switchActiveProject === 'function') switchActiveProject(p.id);
  if (typeof refreshAll === 'function') refreshAll();
  if (typeof renderBoqIntake === 'function') renderBoqIntake();
}

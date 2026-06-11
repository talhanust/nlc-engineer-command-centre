/* ============================================================
   §RAG-CONFIG  Adjustable risk thresholds  (Phase E — S11)
   ============================================================
   The RAG model's cut-offs become user-tunable (state.ui.ragThresholds).
   Sliders in Admin let leadership set risk appetite; changing any threshold
   re-runs refreshAll, so every dashboard card, breadcrumb chip and export
   brief recolours instantly. Defaults reproduce the v1.25/26 behaviour.
   Keys (all percentages):
     collRed / collAmber   — collection = receipts / certified  (low = bad)
     recvAmber / recvRed   — receivables = net receivable / contract (high = bad)
     slipAmber / slipRed   — schedule slippage = planned - actual %
   ============================================================ */

var _RAG_DEFAULTS = { collRed: 40, collAmber: 70, recvAmber: 20, recvRed: 35, slipAmber: 7, slipRed: 15 };

function _ragThresholds() {
  if (!state.ui) return Object.assign({}, _RAG_DEFAULTS);
  if (!state.ui.ragThresholds) state.ui.ragThresholds = Object.assign({}, _RAG_DEFAULTS);
  for (const k in _RAG_DEFAULTS) if (state.ui.ragThresholds[k] == null) state.ui.ragThresholds[k] = _RAG_DEFAULTS[k];
  return state.ui.ragThresholds;
}

function setRagThreshold(key, val) {
  if (!(key in _RAG_DEFAULTS)) return false;
  const T = _ragThresholds();
  let v = parseFloat(val); if (!isFinite(v)) return false;
  v = Math.max(0, Math.min(100, v));
  T[key] = v;
  /* keep each pair ordered so amber/red can't cross over */
  if (T.collRed > T.collAmber) { if (key === 'collRed') T.collAmber = T.collRed; else T.collRed = T.collAmber; }
  if (T.recvAmber > T.recvRed) { if (key === 'recvRed') T.recvAmber = T.recvRed; else T.recvRed = T.recvAmber; }
  if (T.slipAmber > T.slipRed) { if (key === 'slipRed') T.slipAmber = T.slipRed; else T.slipRed = T.slipAmber; }
  if (typeof saveState === 'function') saveState();
  return true;
}

function resetRagThresholds() {
  if (!state.ui) return;
  state.ui.ragThresholds = Object.assign({}, _RAG_DEFAULTS);
  if (typeof saveState === 'function') saveState();
}

/* ---- settings UI ---- */
function _ragRow(key, label, hint) {
  const T = _ragThresholds();
  return '<div class="rag-cfg-row"><label>' + label + '</label>' +
    '<input type="range" min="0" max="100" step="1" value="' + T[key] + '" oninput="onRagSlider(\'' + key + '\', this.value)">' +
    '<span class="rag-cfg-val" id="ragval-' + key + '">' + T[key] + '%</span>' +
    '<span class="rag-cfg-hint">' + hint + '</span></div>';
}

function renderRagSettings() {
  const host = document.getElementById('ragHost');
  if (!host || !state.org) return;
  host.innerHTML =
    '<div class="rag-cfg-group"><div class="rag-cfg-h">Collection (receipts \u00f7 certified)</div>' +
    _ragRow('collRed', 'Red below', 'critical under-collection') +
    _ragRow('collAmber', 'Amber below', 'watch') + '</div>' +
    '<div class="rag-cfg-group"><div class="rag-cfg-h">Receivables (net receivable \u00f7 contract)</div>' +
    _ragRow('recvAmber', 'Amber above', 'rising exposure') +
    _ragRow('recvRed', 'Red above', 'critical exposure') + '</div>' +
    '<div class="rag-cfg-group"><div class="rag-cfg-h">Schedule slippage (planned \u2212 actual %)</div>' +
    _ragRow('slipAmber', 'Amber above', 'slipping') +
    _ragRow('slipRed', 'Red above', 'behind schedule') + '</div>' +
    '<div class="boq-intake-actions"><button class="btn" onclick="resetRagThresholds(); if(typeof refreshAll===\'function\')refreshAll(); renderRagSettings();">Reset to defaults</button></div>';
}

function onRagSlider(key, val) {
  setRagThreshold(key, val);
  const T = _ragThresholds();
  /* reflect any clamped pair back into the sliders */
  ['collRed', 'collAmber', 'recvAmber', 'recvRed', 'slipAmber', 'slipRed'].forEach(k => {
    const lbl = document.getElementById('ragval-' + k); if (lbl) lbl.textContent = T[k] + '%';
  });
  if (typeof refreshAll === 'function') refreshAll();
}

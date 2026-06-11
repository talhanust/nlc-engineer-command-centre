/* ============================================================
   §NODE-SCURVE  Weighted aggregate S-curve + schedule slippage  (Phase E — S9)
   ============================================================
   computeNodeSCurve(nodeId) → [{month, planned, actual}] — a contract-value-
   weighted portfolio %-complete curve across the node's (access-scoped)
   projects. Each project contributes its planned curve (project.scurve) and
   its actual monthly % (execution.monthly), carried forward across the union
   of all months (0 before a project starts, last value after it ends), so
   finished projects hold at 100 and not-yet-started count as 0 — the standard
   PMO weighting. _nodeScheduleSlippage(nodeId) = planned-actual at the latest
   month with actuals; feeds the RAG model. renderNodeSCurveHtml draws it.
   ============================================================ */

function _monthKey(label) {
  const parts = String(label || '').split('-');
  if (parts.length < 2) return 0;
  const mi = (typeof _HDR_MON !== 'undefined') ? _HDR_MON.indexOf(parts[0]) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(parts[0]);
  const yy = parseInt(parts[1], 10);
  if (mi < 0 || isNaN(yy)) return 0;
  return (2000 + yy) * 12 + mi;
}
function _carryVal(lookup, monthKey, keyOf) {
  let best = -Infinity, val = 0;
  for (const mm in lookup) { const k = keyOf(mm); if (k <= monthKey && k > best) { best = k; val = +lookup[mm] || 0; } }
  return val;
}

function computeNodeSCurve(nodeId) {
  if (typeof _projectsUnderNode !== 'function') return [];
  const projects = _projectsUnderNode(nodeId);
  const active = state.org && state.org.activeProjectId;
  const ps = projects.map(p => {
    const w = (p.client && p.client.contractValue) || 0;
    const sc = Array.isArray(p.scurve) ? p.scurve : [];
    const exec = (p.id === active) ? state.execution : (p.data && p.data.execution);
    const monthly = (exec && exec.monthly) || {};
    const planned = {}; sc.forEach(pt => { planned[pt.month] = +pt.planned || 0; });
    const actual = {}; Object.keys(monthly).forEach(k => { actual[k] = +monthly[k] || 0; });
    return { w: w, planned: planned, actual: actual, months: sc.map(pt => pt.month) };
  }).filter(x => x.w > 0 && x.months.length);
  if (!ps.length) return [];

  const keyMap = {};
  ps.forEach(x => x.months.forEach(m => { keyMap[m] = _monthKey(m); }));
  const keyOf = mm => (keyMap[mm] != null ? keyMap[mm] : _monthKey(mm));
  const union = Object.keys(keyMap).sort((a, b) => keyMap[a] - keyMap[b]);
  const totalW = ps.reduce((s, x) => s + x.w, 0) || 1;

  return union.map(m => {
    const km = keyMap[m];
    let pSum = 0, aSum = 0;
    ps.forEach(x => {
      pSum += x.w * _carryVal(x.planned, km, keyOf);
      aSum += x.w * _carryVal(x.actual, km, keyOf);
    });
    return { month: m, planned: Math.round(pSum / totalW * 10) / 10, actual: Math.round(aSum / totalW * 10) / 10 };
  });
}

function _nodeScheduleSlippage(nodeId) {
  const c = computeNodeSCurve(nodeId);
  if (!c.length) return null;
  let last = null;
  for (let i = c.length - 1; i >= 0; i--) { if (c[i].actual > 0) { last = c[i]; break; } }
  if (!last) return null;
  return Math.round((last.planned - last.actual) * 10) / 10;
}

function renderNodeSCurveHtml(nodeId) {
  const c = (typeof computeNodeSCurve === 'function') ? computeNodeSCurve(nodeId) : [];
  if (!c || c.length < 2) return '';
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s));
  const W = 720, H = 210, padL = 30, padR = 14, padT = 12, padB = 26, n = c.length;
  const x = i => padL + (n === 1 ? 0 : (i * (W - padL - padR) / (n - 1)));
  const y = v => padT + (100 - Math.max(0, Math.min(100, v))) / 100 * (H - padT - padB);
  const path = key => c.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
  const grid = [0, 25, 50, 75, 100].map(v => '<line x1="' + padL + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y(v).toFixed(1) + '" class="sc-grid"/><text x="' + (padL - 5) + '" y="' + (y(v) + 3).toFixed(1) + '" class="sc-axis" text-anchor="end">' + v + '</text>').join('');
  const xlab = '<text x="' + x(0) + '" y="' + (H - 8) + '" class="sc-axis">' + esc(c[0].month) + '</text><text x="' + (W - padR) + '" y="' + (H - 8) + '" class="sc-axis" text-anchor="end">' + esc(c[n - 1].month) + '</text>';
  const last = c[n - 1]; const slip = Math.round((last.planned - last.actual) * 10) / 10;
  const hide = (typeof _scurveHidden === 'function') ? _scurveHidden() : { planned: false, actual: false };
  const band = (W - padL - padR) / Math.max(1, n - 1);
  const dots = (key) => hide[key] ? '' : c.map((p, i) => '<circle class="sc-dot sc-dot-' + key + '" cx="' + x(i).toFixed(1) + '" cy="' + y(p[key]).toFixed(1) + '" r="2.6"/>').join('');
  /* one transparent hit-band per month → native tooltip with both values */
  const hits = c.map((p, i) => {
    const hx = (i === 0) ? padL : (x(i) - band / 2);
    const hw = (i === 0 || i === n - 1) ? band / 2 : band;
    return '<rect class="sc-hit" x="' + hx.toFixed(1) + '" y="' + padT + '" width="' + Math.max(1, hw).toFixed(1) + '" height="' + (H - padT - padB) + '"><title>' + esc(p.month) + '  \u2014  Planned ' + p.planned + '%  \u00b7  Actual ' + p.actual + '%  \u00b7  Slip ' + Math.round((p.planned - p.actual) * 10) / 10 + '%</title></rect>';
  }).join('');
  const plannedPath = hide.planned ? '' : '<path d="' + path('planned') + '" class="sc-planned"/>';
  const actualPath = hide.actual ? '' : '<path d="' + path('actual') + '" class="sc-actual"/>';
  const legP = '<a class="sc-legend-item' + (hide.planned ? ' sc-off' : '') + '" onclick="toggleScurveSeries(\'planned\')"><span class="sc-key sc-k-planned"></span>Planned ' + last.planned + '%</a>';
  const legA = '<a class="sc-legend-item' + (hide.actual ? ' sc-off' : '') + '" onclick="toggleScurveSeries(\'actual\')"><span class="sc-key sc-k-actual"></span>Actual ' + last.actual + '%</a>';
  return '<div class="cmd-scurve"><div class="cmd-childtitle">Portfolio S-curve \u2014 contract-value weighted planned vs actual %</div>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" class="sc-svg">' + grid +
    plannedPath + actualPath + dots('planned') + dots('actual') + hits + xlab + '</svg>' +
    '<div class="sc-legend">' + legP + '   ' + legA + '   \u00b7   Slippage ' + slip + '% <span class="sc-hint">(click to toggle \u00b7 hover for monthly values)</span></div></div>';
}

function _scurveHidden() {
  if (!state.ui) return { planned: false, actual: false };
  if (!state.ui.scurveHide) state.ui.scurveHide = { planned: false, actual: false };
  return state.ui.scurveHide;
}
function toggleScurveSeries(which) {
  if (which !== 'planned' && which !== 'actual') return;
  const h = _scurveHidden(); h[which] = !h[which];
  if (typeof saveState === 'function') saveState();
  if (typeof refreshAll === 'function') { try { refreshAll(); } catch (e) {} }
}

/* ============================================================
   §RAG-HEALTH  Node/project health status  (Phase E — S8)
   ============================================================
   A Red/Amber/Green status computed from the figures the rollup already
   aggregates, so it works identically for a project and any branch:
     • Collection   = receipts / certified   (<40% red, <70% amber)
     • Receivables  = net receivable / contract value  (>35% red, >20% amber)
     • Cash         = cash position < 0 → red
   Worst signal wins. Thresholds are deliberately conservative defaults and
   easy to tune. Rendered as a coloured dot on the dashboard child cards and
   the breadcrumb "drill into" chips, so you can drill toward the red.
   ============================================================ */

function _worseStatus(a, b) { const rank = { green: 0, amber: 1, red: 2 }; return (rank[b] > rank[a]) ? b : a; }

function _healthFromTotals(t) {
  t = t || {};
  const T = (typeof _ragThresholds === 'function') ? _ragThresholds() : { collRed: 40, collAmber: 70, recvAmber: 20, recvRed: 35 };
  const contract = +t.contractValue || 0;
  const cert = +t.vettedRevenue || 0;
  const recv = +t.receipts || 0;
  const cash = +t.cashPosition || 0;
  const netRec = +t.netReceivable || 0;
  let status = 'green'; const reasons = [];
  if (cert > 0) {
    const coll = recv / cert * 100;
    if (coll < T.collRed) { status = _worseStatus(status, 'red'); reasons.push('Low collection (' + Math.round(coll) + '%)'); }
    else if (coll < T.collAmber) { status = _worseStatus(status, 'amber'); reasons.push('Slow collection (' + Math.round(coll) + '%)'); }
  }
  if (contract > 0) {
    const out = netRec / contract * 100;
    if (out > T.recvRed) { status = _worseStatus(status, 'red'); reasons.push('High receivables'); }
    else if (out > T.recvAmber) { status = _worseStatus(status, 'amber'); reasons.push('Rising receivables'); }
  }
  if (cash < 0) { status = _worseStatus(status, 'red'); reasons.push('Negative cash position'); }
  return { status: status, reasons: reasons };
}

function nodeHealth(nodeId) {
  if (typeof computeNodeRollup !== 'function') return { status: 'green', reasons: [] };
  try {
    const r = computeNodeRollup(nodeId);
    const h = _healthFromTotals(r && r.totals);
    if (typeof _nodeScheduleSlippage === 'function') {
      const slip = _nodeScheduleSlippage(nodeId);
      const T = (typeof _ragThresholds === 'function') ? _ragThresholds() : { slipAmber: 7, slipRed: 15 };
      if (slip != null) {
        if (slip > T.slipRed) { h.status = _worseStatus(h.status, 'red'); h.reasons.push('Behind schedule (' + slip + '%)'); }
        else if (slip > T.slipAmber) { h.status = _worseStatus(h.status, 'amber'); h.reasons.push('Slipping (' + slip + '%)'); }
      }
    }
    return h;
  }
  catch (e) { return { status: 'green', reasons: [] }; }
}

function _ragClass(status) { return 'rag-' + (status || 'green'); }
function _ragDot(status) { return '<span class="rag-dot ' + _ragClass(status) + '" title="' + String(status || 'green').toUpperCase() + '"></span>'; }

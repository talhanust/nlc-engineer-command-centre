/* ============================================================
   §F  FINANCIAL MODULE (Phase B — Session 1)
   ============================================================
   Skeleton: state slice + Dashboard + Payments tabs.
   13 KPIs computed live from existing state (no register-mirror).
   Deferred to follow-up sessions: Receipts, Liabilities, Planned
   vs Actual, Cash Flow tab, P&L, Report. Register-mirror state
   (state.financial.receipts/payments/liabilities) also deferred.
   ============================================================ */

/* ---------- ensureFinancialState — boot safety net ---------- */
function ensureFinancialState() {
  if (!state.financial) state.financial = {};
  const f = state.financial;
  if (!Array.isArray(f.kpiSnapshots)) f.kpiSnapshots = [];
  /* v1.3.2 — register-mirror arrays (Session 2). Audit-purpose only;
     KPI compute path still reads from existing state (IPC.paid, RAR.paid, etc.). */
  if (!Array.isArray(f.receipts)) f.receipts = [];
  if (!Array.isArray(f.payments)) f.payments = [];
  /* v1.3.4 — user-extensible subCategory list. Starter set seeded only
     when the field is missing entirely (preserves user additions). */
  if (!Array.isArray(f.subCategories)) {
    f.subCategories = ['material', 'machinery', 'subcontractor',
                      'utilities', 'salaries', 'transport', 'other'];
  }
  if (!f.ui) f.ui = {};
  if (!f.ui.activeFinancialTab) f.ui.activeFinancialTab = 'dashboard';
  if (!('dateRange' in f.ui))    f.ui.dateRange    = null;
  if (!('selectedKpi' in f.ui))  f.ui.selectedKpi  = null;
  if (!f.ui.filter) f.ui.filter = {};
  /* v1.3.7 — Cash Flow Forecast window (default 6 months) */
  if (!f.ui.forecastWindow) f.ui.forecastWindow = 6;
}

/* ============================================================
   v1.3.4 — CLASSIFICATION (Session 4, PART A)
   ============================================================
   Default classification + subCategory per source-doc type.
   Single source of truth for the mapping logic — used by both
   the backfill and the hook payload construction.
   ============================================================ */

const FIN_CLASSIFICATIONS = ['direct_cost', 'overhead', 'advance_recovery', 'retention_release'];

function getDefaultClassification(refType, sourceDoc) {
  /* refType: 'rar' | 'epc' | 'proc_payment' | 'ipc' (future-proof)
     sourceDoc: the source-doc object itself (lets us inspect inner refType for proc) */
  switch (refType) {
    case 'rar':
      return { classification: 'direct_cost', subCategory: 'subcontractor' };
    case 'epc':
      return { classification: 'direct_cost', subCategory: 'subcontractor' };
    case 'proc_payment':
      /* The procurement payment's INNER refType is 'po' or 'machinery_hire' */
      if (sourceDoc && sourceDoc.refType === 'machinery_hire') {
        return { classification: 'direct_cost', subCategory: 'machinery' };
      }
      return { classification: 'direct_cost', subCategory: 'material' };
    case 'ipc':
      return { classification: 'direct_cost', subCategory: 'subcontractor' };
    default:
      return { classification: 'direct_cost', subCategory: 'other' };
  }
}

function backfillClassification() {
  /* Boot-time, idempotent. Walks existing paid documents and applies
     defaults to BOTH source-doc and register-entry if missing.
     - Skips records that already have classification set
     - Touches: state.commercial.rars[*], state.commercial.epcs[*],
       state.procurement.payments[*], and the corresponding register entries
     Returns counts for diagnostic visibility. */
  ensureFinancialState();
  let rarsFilled = 0, epcsFilled = 0, procFilled = 0, regFilled = 0;

  /* --- RARs --- */
  (state.commercial && state.commercial.rars || []).forEach(rar => {
    if (!rar.classification) {
      const d = getDefaultClassification('rar', rar);
      rar.classification = d.classification;
      rar.subCategory    = d.subCategory;
      rarsFilled++;
    }
  });

  /* --- EPCs --- */
  (state.commercial && state.commercial.epcs || []).forEach(epc => {
    if (!epc.classification) {
      const d = getDefaultClassification('epc', epc);
      epc.classification = d.classification;
      epc.subCategory    = d.subCategory;
      epcsFilled++;
    }
  });

  /* --- Procurement payments --- */
  (state.procurement && state.procurement.payments || []).forEach(p => {
    if (!p.classification) {
      const d = getDefaultClassification('proc_payment', p);
      p.classification = d.classification;
      p.subCategory    = d.subCategory;
      procFilled++;
    }
  });

  /* --- Register entries: sync from source --- */
  (state.financial.payments || []).forEach(entry => {
    if (entry.classification) return;
    let source = null;
    if (entry.refType === 'rar') {
      source = (state.commercial.rars || []).find(r => r.id === entry.refId);
    } else if (entry.refType === 'epc') {
      source = (state.commercial.epcs || []).find(e => e.id === entry.refId);
    } else if (entry.refType === 'proc_payment') {
      source = (state.procurement.payments || []).find(p => p.id === entry.refId);
    }
    if (source && source.classification) {
      entry.classification = source.classification;
      entry.subCategory    = source.subCategory;
    } else {
      const d = getDefaultClassification(entry.refType, source);
      entry.classification = d.classification;
      entry.subCategory    = d.subCategory;
    }
    regFilled++;
  });

  return { rarsFilled, epcsFilled, procFilled, regFilled };
}

/* End classification helpers */

/* ============================================================
   v1.3.2 — Register-mirror hooks (Session 2)
   ============================================================
   Each hook is IDEMPOTENT — dedup on (refType, refId) so calling
   twice for the same paid document does not double-record.
   ============================================================ */
function recordFinancialReceipt(payload) {
  ensureFinancialState();
  if (!payload || !payload.refType || !payload.refId) return null;
  /* Idempotency: skip if (refType,refId) already exists */
  const existing = state.financial.receipts.find(r =>
    r.refType === payload.refType && r.refId === payload.refId);
  if (existing) return existing;
  const rec = {
    id: 'fr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    refType: payload.refType,
    refId:   payload.refId,
    refNo:   payload.refNo || '',
    amount:  Number(payload.amount || 0),
    paidAt:  payload.paidAt || new Date().toISOString(),
    recordedBy: state.session && state.session.user || '(unset)',
    recordedAt: new Date().toISOString(),
  };
  state.financial.receipts.push(rec);
  if (typeof audit === 'function') {
    try { audit('financial.receipt.record', 'financial_receipt', rec.id, null, rec,
      `Recorded ${rec.refType} ${rec.refNo} receipt: ${rec.amount}`); } catch (e) {}
  }
  return rec;
}

function recordFinancialPayment(payload) {
  ensureFinancialState();
  if (!payload || !payload.refType || !payload.refId) return null;
  const existing = state.financial.payments.find(p =>
    p.refType === payload.refType && p.refId === payload.refId);
  if (existing) return existing;
  const rec = {
    id: 'fp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    refType: payload.refType,
    refId:   payload.refId,
    refNo:   payload.refNo || '',
    amount:  Number(payload.amount || 0),
    paidAt:  payload.paidAt || new Date().toISOString(),
    /* v1.3.4 — classification carried through hook payload (with defensive default) */
    classification: payload.classification || 'direct_cost',
    subCategory:    payload.subCategory    || 'other',
    recordedBy: state.session && state.session.user || '(unset)',
    recordedAt: new Date().toISOString(),
  };
  state.financial.payments.push(rec);
  if (typeof audit === 'function') {
    try { audit('financial.payment.record', 'financial_payment', rec.id, null, rec,
      `Recorded ${rec.refType} ${rec.refNo} payment: ${rec.amount}`); } catch (e) {}
  }
  return rec;
}

function getFinancialReceipt(refType, refId) {
  ensureFinancialState();
  return state.financial.receipts.find(r =>
    r.refType === refType && r.refId === refId) || null;
}

function getFinancialPayment(refType, refId) {
  ensureFinancialState();
  return state.financial.payments.find(p =>
    p.refType === refType && p.refId === refId) || null;
}

/* ---------- date-range helper (inclusive ISO range) ---------- */
function _inDateRange(iso, dateRange) {
  if (!dateRange) return true;
  if (!iso) return false;
  const [start, end] = dateRange;
  return (!start || iso >= start) && (!end || iso <= end);
}

/* ============================================================
   13 KPIs (formulas per spec B.3, sources verified against
   actual field names in HTML — see Critical Pitfall lessons)
   ============================================================ */
function computeAllKpis(dateRange) {
  dateRange = dateRange || null;
  ensureFinancialState();

  /* --- Source pulls (defensive: each guarded against missing arrays) --- */
  const ipcs = (state.commercial && state.commercial.ipcs) || [];
  const rars = (state.commercial && state.commercial.rars) || [];
  const epcs = (state.commercial && state.commercial.epcs) || [];
  const procPayments = (state.procurement && state.procurement.payments) || [];

  /* IPCs: grossAmount → ipc.gross; vetted via vettedGross when set.
     IPC status transitions (grep-verified, see HTML lines 8091-8611):
     draft → submitted → vetted → forwarded_to_client → approved
           → paid_pending_ack → paid */
  const VETTED_OR_LATER = new Set(['vetted','forwarded_to_client','approved','paid_pending_ack','paid']);
  const APPROVED_OR_LATER = new Set(['approved','paid_pending_ack','paid']);

  /* KPI 1 — Gross Revenue: Σ all IPC.gross regardless of status */
  let grossRevenue = 0;
  ipcs.forEach(ipc => {
    if (!_inDateRange(ipc.draftedAt || ipc.createdAt, dateRange)) return;
    grossRevenue += Number(ipc.gross || 0);
  });

  /* KPI 2 — Gross Vetted Revenue: Σ IPC.vettedGross where status ≥ vetted */
  let vettedRevenue = 0;
  ipcs.forEach(ipc => {
    if (!_inDateRange(ipc.draftedAt || ipc.createdAt, dateRange)) return;
    if (!VETTED_OR_LATER.has(ipc.status)) return;
    vettedRevenue += Number(ipc.vettedGross || 0);
  });

  /* KPI 3 — Net Receivable: Σ IPC.vettedNetPayable where ≥ approved, !paid */
  let netReceivable = 0;
  ipcs.forEach(ipc => {
    if (!_inDateRange(ipc.draftedAt || ipc.createdAt, dateRange)) return;
    if (!APPROVED_OR_LATER.has(ipc.status)) return;
    if (ipc.status === 'paid') return;
    netReceivable += Number(ipc.vettedNetPayable || ipc.netPayable || 0);
  });

  /* KPI 4 — Slippage = Gross Revenue − Gross Vetted Revenue */
  const slippage = grossRevenue - vettedRevenue;

  /* KPI 5 — Slippage Rate % (with /0 guard) */
  const slippageRate = grossRevenue > 0 ? (slippage / grossRevenue) * 100 : 0;

  /* IPC paid total (used by KPI 6, KPI 7) */
  let ipcPaidTotal = 0;
  ipcs.forEach(ipc => {
    if (ipc.status !== 'paid') return;
    if (!_inDateRange(ipc.paidAt, dateRange)) return;
    ipcPaidTotal += Number(ipc.paidAmount || ipc.netPayable || 0);
  });

  /* RAR paid total (used by KPI 7, KPI 8) */
  let rarPaidTotal = 0;
  rars.forEach(rar => {
    if (rar.status !== 'paid') return;
    if (!_inDateRange(rar.paidAt, dateRange)) return;
    rarPaidTotal += Number(rar.paidAmount || rar.netPayable || 0);
  });

  /* EPC paid total (KPI 8) — EPC has no paidAmount field, uses epc.amount when status==='paid' */
  let epcPaidTotal = 0;
  epcs.forEach(epc => {
    if (epc.status !== 'paid') return;
    if (!_inDateRange(epc.paidAt, dateRange)) return;
    epcPaidTotal += Number(epc.amount || 0);
  });

  /* Procurement payment paid total (KPI 8/9 — split by classification).
     v1.3.4: classification + subCategory are now first-class fields on
     each payment. Default 'direct_cost/material' set at payment creation. */
  const PAID_STAGES = new Set(['paid','recorded','completed']);
  let procPaidDirect = 0;
  let procPaidOverhead = 0;
  procPayments.forEach(p => {
    if (!PAID_STAGES.has(p.status)) return;
    if (!_inDateRange(p.paidAt || p.raisedAt, dateRange)) return;
    /* v1.3.4: read explicit classification; back-compat default to direct */
    const cls = p.classification || 'direct_cost';
    if (cls === 'overhead') {
      procPaidOverhead += Number(p.amount || 0);
    } else {
      procPaidDirect += Number(p.amount || 0);
    }
  });

  /* v1.3.4 — also split RAR/EPC totals by classification.
     RARs and EPCs default to direct_cost/subcontractor. If a user reclassifies
     one to overhead, the totals shift. */
  let rarOverhead = 0, epcOverhead = 0;
  rars.forEach(r => {
    if (r.status !== 'paid') return;
    if (!_inDateRange(r.paidAt, dateRange)) return;
    if (r.classification === 'overhead') {
      rarOverhead += Number(r.paidAmount || r.netPayable || 0);
    }
  });
  epcs.forEach(e => {
    if (e.status !== 'paid') return;
    if (!_inDateRange(e.paidAt, dateRange)) return;
    if (e.classification === 'overhead') {
      epcOverhead += Number(e.amount || 0);
    }
  });

  /* KPI 8 — Direct Cost: RAR + EPC + proc(direct) MINUS any reclassified to overhead */
  const directCost = (rarPaidTotal - rarOverhead) + (epcPaidTotal - epcOverhead) + procPaidDirect;

  /* KPI 9 — Overhead Cost: proc(overhead) + RAR-reclassified + EPC-reclassified */
  const overheadCost = procPaidOverhead + rarOverhead + epcOverhead;

  /* KPI 10 — Total Expenditure */
  const totalExpenditure = directCost + overheadCost;

  /* KPI 11 — Direct Cost Ratio % (with /0 guard) */
  const directRatio = totalExpenditure > 0 ? (directCost / totalExpenditure) * 100 : 0;

  /* KPI 12 — Overhead Ratio % */
  const overheadRatio = totalExpenditure > 0 ? (overheadCost / totalExpenditure) * 100 : 0;

  /* KPI 6 — Funds Utilization Rate %: Total Expenditure / Total Receipts × 100
     "Total Receipts" in session 1 = IPC paid total (the only inbound stream tracked). */
  const totalReceipts = ipcPaidTotal;
  const fundsUtilization = totalReceipts > 0 ? (totalExpenditure / totalReceipts) * 100 : 0;

  /* KPI 7 — Revenue Transfer Rate %: Σ RAR.paid / Σ IPC.paid × 100 */
  const revenueTransferRate = ipcPaidTotal > 0 ? (rarPaidTotal / ipcPaidTotal) * 100 : 0;

  /* KPI 13 — Gross Profit Margin %: (Vetted Revenue − Direct Cost) / Vetted Revenue × 100 */
  const grossMargin = vettedRevenue > 0 ? ((vettedRevenue - directCost) / vettedRevenue) * 100 : 0;

  /* KPI 13b — Net Profit Margin %: (Vetted Revenue − Total Expenditure) / Vetted Revenue × 100 */
  const netMargin = vettedRevenue > 0 ? ((vettedRevenue - totalExpenditure) / vettedRevenue) * 100 : 0;

  /* KPI 14 — Cash Flow (period): receipts − payments in dateRange */
  const cashFlow = totalReceipts - totalExpenditure;

  /* v1.3.7 — KPI 17 + 18 — Cash Flow rate metrics. Pull cumulative net from
     the register-mirror (Session 5 path), not from KPI math, because we need
     a TIME range to compute "months elapsed". */
  let earliestPaidAt = null;
  let totalAllPayments = 0;
  let totalAllReceipts = 0;
  (state.financial.receipts || []).forEach(r => {
    if (!r.paidAt) return;
    if (!earliestPaidAt || r.paidAt < earliestPaidAt) earliestPaidAt = r.paidAt;
    totalAllReceipts += Number(r.amount || 0);
  });
  (state.financial.payments || []).forEach(p => {
    if (!p.paidAt) return;
    if (!earliestPaidAt || p.paidAt < earliestPaidAt) earliestPaidAt = p.paidAt;
    totalAllPayments += Number(p.amount || 0);
  });

  let monthsElapsed = 1;
  if (earliestPaidAt) {
    const start = new Date(earliestPaidAt);
    const now = new Date();
    monthsElapsed = Math.max(1,
      (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1);
  }
  const cumulativeNet = totalAllReceipts - totalAllPayments;
  /* KPI 17 — Avg Monthly Cash Flow (PTD net / months elapsed) */
  const avgMonthlyCashFlow = cumulativeNet / monthsElapsed;
  /* KPI 18 — Months Cash on Hand: cumulative / avg-monthly-total-expenditure.
     Definition (per Q5 of Session 6 scope): direct + overhead = total payments.
     null when totalAllPayments = 0 (no burn defined yet, never NaN/Infinity).
     0 when cumulative < 0 (can't be negative months). */
  let monthsCashOnHand = null;
  if (totalAllPayments > 0) {
    if (cumulativeNet <= 0) {
      monthsCashOnHand = 0;
    } else {
      const avgMonthlyBurn = totalAllPayments / monthsElapsed;
      monthsCashOnHand = cumulativeNet / avgMonthlyBurn;
    }
  }

  return {
    grossRevenue, vettedRevenue, netReceivable,
    slippage, slippageRate,
    fundsUtilization, revenueTransferRate,
    directCost, overheadCost, totalExpenditure,
    directRatio, overheadRatio,
    grossMargin, netMargin,
    cashFlow,
    /* v1.3.7 — KPI 17 + 18 */
    avgMonthlyCashFlow, monthsCashOnHand,
    /* Internal totals — useful for register filtering */
    _totals: { ipcPaidTotal, rarPaidTotal, epcPaidTotal, procPaidDirect, procPaidOverhead,
               totalAllReceipts, totalAllPayments, cumulativeNet, monthsElapsed, earliestPaidAt },
  };
}

function computeKpi(kpiKey, dateRange) {
  const all = computeAllKpis(dateRange);
  return all[kpiKey];
}

/* ============================================================
   listFinancialPayments — unified outbound stream from existing state
   ============================================================ */
function listFinancialPayments(filter) {
  filter = filter || {};
  ensureFinancialState();
  const rows = [];

  const PAID_STAGES = new Set(['paid','recorded','completed']);

  /* RARs */
  if (!filter.refType || filter.refType === 'rar' || filter.refType === 'all') {
    (state.commercial.rars || []).forEach(rar => {
      if (rar.status !== 'paid') return;
      const amount = Number(rar.paidAmount || rar.netPayable || 0);
      const paidAt = rar.paidAt || rar.updatedAt || '';
      if (filter.dateRange && !_inDateRange(paidAt, filter.dateRange)) return;
      if (filter.classification && filter.classification !== 'direct_cost') return;
      rows.push({
        refType: 'rar',
        refId: rar.id,
        refNo: rar.rarNo || rar.id,
        paidAt, amount,
        classification: 'direct_cost',
        subCategory: 'subcontractor',
        viewer: 'rar',
      });
    });
  }
  /* EPCs */
  if (!filter.refType || filter.refType === 'epc' || filter.refType === 'all') {
    (state.commercial.epcs || []).forEach(epc => {
      if (epc.status !== 'paid') return;
      const amount = Number(epc.amount || 0);
      const paidAt = epc.paidAt || epc.approvedAt || '';
      if (filter.dateRange && !_inDateRange(paidAt, filter.dateRange)) return;
      if (filter.classification && filter.classification !== 'direct_cost') return;
      rows.push({
        refType: 'epc',
        refId: epc.id,
        refNo: epc.epcNo || epc.id,
        paidAt, amount,
        classification: 'direct_cost',
        subCategory: 'subcontractor',
        viewer: 'epc',
      });
    });
  }
  /* Procurement payments */
  if (!filter.refType || filter.refType === 'proc_payment' || filter.refType === 'all' || filter.refType === 'po') {
    ((state.procurement && state.procurement.payments) || []).forEach(p => {
      if (!PAID_STAGES.has(p.status)) return;
      const amount = Number(p.amount || 0);
      const paidAt = p.paidAt || p.raisedAt || '';
      if (filter.dateRange && !_inDateRange(paidAt, filter.dateRange)) return;
      const cls = (p.classification === 'overhead' || p.refType === 'overhead') ? 'overhead' : 'direct_cost';
      if (filter.classification && filter.classification !== cls) return;
      const sub = p.refType === 'machinery_hire' ? 'machinery' : 'material';
      rows.push({
        refType: 'proc_payment',
        refId: p.id,
        refNo: p.paymentNo || p.id,
        paidAt, amount,
        classification: cls,
        subCategory: sub,
        viewer: 'proc_payment',
      });
    });
  }

  /* Sort newest first */
  rows.sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
  return rows;
}

/* ============================================================
   Drill from KPI → filtered Payments register (3rd level handled
   by clicking the row to open the source document modal)
   ============================================================ */
function drillFromKpiToPayments(kpiKey) {
  ensureFinancialState();

  /* v1.3.1 — Route revenue/receivable-side KPIs to the existing Commercial IPC
     register (the Receipts tab proper comes in Session 2). Cost-side KPIs go
     to the Payments register as designed. */
  const REVENUE_SIDE = new Set([
    'grossRevenue', 'vettedRevenue', 'ipcReceived', 'netReceivable',
    'slippage', 'slippageRate',
  ]);
  if (REVENUE_SIDE.has(kpiKey)) {
    toast(`Drilling to IPC Register for ${kpiKey}`, 'info');
    if (typeof switchModule === 'function') {
      switchModule('commercial');
      if (typeof switchCommercialTab === 'function') {
        try { switchCommercialTab('ipc-register'); } catch (e) { /* tab name may vary */ }
      }
    }
    return;
  }

  /* Cost-side KPIs: filter the Payments register */
  const filter = { refType: 'all' };
  let label = '';
  switch (kpiKey) {
    case 'directCost':
      filter.classification = 'direct_cost';
      label = 'Direct Cost components';
      break;
    case 'overheadCost':
      filter.classification = 'overhead';
      label = 'Overhead Cost components';
      break;
    case 'totalExpenditure':
      label = 'All Expenditure';
      break;
    case 'revenueTransferRate':
      filter.refType = 'rar';
      label = 'Subcontractor RAR payments';
      break;
    case 'fundsUtilization':
      label = 'All payments (vs receipts)';
      break;
    default:
      label = kpiKey + ' constituents';
  }
  state.financial.ui.selectedKpi = kpiKey;
  state.financial.ui.filter = filter;
  saveState();
  switchFinancialTab('payments');
  toast(`Drilled to: ${label}`, 'success');
}

function clearFinancialFilter() {
  ensureFinancialState();
  state.financial.ui.selectedKpi = null;
  state.financial.ui.filter = {};
  saveState();
  renderFinancialPayments();
}

/* ============================================================
   Tab switch (mirrors switchProcurementTab pattern)
   ============================================================ */
function switchFinancialTab(name) {
  document.querySelectorAll('#pane-financial .subtab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.finsubtab === name));
  document.querySelectorAll('#pane-financial > .page').forEach(p =>
    p.classList.toggle('active', p.id === 'fin-page-' + name));
  ensureFinancialState();
  state.financial.ui.activeFinancialTab = name;
  saveState();
  if (name === 'dashboard')        renderFinancialDashboard();
  if (name === 'receipts')         renderFinancialReceipts();
  if (name === 'payments')         renderFinancialPayments();
  if (name === 'liabilities')      renderFinancialLiabilities();
  if (name === 'cashflow')         renderFinancialCashFlow();
  if (name === 'planned-vs-actual') renderPlannedVsActual();
  if (name === 'pnl')              renderFinancialPL();
}

/* ============================================================
   Top-nav badge (mirrors refreshProcurementBadges)
   ============================================================ */
function refreshFinancialBadges() {
  ensureFinancialState();
  /* Show count of paid documents tracked (RARs + EPCs + proc payments) */
  const rars = (state.commercial.rars || []).filter(r => r.status === 'paid').length;
  const epcs = (state.commercial.epcs || []).filter(e => e.status === 'paid').length;
  const PAID_STAGES = new Set(['paid','recorded','completed']);
  const procs = ((state.procurement && state.procurement.payments) || []).filter(p => PAID_STAGES.has(p.status)).length;
  safeSetText('modFinancialBadge', String(rars + epcs + procs));
  /* If Dashboard is the active tab in the Financial pane and the pane is visible,
     re-render so live-recompute is reflected. */
  if (state.ui && state.ui.activeModule === 'financial' &&
      state.financial.ui.activeFinancialTab === 'dashboard') {
    renderFinancialDashboard();
  }
}

/* ============================================================
   Render — Dashboard
   ============================================================ */
function renderFinancialDashboard() {
  ensureFinancialState();
  _ensurePlannedOverheads();
  const k = computeAllKpis(state.financial.ui.dateRange);
  const grid = document.getElementById('finKpiGrid');
  if (!grid) return;

  /* v1.3.5 — Burn Rate + vs Budget computed once, used in cards below */
  const burnRate = computeOverheadBurnRate();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const vsBudget = computeOverheadVsBudget(currentMonth);
  const sparkline = renderOverheadSparkline(6);

  const cards = [
    { key: 'grossRevenue',        label: 'Gross Revenue',         val: k.grossRevenue,            type: 'pkr' },
    { key: 'vettedRevenue',       label: 'Gross Vetted Revenue',  val: k.vettedRevenue,           type: 'pkr' },
    { key: 'ipcReceived',         label: 'IPC Received (client)', val: k._totals.ipcPaidTotal,    type: 'pkr' },
    { key: 'netReceivable',       label: 'Net Receivable',        val: k.netReceivable,           type: 'pkr' },
    { key: 'slippage',            label: 'Slippage',              val: k.slippage,                type: 'pkr' },
    { key: 'slippageRate',        label: 'Slippage Rate',         val: k.slippageRate,            type: 'pct' },
    { key: 'fundsUtilization',    label: 'Funds Utilization',     val: k.fundsUtilization,        type: 'pct' },
    { key: 'revenueTransferRate', label: 'Revenue Transfer Rate', val: k.revenueTransferRate,     type: 'pct' },
    { key: 'directCost',          label: 'Direct Cost',           val: k.directCost,              type: 'pkr' },
    { key: 'overheadCost',        label: 'Overhead Cost',         val: k.overheadCost,            type: 'pkr',
      extra: sparkline },
    { key: 'totalExpenditure',    label: 'Total Expenditure',     val: k.totalExpenditure,        type: 'pkr' },
    { key: 'directRatio',         label: 'Direct Cost Ratio',     val: k.directRatio,             type: 'pct' },
    { key: 'overheadRatio',       label: 'Overhead Ratio',        val: k.overheadRatio,           type: 'pct' },
    /* v1.3.5 — KPI 15 + 16 */
    { key: 'overheadBurnRate',    label: 'Overhead Burn (30d)',   val: burnRate,                  type: 'pkr' },
    { key: 'overheadVsBudget',    label: 'Overhead vs Budget',    val: vsBudget.pct, type: 'pct',
      note: vsBudget.pct === null ? `No budget set for ${currentMonth}` : null },
    /* v1.3.7 — KPI 17 + 18 (Phase B closeout) */
    { key: 'avgMonthlyCashFlow',  label: 'Avg Monthly Cash Flow', val: k.avgMonthlyCashFlow,      type: 'pkr' },
    { key: 'monthsCashOnHand',    label: 'Months Cash on Hand',   val: k.monthsCashOnHand, type: 'num' },
    { key: 'grossMargin',         label: 'Gross Profit Margin',   val: k.grossMargin,             type: 'pct' },
    { key: 'netMargin',           label: 'Net Profit Margin',     val: k.netMargin,               type: 'pct' },
  ];
  grid.innerHTML = cards.map(c => renderFinancialKpiCard(c)).join('');

  /* Cash Flow card as its own row */
  const cashHost = document.getElementById('finCashFlowCard');
  if (cashHost) {
    const cls = k.cashFlow >= 0 ? 'fin-pos' : 'fin-neg';
    const range = state.financial.ui.dateRange
      ? `${state.financial.ui.dateRange[0]} → ${state.financial.ui.dateRange[1]}`
      : 'project-to-date';
    cashHost.innerHTML = `
      <div class="fin-cashflow-card ${cls}">
        <div class="fin-cashflow-label">Cash Flow (${range})</div>
        <div class="fin-cashflow-value">${fmt.money(k.cashFlow)}</div>
        <div class="fin-cashflow-sub">Receipts ${fmt.short(k._totals.ipcPaidTotal)} − Expenditure ${fmt.short(k.totalExpenditure)}</div>
      </div>`;
  }

  /* v1.3.5 — Admin row: add subCategory + set planned overhead for current month */
  const adminHost = document.getElementById('finAdminPanel');
  if (adminHost) {
    const plannedCurr = state.financial.plannedOverheads[currentMonth] || 0;
    adminHost.innerHTML = `
      <div class="fin-admin-row">
        <div class="fin-admin-card">
          <label class="fin-admin-label">Add subCategory</label>
          <div class="fin-admin-controls">
            <input type="text" id="finNewSubCategory" class="input-sm" placeholder="e.g. fuel" style="flex:1;" />
            <button class="btn btn-sm" onclick="addSubCategory(document.getElementById('finNewSubCategory').value); document.getElementById('finNewSubCategory').value='';">Add</button>
          </div>
          <div class="fin-admin-hint">${(state.financial.subCategories || []).length} subCategories: ${(state.financial.subCategories || []).join(', ')}</div>
        </div>
        <div class="fin-admin-card">
          <label class="fin-admin-label">Planned overhead for ${currentMonth}</label>
          <div class="fin-admin-controls">
            <input type="number" id="finPlannedAmount" class="input-sm" placeholder="0" value="${plannedCurr}" min="0" step="any" style="flex:1;text-align:right;" />
            <button class="btn btn-sm" onclick="setPlannedOverhead('${currentMonth}', parseFloat(document.getElementById('finPlannedAmount').value)||0);">Set</button>
          </div>
          <div class="fin-admin-hint">Total planned (all months): PKR ${fmt.short(getTotalPlannedOverhead())}</div>
        </div>
      </div>`;
  }
}

function renderFinancialKpiCard(c) {
  let display;
  if (c.type === 'pkr') {
    display = `PKR ${fmt.short(c.val)}`;
  } else if (c.type === 'pct') {
    display = (c.val === null) ? '—' : fmt.pct(c.val, 1);
  } else if (c.type === 'num') {
    /* v1.3.7 — numeric type for things like "Months Cash on Hand" */
    display = (c.val === null) ? '—'
            : (c.val < 1 ? c.val.toFixed(1) : c.val.toFixed(1)) + ' mo';
  } else {
    display = String(c.val);
  }
  const note = c.note ? `<div class="fin-kpi-note">${c.note}</div>` : '';
  const extra = c.extra ? `<div class="fin-kpi-extra">${c.extra}</div>` : '';
  return `<div class="fin-kpi-card" onclick="drillFromKpiToPayments('${c.key}')" title="Drill to constituents">
    <div class="fin-kpi-label">${c.label}</div>
    <div class="fin-kpi-value">${display}</div>
    ${note}
    ${extra}
    <div class="fin-kpi-drill">▶ drill</div>
  </div>`;
}

/* ============================================================
   Render — Payments register (the drill landing zone)
   ============================================================ */
function renderFinancialPayments() {
  ensureFinancialState();
  const host = document.getElementById('finPaymentsHost');
  if (!host) return;
  const filter = state.financial.ui.filter || {};
  const rows = listFinancialPayments(filter);

  let header = '';
  const activeFilters = [];
  if (filter.refType && filter.refType !== 'all') activeFilters.push(`refType=${filter.refType}`);
  if (filter.classification) activeFilters.push(`classification=${filter.classification}`);
  if (state.financial.ui.selectedKpi) activeFilters.push(`from KPI: ${state.financial.ui.selectedKpi}`);
  if (activeFilters.length > 0) {
    header = `<div class="fin-filter-bar">
      <span>Active filter: ${activeFilters.join(' · ')}</span>
      <button class="btn btn-sm" onclick="clearFinancialFilter()">Clear</button>
    </div>`;
  }

  if (rows.length === 0) {
    host.innerHTML = header + `<div class="proc-empty"><div class="proc-empty-icon">💸</div>No payments match the current filter.</div>`;
    return;
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  /* v1.3.5 — Classification + subCategory dropdowns per row */
  const classOpts = FIN_CLASSIFICATIONS.map(c =>
    `<option value="${c}">${c.replace(/_/g, ' ')}</option>`).join('');
  const subOpts = (state.financial.subCategories || []).map(s =>
    `<option value="${s}">${s}</option>`).join('');
  host.innerHTML = header + `
    <table class="proc-table fin-payments-table">
      <thead><tr>
        <th>Ref</th><th>No</th><th class="num">Amount (PKR)</th>
        <th>Classification</th><th>Subcategory</th><th>Paid At</th><th></th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><span class="fin-ref-pill fin-ref-${r.refType}">${r.refType}</span></td>
        <td><strong>${r.refNo}</strong></td>
        <td class="num">${fmt.money(r.amount)}</td>
        <td>
          <select class="input-sm fin-class-select" data-payment-id="${r.refId}" data-ref-type="${r.refType}"
                  onchange="changeClassification('${r.refType}','${r.refId}', this.value)">
            ${classOpts.replace(`value="${r.classification}"`, `value="${r.classification}" selected`)}
          </select>
        </td>
        <td>
          <select class="input-sm fin-sub-select" data-payment-id="${r.refId}" data-ref-type="${r.refType}"
                  onchange="changeSubCategory('${r.refType}','${r.refId}', this.value)">
            ${subOpts.replace(`value="${r.subCategory}"`, `value="${r.subCategory}" selected`)}
          </select>
        </td>
        <td>${fmt.date(r.paidAt)}</td>
        <td><button class="btn btn-sm" onclick="openFinancialPaymentSource('${r.viewer}','${r.refId}')">View</button></td>
      </tr>`).join('')}
      <tr class="fin-payments-total"><td colspan="2"><strong>Total</strong></td>
        <td class="num"><strong>${fmt.money(total)}</strong></td>
        <td colspan="4"><span style="color:var(--ink-3);font-size:11px;">${rows.length} payments</span></td>
      </tr>
      </tbody>
    </table>`;
}

/* ============================================================
   Drill 3rd-level — open the source document modal
   ============================================================ */
function openFinancialPaymentSource(viewer, refId) {
  /* Use ACTUAL function names found in the HTML (grep-verified):
     - RAR:  openRARDetail (line ~9091)
     - IPC:  openIPCDetail (line ~7833) — not used in payments register but kept for future
     - EPC:  no opener exists in v1.3.0 — show a useful fallback rather than a "viewer not found" toast.
     - Procurement payment: openProcPaymentView (Phase A) */
  if (viewer === 'rar') {
    if (typeof openRARDetail === 'function') { openRARDetail(refId); return; }
    toast(`RAR ${refId} viewer unavailable`, 'warn');
  } else if (viewer === 'epc') {
    /* EPC has no existing detail-modal as of v1.3.0.
       Switch to the Commercial module's EPC tab where the user can locate it. */
    toast(`Opening EPC ${refId} in Commercial → EPC tab`, 'info');
    if (typeof switchModule === 'function') {
      switchModule('commercial');
      if (typeof switchCommercialTab === 'function') {
        try { switchCommercialTab('epc'); } catch (e) { /* tab name may vary */ }
      }
    }
  } else if (viewer === 'proc_payment') {
    if (typeof openProcPaymentView === 'function') { openProcPaymentView(refId); return; }
    toast(`Payment ${refId} viewer unavailable`, 'warn');
  }
}

/* ============================================================
   v1.3.3 — RECEIPTS tab (Session 3)
   ============================================================
   Reads from state.financial.receipts[] (the register-mirror
   populated by Session 2's confirmIPCPayment hook). Older paid
   IPCs from before v1.3.2 do NOT appear here — they were paid
   before the hook existed. Surface that limitation in the UI.
   ============================================================ */

function computeReceiptsByMonth(receipts) {
  /* Groups receipts by month-year of paidAt. Returns sorted array, newest first. */
  receipts = Array.isArray(receipts) ? receipts : [];
  const buckets = {};
  receipts.forEach(r => {
    const iso = r.paidAt || r.recordedAt || '';
    /* Extract YYYY-MM. Defensive against malformed/empty paidAt. */
    const monthKey = (iso && iso.length >= 7) ? iso.slice(0, 7) : 'unknown';
    if (!buckets[monthKey]) buckets[monthKey] = { monthKey, count: 0, total: 0, items: [] };
    buckets[monthKey].count++;
    buckets[monthKey].total += Number(r.amount || 0);
    buckets[monthKey].items.push(r);
  });
  /* Sort newest first; 'unknown' sinks to the bottom */
  return Object.values(buckets).sort((a, b) => {
    if (a.monthKey === 'unknown') return 1;
    if (b.monthKey === 'unknown') return -1;
    return b.monthKey.localeCompare(a.monthKey);
  });
}

function renderFinancialReceipts() {
  ensureFinancialState();
  const host = document.getElementById('finReceiptsHost');
  if (!host) return;
  const receipts = state.financial.receipts || [];
  const buckets = computeReceiptsByMonth(receipts);
  const grandTotal = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
  const latestPaidAt = receipts.reduce((latest, r) => {
    const d = r.paidAt || '';
    return (!latest || d > latest) ? d : latest;
  }, '');

  /* Empty-state */
  if (receipts.length === 0) {
    host.innerHTML = `
      <div class="fin-note">
        Showing receipts recorded since v1.3.2 hooks were enabled.
        Older paid IPCs may not appear here — click <strong>Re-scan</strong> to backfill them.
      </div>
      <div style="margin-bottom:12px;">
        <button class="btn btn-sm" onclick="manualReScanReceipts()">↻ Re-scan paid IPCs</button>
      </div>
      <div class="proc-empty"><div class="proc-empty-icon">💰</div>
        No receipts recorded yet. Pay an IPC or click Re-scan to backfill historical IPCs.
      </div>`;
    return;
  }

  /* Summary cards */
  const summary = `
    <div class="fin-note">
      Showing receipts recorded since v1.3.2 hooks were enabled.
      Older paid IPCs may not appear here — click <strong>Re-scan</strong> to backfill them.
    </div>
    <div style="margin-bottom:12px;">
      <button class="btn btn-sm" onclick="manualReScanReceipts()">↻ Re-scan paid IPCs</button>
    </div>
    <div class="fin-summary-row">
      <div class="fin-summary-card">
        <div class="fin-summary-label">Total Received</div>
        <div class="fin-summary-value">${fmt.money(grandTotal)}</div>
      </div>
      <div class="fin-summary-card">
        <div class="fin-summary-label">Receipts Logged</div>
        <div class="fin-summary-value">${receipts.length}</div>
      </div>
      <div class="fin-summary-card">
        <div class="fin-summary-label">Latest Receipt</div>
        <div class="fin-summary-value" style="font-size:14px;">${latestPaidAt ? fmt.date(latestPaidAt) : '—'}</div>
      </div>
    </div>`;

  /* Monthly aggregation */
  let cumulative = 0;
  const monthRows = buckets.map(b => {
    cumulative += b.total;
    const pct = grandTotal > 0 ? (cumulative / grandTotal * 100) : 0;
    const monthLabel = b.monthKey === 'unknown' ? 'Unknown date'
                     : new Date(b.monthKey + '-01').toLocaleDateString('en-PK', { month: 'short', year: 'numeric' });
    return `<tr>
      <td>${monthLabel}</td>
      <td class="num">${b.count}</td>
      <td class="num">${fmt.money(b.total)}</td>
      <td class="num">${pct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  /* Detail table — newest first */
  const detailSorted = [...receipts].sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
  const detailRows = detailSorted.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.refNo || '—')}</strong></td>
      <td>${fmt.date(r.paidAt)}</td>
      <td class="num">${fmt.money(r.amount)}</td>
      <td><button class="btn btn-sm" onclick="openFinancialReceiptSource('${r.refId}')">View</button></td>
    </tr>`).join('');

  host.innerHTML = summary + `
    <div class="fin-subsection-head">Receipts by Month</div>
    <table class="proc-table">
      <thead><tr><th>Month</th><th class="num">Count</th><th class="num">Total (PKR)</th><th class="num">Cumulative %</th></tr></thead>
      <tbody>${monthRows}</tbody>
    </table>
    <div class="fin-subsection-head">All Receipts (newest first)</div>
    <table class="proc-table">
      <thead><tr><th>IPC No</th><th>Paid At</th><th class="num">Amount (PKR)</th><th></th></tr></thead>
      <tbody>${detailRows}</tbody>
    </table>`;
}

function openFinancialReceiptSource(refId) {
  if (typeof openIPCDetail === 'function') { openIPCDetail(refId); return; }
  toast(`IPC ${refId} viewer unavailable`, 'warn');
}

/* ============================================================
   v1.3.3 — LIABILITIES tab (Session 3)
   ============================================================
   Reads from existing state (no new mirror needed):
   - Outstanding RAR: state.commercial.rars where status === 'approved'
   - Retention held:  Σ ipc.deductions.retention across all IPCs
   ============================================================ */

function computeOutstandingRars() {
  const rars = (state.commercial && state.commercial.rars) || [];
  return rars.filter(r => r.status === 'approved');
}

function computeRetentionHeld() {
  const ipcs = (state.commercial && state.commercial.ipcs) || [];
  let total = 0;
  const byIpc = [];
  ipcs.forEach(ipc => {
    /* Mirror the exact pattern at HTML line 11992 */
    const r = (ipc.deductions && ipc.deductions.retention) || 0;
    if (r > 0) {
      total += r;
      byIpc.push({ ipcNo: ipc.ipcNo, ipcId: ipc.id, status: ipc.status, retention: r });
    }
  });
  return { total, byIpc };
}

function renderFinancialLiabilities() {
  ensureFinancialState();
  const host = document.getElementById('finLiabilitiesHost');
  if (!host) return;

  const outstandingRars = computeOutstandingRars();
  const retention = computeRetentionHeld();

  const rarTotal = outstandingRars.reduce((s, r) => s + Number(r.netPayable || 0), 0);
  const totalLiab = rarTotal + retention.total;

  /* Empty-state */
  if (outstandingRars.length === 0 && retention.total === 0) {
    host.innerHTML = `<div class="proc-empty"><div class="proc-empty-icon">📋</div>
      No outstanding liabilities right now.</div>`;
    return;
  }

  /* Summary row */
  const summary = `
    <div class="fin-summary-row">
      <div class="fin-summary-card fin-card-warn">
        <div class="fin-summary-label">Total Liabilities</div>
        <div class="fin-summary-value">${fmt.money(totalLiab)}</div>
      </div>
      <div class="fin-summary-card">
        <div class="fin-summary-label">Outstanding RAR</div>
        <div class="fin-summary-value">${fmt.money(rarTotal)}</div>
      </div>
      <div class="fin-summary-card">
        <div class="fin-summary-label">Retention Held</div>
        <div class="fin-summary-value">${fmt.money(retention.total)}</div>
      </div>
    </div>`;

  /* Outstanding RAR section */
  const today = new Date().toISOString().slice(0, 10);
  const rarRows = outstandingRars.map(r => {
    const sub = (typeof getSub === 'function') ? getSub(r.subId) : null;
    const subName = sub ? (sub.name || sub.code || sub.id) : (r.subId || '—');
    let daysPending = '—';
    if (r.approvedAt) {
      const days = Math.max(0, Math.floor((new Date(today) - new Date(r.approvedAt.slice(0, 10))) / (1000 * 60 * 60 * 24)));
      daysPending = String(days);
    }
    return `<tr>
      <td><strong>${escapeHtml(r.rarNo || '—')}</strong></td>
      <td>${escapeHtml(subName)}</td>
      <td class="num">${fmt.money(r.netPayable || 0)}</td>
      <td>${fmt.date(r.approvedAt)}</td>
      <td class="num">${daysPending}</td>
      <td><button class="btn btn-sm" onclick="openFinancialRarSource('${r.id}')">View</button></td>
    </tr>`;
  }).join('');

  const rarSection = outstandingRars.length > 0 ? `
    <div class="fin-subsection-head">Outstanding RAR (approved, awaiting payment)</div>
    <table class="proc-table">
      <thead><tr><th>RAR No</th><th>Subcontractor</th><th class="num">Net Payable (PKR)</th><th>Approved At</th><th class="num">Days Pending</th><th></th></tr></thead>
      <tbody>${rarRows}</tbody>
    </table>` : '';

  /* Retention held section */
  const retentionRows = retention.byIpc.map(b => `
    <tr>
      <td><strong>${escapeHtml(b.ipcNo || '—')}</strong></td>
      <td>${escapeHtml(b.status || '—')}</td>
      <td class="num">${fmt.money(b.retention)}</td>
      <td><button class="btn btn-sm" onclick="openFinancialReceiptSource('${b.ipcId}')">View</button></td>
    </tr>`).join('');

  const retentionSection = retention.byIpc.length > 0 ? `
    <div class="fin-subsection-head">Retention Held (across all IPCs)</div>
    <table class="proc-table">
      <thead><tr><th>IPC No</th><th>Status</th><th class="num">Retention (PKR)</th><th></th></tr></thead>
      <tbody>${retentionRows}</tbody>
    </table>` : '';

  host.innerHTML = summary + rarSection + retentionSection;
}

function openFinancialRarSource(refId) {
  if (typeof openRARDetail === 'function') { openRARDetail(refId); return; }
  toast(`RAR ${refId} viewer unavailable`, 'warn');
}


/* ============================================================
   v1.3.5 — UI EDITORS, ADMIN, SPARKLINE, NEW KPIs (Session 4 PART B)
   ============================================================ */

function _findSourceDoc(refType, refId) {
  if (refType === 'rar') return (state.commercial.rars || []).find(r => r.id === refId);
  if (refType === 'epc') return (state.commercial.epcs || []).find(e => e.id === refId);
  if (refType === 'proc_payment') return ((state.procurement && state.procurement.payments) || []).find(p => p.id === refId);
  return null;
}

function changeClassification(refType, refId, newValue) {
  if (!FIN_CLASSIFICATIONS.includes(newValue)) {
    toast('Invalid classification', 'warn');
    return;
  }
  ensureFinancialState();
  /* Update both source-doc AND register entry — the dual-write commitment */
  const source = _findSourceDoc(refType, refId);
  const before = source ? source.classification : null;
  if (source) source.classification = newValue;
  const reg = state.financial.payments.find(p => p.refType === refType && p.refId === refId);
  if (reg) reg.classification = newValue;
  if (typeof audit === 'function') {
    try { audit('financial.classification.change', refType, refId, before, newValue,
      `${refType} ${refId} classification: ${before || '(none)'} → ${newValue}`); } catch (e) {}
  }
  saveState();
  /* Re-render to reflect change; KPI cards too if dashboard visible */
  renderFinancialPayments();
  if (typeof refreshFinancialBadges === 'function') refreshFinancialBadges();
}

function changeSubCategory(refType, refId, newValue) {
  ensureFinancialState();
  if (!(state.financial.subCategories || []).includes(newValue)) {
    toast('Invalid subCategory', 'warn');
    return;
  }
  const source = _findSourceDoc(refType, refId);
  const before = source ? source.subCategory : null;
  if (source) source.subCategory = newValue;
  const reg = state.financial.payments.find(p => p.refType === refType && p.refId === refId);
  if (reg) reg.subCategory = newValue;
  if (typeof audit === 'function') {
    try { audit('financial.subCategory.change', refType, refId, before, newValue,
      `${refType} ${refId} subCategory: ${before || '(none)'} → ${newValue}`); } catch (e) {}
  }
  saveState();
  renderFinancialPayments();
}

function addSubCategory(name) {
  ensureFinancialState();
  const clean = (name || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!clean) { toast('subCategory name required', 'warn'); return false; }
  if (state.financial.subCategories.includes(clean)) {
    toast(`subCategory "${clean}" already exists`, 'warn');
    return false;
  }
  state.financial.subCategories.push(clean);
  if (typeof audit === 'function') {
    try { audit('financial.subCategory.add', 'subCategory', clean, null, clean,
      `Added subCategory: ${clean}`); } catch (e) {}
  }
  saveState();
  /* Re-render payments tab if visible so new option shows up in dropdowns */
  if (state.financial.ui.activeFinancialTab === 'payments') renderFinancialPayments();
  if (state.financial.ui.activeFinancialTab === 'dashboard') renderFinancialDashboard();
  toast(`subCategory "${clean}" added`, 'success');
  return true;
}

/* ============================================================
   plannedOverheads — { 'YYYY-MM': amount } monthly buckets
   ============================================================ */
function _ensurePlannedOverheads() {
  ensureFinancialState();
  if (!state.financial.plannedOverheads || typeof state.financial.plannedOverheads !== 'object') {
    state.financial.plannedOverheads = {};
  }
}

function setPlannedOverhead(monthKey, amount) {
  _ensurePlannedOverheads();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    toast('Month key must be YYYY-MM format', 'warn');
    return false;
  }
  const n = Number(amount);
  if (!isFinite(n) || n < 0) {
    toast('Amount must be a non-negative number', 'warn');
    return false;
  }
  const before = state.financial.plannedOverheads[monthKey] || 0;
  state.financial.plannedOverheads[monthKey] = n;
  if (typeof audit === 'function') {
    try { audit('financial.plannedOverhead.set', 'planned_overhead', monthKey, before, n,
      `Set planned overhead for ${monthKey}: ${n}`); } catch (e) {}
  }
  saveState();
  if (state.financial.ui.activeFinancialTab === 'dashboard') renderFinancialDashboard();
  return true;
}

function getPlannedOverhead(monthKey) {
  _ensurePlannedOverheads();
  return state.financial.plannedOverheads[monthKey] || 0;
}

function getTotalPlannedOverhead() {
  _ensurePlannedOverheads();
  return Object.values(state.financial.plannedOverheads).reduce((s, v) => s + Number(v || 0), 0);
}

/* ============================================================
   KPI 15 — Overhead Burn Rate (overhead spent in last 30 days)
   KPI 16 — Overhead vs Budget (actual / planned × 100)
   ============================================================ */
function computeOverheadBurnRate(asOfIso) {
  ensureFinancialState();
  const asOf = asOfIso ? new Date(asOfIso) : new Date();
  const startMs = asOf.getTime() - (30 * 24 * 60 * 60 * 1000);
  const startIso = new Date(startMs).toISOString();

  let burnTotal = 0;
  (state.financial.payments || []).forEach(p => {
    if (p.classification !== 'overhead') return;
    if (!p.paidAt) return;
    if (p.paidAt < startIso) return;
    burnTotal += Number(p.amount || 0);
  });
  return burnTotal;
}

function computeOverheadVsBudget(monthKey) {
  ensureFinancialState();
  _ensurePlannedOverheads();
  const planned = state.financial.plannedOverheads[monthKey] || 0;
  if (planned === 0) return { planned: 0, actual: 0, pct: null };
  let actual = 0;
  (state.financial.payments || []).forEach(p => {
    if (p.classification !== 'overhead') return;
    if (!p.paidAt) return;
    if (p.paidAt.slice(0, 7) !== monthKey) return;
    actual += Number(p.amount || 0);
  });
  return { planned, actual, pct: (actual / planned) * 100 };
}

function computeMonthlyOverhead(monthsBack) {
  /* Returns array of { monthKey: 'YYYY-MM', total } newest-first for the
     last N months, including months with zero overhead. Used by sparkline. */
  monthsBack = monthsBack || 6;
  ensureFinancialState();
  /* Build the date list */
  const now = new Date();
  const months = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    months.push({ monthKey: mk, total: 0 });
  }
  /* Index by monthKey for fast lookup */
  const byKey = {};
  months.forEach(m => byKey[m.monthKey] = m);
  (state.financial.payments || []).forEach(p => {
    if (p.classification !== 'overhead') return;
    if (!p.paidAt) return;
    const mk = p.paidAt.slice(0, 7);
    if (byKey[mk]) byKey[mk].total += Number(p.amount || 0);
  });
  /* Return oldest-first for the sparkline */
  return months.reverse();
}

function renderOverheadSparkline(monthsBack) {
  const data = computeMonthlyOverhead(monthsBack || 6);
  const max = data.reduce((m, d) => Math.max(m, d.total), 0);
  if (max === 0) {
    return `<span style="color:var(--ink-3);font-size:10px;font-style:italic;">no overhead in last ${monthsBack || 6} months</span>`;
  }
  const W = 120, H = 28, barW = (W - (data.length - 1) * 2) / data.length;
  const bars = data.map((d, i) => {
    const h = (d.total / max) * H;
    const x = i * (barW + 2);
    const y = H - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--accent-3)" opacity="0.75"><title>${d.monthKey}: PKR ${fmt.short(d.total)}</title></rect>`;
  }).join('');
  return `<svg class="fin-sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;">${bars}</svg>`;
}

/* ============================================================
   v1.3.6 — RECEIPTS BACKFILL (Session 5)
   ============================================================
   Walks state.commercial.ipcs and creates state.financial.receipts
   entries for paid IPCs that predate the v1.3.2 hooks. Idempotent:
   relies on recordFinancialReceipt's existing (refType,refId) dedup.
   ============================================================ */
function backfillReceiptsFromPaidIpcs() {
  ensureFinancialState();
  const ipcs = (state.commercial && state.commercial.ipcs) || [];
  let added = 0, alreadyExisting = 0;
  ipcs.forEach(ipc => {
    if (ipc.status !== 'paid') return;
    if (!ipc.paidAt) return;
    const before = state.financial.receipts.length;
    recordFinancialReceipt({
      refType: 'ipc', refId: ipc.id, refNo: ipc.ipcNo,
      amount: ipc.paidAmount || ipc.receiptAmount || 0,
      paidAt: ipc.paidAt,
    });
    if (state.financial.receipts.length > before) {
      added++;
    } else {
      alreadyExisting++;
    }
  });
  if (typeof audit === 'function' && (added + alreadyExisting) > 0) {
    try { audit('financial.receipt.backfill', 'financial_receipt', null, null,
      { added, alreadyExisting }, `Backfilled ${added} new; ${alreadyExisting} already recorded`); } catch (e) {}
  }
  return { added, alreadyExisting };
}

function manualReScanReceipts() {
  /* Wired to the "Re-scan paid IPCs" button on the Receipts tab */
  const result = backfillReceiptsFromPaidIpcs();
  if (result.added > 0) {
    toast(`Backfilled ${result.added} new receipts (${result.alreadyExisting} already recorded)`, 'success');
  } else if (result.alreadyExisting > 0) {
    toast(`All ${result.alreadyExisting} paid IPCs already recorded`, 'info');
  } else {
    toast('No paid IPCs found to backfill', 'info');
  }
  renderFinancialReceipts();
}

/* ============================================================
   v1.3.6 — CASH FLOW TAB (Session 5)
   ============================================================ */
function computeCashFlowByMonth() {
  /* Bucket receipts and payments by paidAt month-year, return array
     sorted CHRONOLOGICALLY (oldest first) for left-to-right chart reading.
     Each bucket: { monthKey, receipts, payments, net, cumulative } */
  ensureFinancialState();
  const buckets = {};
  (state.financial.receipts || []).forEach(r => {
    const mk = (r.paidAt || '').slice(0, 7);
    if (!mk) return;
    if (!buckets[mk]) buckets[mk] = { monthKey: mk, receipts: 0, payments: 0, net: 0, cumulative: 0 };
    buckets[mk].receipts += Number(r.amount || 0);
  });
  (state.financial.payments || []).forEach(p => {
    const mk = (p.paidAt || '').slice(0, 7);
    if (!mk) return;
    if (!buckets[mk]) buckets[mk] = { monthKey: mk, receipts: 0, payments: 0, net: 0, cumulative: 0 };
    buckets[mk].payments += Number(p.amount || 0);
  });
  const sorted = Object.values(buckets).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  let running = 0;
  sorted.forEach(b => {
    b.net = b.receipts - b.payments;
    running += b.net;
    b.cumulative = running;
  });
  return sorted;
}

function renderCashFlowChart(buckets) {
  if (!buckets || buckets.length === 0) {
    return `<div style="padding:10px; color:var(--ink-3); font-style:italic; font-size:11px;">No cash flow data yet.</div>`;
  }
  /* SVG layout:
     - Width: 60px per month + 40 left padding for axis labels
     - Height: 180 total, chart area 140 (top 20 for cumulative label, bottom 20 for x-axis)
     - Two side-by-side bars per month (receipts green, payments red), with cumulative as a polyline overlay */
  const monthW = 60;
  const padL = 50, padR = 20, padT = 20, padB = 30;
  const chartH = 140;
  const W = padL + buckets.length * monthW + padR;
  const H = padT + chartH + padB;

  const maxBar = buckets.reduce((m, b) => Math.max(m, b.receipts, b.payments), 0) || 1;
  const cumMin = Math.min(0, ...buckets.map(b => b.cumulative));
  const cumMax = Math.max(0, ...buckets.map(b => b.cumulative));
  const cumRange = (cumMax - cumMin) || 1;
  const cumY = v => padT + chartH - ((v - cumMin) / cumRange) * chartH;
  const barH = v => (v / maxBar) * chartH;

  const barW = (monthW - 8) / 2;
  const bars = buckets.map((b, i) => {
    const cx = padL + i * monthW + monthW / 2;
    const recX = cx - barW - 2;
    const payX = cx + 2;
    const recY = padT + chartH - barH(b.receipts);
    const payY = padT + chartH - barH(b.payments);
    return `
      <rect x="${recX.toFixed(1)}" y="${recY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH(b.receipts).toFixed(1)}" fill="var(--success, #2d5f3f)" opacity="0.8"><title>${b.monthKey} Receipts: ${fmt.money(b.receipts)}</title></rect>
      <rect x="${payX.toFixed(1)}" y="${payY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH(b.payments).toFixed(1)}" fill="var(--danger, #aa2222)" opacity="0.8"><title>${b.monthKey} Payments: ${fmt.money(b.payments)}</title></rect>
      <text x="${cx.toFixed(1)}" y="${(padT + chartH + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--ink-3)">${b.monthKey}</text>`;
  }).join('');

  const linePts = buckets.map((b, i) => {
    const cx = padL + i * monthW + monthW / 2;
    return `${cx.toFixed(1)},${cumY(b.cumulative).toFixed(1)}`;
  }).join(' ');
  const line = `<polyline points="${linePts}" fill="none" stroke="var(--accent-3, #1e3a5f)" stroke-width="1.5" />`;
  const cumDots = buckets.map((b, i) => {
    const cx = padL + i * monthW + monthW / 2;
    return `<circle cx="${cx.toFixed(1)}" cy="${cumY(b.cumulative).toFixed(1)}" r="2.5" fill="var(--accent-3, #1e3a5f)"><title>Cumulative: ${fmt.money(b.cumulative)}</title></circle>`;
  }).join('');

  /* Y-axis zero line (relative to cumulative) */
  const zeroY = cumY(0);
  const zeroLine = `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="var(--ink-3)" stroke-dasharray="2,2" opacity="0.4" />`;

  /* Legend */
  const legend = `
    <g transform="translate(${padL}, ${(padT - 12).toFixed(1)})">
      <rect width="10" height="10" fill="var(--success, #2d5f3f)" opacity="0.8" />
      <text x="14" y="9" font-size="10" fill="var(--ink-2)">Receipts</text>
      <rect x="70" width="10" height="10" fill="var(--danger, #aa2222)" opacity="0.8" />
      <text x="84" y="9" font-size="10" fill="var(--ink-2)">Payments</text>
      <line x1="155" y1="5" x2="170" y2="5" stroke="var(--accent-3, #1e3a5f)" stroke-width="1.5" />
      <circle cx="162.5" cy="5" r="2.5" fill="var(--accent-3, #1e3a5f)" />
      <text x="175" y="9" font-size="10" fill="var(--ink-2)">Cumulative</text>
    </g>`;

  return `<svg class="fin-cashflow-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;">${zeroLine}${bars}${line}${cumDots}${legend}</svg>`;
}

function renderFinancialCashFlow() {
  ensureFinancialState();
  const host = document.getElementById('finCashFlowHost');
  if (!host) return;
  const buckets = computeCashFlowByMonth();

  if (buckets.length === 0) {
    host.innerHTML = `<div class="proc-empty"><div class="proc-empty-icon">💸</div>
      No cash flow data yet. Pay an IPC or RAR/EPC to populate.</div>`;
    return;
  }

  const totalRec = buckets.reduce((s, b) => s + b.receipts, 0);
  const totalPay = buckets.reduce((s, b) => s + b.payments, 0);
  const finalCum = buckets[buckets.length - 1].cumulative;

  /* Summary cards */
  const summary = `
    <div class="fin-summary-row">
      <div class="fin-summary-card">
        <div class="fin-summary-label">Total Receipts</div>
        <div class="fin-summary-value">${fmt.money(totalRec)}</div>
      </div>
      <div class="fin-summary-card">
        <div class="fin-summary-label">Total Payments</div>
        <div class="fin-summary-value">${fmt.money(totalPay)}</div>
      </div>
      <div class="fin-summary-card ${finalCum < 0 ? 'fin-card-warn' : ''}">
        <div class="fin-summary-label">Net Cash Position</div>
        <div class="fin-summary-value">${fmt.money(finalCum)}</div>
      </div>
    </div>`;

  /* Chart */
  const chartSection = `
    <div class="fin-subsection-head">Receipts / Payments by Month (with cumulative)</div>
    <div style="overflow-x:auto; padding:8px 0;">${renderCashFlowChart(buckets)}</div>`;

  /* Table (newest first for reading; chart goes oldest-first for left→right time) */
  const rowsHtml = [...buckets].reverse().map(b => `
    <tr>
      <td>${b.monthKey}</td>
      <td class="num">${fmt.money(b.receipts)}</td>
      <td class="num">${fmt.money(b.payments)}</td>
      <td class="num" style="color:${b.net >= 0 ? 'var(--success)' : 'var(--danger)'};"><strong>${fmt.money(b.net)}</strong></td>
      <td class="num">${fmt.money(b.cumulative)}</td>
    </tr>`).join('');

  host.innerHTML = summary + chartSection + `
    <div class="fin-subsection-head">Monthly Detail (newest first)</div>
    <table class="proc-table">
      <thead><tr>
        <th>Month</th><th class="num">Receipts</th><th class="num">Payments</th>
        <th class="num">Net</th><th class="num">Cumulative</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>` + _renderForecastSection();
}

function _renderForecastSection() {
  /* v1.3.7 — Forecast section appended below actuals.
     Window N held in state.financial.ui.forecastWindow (default 6). */
  ensureFinancialState();
  const n = state.financial.ui.forecastWindow || 6;
  const forecast = computeFinancialCashFlowForecast(n);
  if (forecast.length === 0) return '';

  const totalFcReceipts = forecast.reduce((s, b) => s + b.receipts, 0);
  const totalFcPayments = forecast.reduce((s, b) => s + b.payments, 0);
  const finalFcCum = forecast[forecast.length - 1].cumulative;

  const toggle = `
    <div style="margin:8px 0;">
      <span style="font-size:11px; color:var(--ink-3);">Window:</span>
      <button class="btn btn-sm ${n === 3 ? 'btn-primary' : ''}" onclick="setForecastWindow(3)">3 mo</button>
      <button class="btn btn-sm ${n === 6 ? 'btn-primary' : ''}" onclick="setForecastWindow(6)">6 mo</button>
      <button class="btn btn-sm ${n === 12 ? 'btn-primary' : ''}" onclick="setForecastWindow(12)">12 mo</button>
    </div>`;

  const fcRows = forecast.map(b => `<tr>
    <td>${b.monthKey} ${b._isPlannedOverhead ? '<span style="color:var(--accent-3);font-size:10px;" title="Planned overhead used">📌</span>' : ''}</td>
    <td class="num">${fmt.money(b.receipts)}</td>
    <td class="num">${fmt.money(b.payments)}</td>
    <td class="num" style="color:${b.net >= 0 ? 'var(--success)' : 'var(--danger)'};">${fmt.money(b.net)}</td>
    <td class="num">${fmt.money(b.cumulative)}</td>
  </tr>`).join('');

  return `
    <div style="margin-top:24px; padding-top:16px; border-top:2px dashed var(--accent-3);">
      <div class="fin-subsection-head" style="color:var(--accent-3);">📊 Forecast — Next ${n} Months</div>
      <div class="fin-note">
        Projections use the trailing-3-month average for receipts and payments, with planned overheads substituted where set.
        Dashed bars and lighter colors indicate projection (not actuals).
      </div>
      ${toggle}
      <div style="overflow-x:auto; padding:8px 0;">${renderCashFlowForecastChart(forecast)}</div>
      <div class="fin-summary-row" style="margin-top:8px;">
        <div class="fin-summary-card"><div class="fin-summary-label">Projected Receipts (${n}mo)</div><div class="fin-summary-value">${fmt.money(totalFcReceipts)}</div></div>
        <div class="fin-summary-card"><div class="fin-summary-label">Projected Payments (${n}mo)</div><div class="fin-summary-value">${fmt.money(totalFcPayments)}</div></div>
        <div class="fin-summary-card ${finalFcCum < 0 ? 'fin-card-warn' : ''}"><div class="fin-summary-label">Projected End Cash</div><div class="fin-summary-value">${fmt.money(finalFcCum)}</div></div>
      </div>
      <table class="proc-table" style="margin-top:8px;">
        <thead><tr>
          <th>Month</th><th class="num">Receipts</th><th class="num">Payments</th>
          <th class="num">Net</th><th class="num">Cumulative</th>
        </tr></thead>
        <tbody>${fcRows}</tbody>
      </table>
    </div>`;
}

/* ============================================================
   v1.3.6 — PLANNED VS ACTUAL TAB (Session 5)
   ============================================================ */
function computePlannedVsActualAllMonths() {
  /* For any month that has either planned or actual > 0, return:
     { monthKey, planned, actual, variance, variancePct (null if planned=0) }
     Sorted newest-first. */
  ensureFinancialState();
  _ensurePlannedOverheads();
  const buckets = {};
  /* Pull all months with planned */
  Object.keys(state.financial.plannedOverheads || {}).forEach(mk => {
    if (!buckets[mk]) buckets[mk] = { monthKey: mk, planned: 0, actual: 0, variance: 0, variancePct: null };
    buckets[mk].planned = Number(state.financial.plannedOverheads[mk] || 0);
  });
  /* Pull all months with actual overhead */
  (state.financial.payments || []).forEach(p => {
    if (p.classification !== 'overhead') return;
    if (!p.paidAt) return;
    const mk = p.paidAt.slice(0, 7);
    if (!buckets[mk]) buckets[mk] = { monthKey: mk, planned: 0, actual: 0, variance: 0, variancePct: null };
    buckets[mk].actual += Number(p.amount || 0);
  });
  /* Compute variance + pct */
  const out = Object.values(buckets).filter(b => b.planned > 0 || b.actual > 0);
  out.forEach(b => {
    b.variance = b.actual - b.planned;
    b.variancePct = b.planned > 0 ? (b.variance / b.planned) * 100 : null;
  });
  return out.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

function renderPlannedVsActual() {
  ensureFinancialState();
  _ensurePlannedOverheads();
  const host = document.getElementById('finPlannedVsActualHost');
  if (!host) return;

  const buckets = computePlannedVsActualAllMonths();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentBucket = buckets.find(b => b.monthKey === currentMonth) || {
    monthKey: currentMonth, planned: state.financial.plannedOverheads[currentMonth] || 0,
    actual: 0, variance: 0, variancePct: null
  };

  /* Empty-state */
  if (buckets.length === 0 && currentBucket.planned === 0) {
    host.innerHTML = `<div class="proc-empty"><div class="proc-empty-icon">📊</div>
      No planned overheads or overhead-classified payments yet.
      Set a planned overhead via Dashboard → Admin Panel.</div>`;
    return;
  }

  /* Current-month cards */
  const varClass = currentBucket.variance > 0 ? 'fin-card-warn'
                 : (currentBucket.variance < 0 ? 'fin-card-ok' : '');
  const pctLabel = currentBucket.variancePct === null
    ? '(no plan)'
    : (currentBucket.variancePct >= 0 ? '+' : '') + fmt.pct(currentBucket.variancePct, 1);

  const summary = `
    <div class="fin-subsection-head">Current Month — ${currentMonth}</div>
    <div class="fin-summary-row">
      <div class="fin-summary-card">
        <div class="fin-summary-label">Planned Overhead</div>
        <div class="fin-summary-value">${fmt.money(currentBucket.planned)}</div>
      </div>
      <div class="fin-summary-card">
        <div class="fin-summary-label">Actual Overhead</div>
        <div class="fin-summary-value">${fmt.money(currentBucket.actual)}</div>
      </div>
      <div class="fin-summary-card ${varClass}">
        <div class="fin-summary-label">Variance</div>
        <div class="fin-summary-value">${fmt.money(currentBucket.variance)} <span style="font-size:11px;font-weight:400;color:var(--ink-3);">${pctLabel}</span></div>
      </div>
    </div>`;

  /* Historical table */
  const rowsHtml = buckets.map(b => {
    const vColor = b.variance > 0 ? 'var(--danger)' : (b.variance < 0 ? 'var(--success)' : 'var(--ink-3)');
    const vpct = b.variancePct === null ? '—'
                : ((b.variancePct >= 0 ? '+' : '') + fmt.pct(b.variancePct, 1));
    return `<tr>
      <td>${b.monthKey}</td>
      <td class="num">${fmt.money(b.planned)}</td>
      <td class="num">${fmt.money(b.actual)}</td>
      <td class="num" style="color:${vColor};"><strong>${fmt.money(b.variance)}</strong></td>
      <td class="num" style="color:${vColor};">${vpct}</td>
    </tr>`;
  }).join('');

  const tableSection = buckets.length === 0 ? '' : `
    <div class="fin-subsection-head">Historical Variance (newest first)</div>
    <table class="proc-table">
      <thead><tr>
        <th>Month</th><th class="num">Planned</th><th class="num">Actual</th>
        <th class="num">Variance</th><th class="num">Variance %</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  host.innerHTML = summary + tableSection;
}

/* ============================================================
   v1.3.7 — P&L TAB (Session 6, Phase B closeout)
   ============================================================
   Standard construction P&L statement:
   Revenue → Slippage → Net Revenue → Direct Cost → Gross Profit
   → Overhead → Net Profit. Numbers reconcile to dashboard KPIs.
   ============================================================ */
function computePLForPeriod(dateRange) {
  /* Returns a P&L statement object computed from computeAllKpis(dateRange).
     Numbers are guaranteed to reconcile because we reuse the same compute. */
  const k = computeAllKpis(dateRange);
  const revenue = k.grossRevenue;
  const slippage = k.slippage;
  const netRevenue = k.vettedRevenue;     /* gross - slippage = vetted */
  const directCost = k.directCost;
  const grossProfit = netRevenue - directCost;
  const overheadCost = k.overheadCost;
  const netProfit = grossProfit - overheadCost;
  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
  return {
    revenue, slippage, netRevenue,
    directCost, grossProfit,
    overheadCost, netProfit,
    grossMarginPct, netMarginPct,
  };
}

function computePLByMonth() {
  /* For each month that has any P&L activity (revenue or expenditure), return
     a row with all the P&L lines. Sorted chronologically oldest-first.
     Uses the register-mirror data for both inflow and outflow. */
  ensureFinancialState();
  const months = {};
  /* Receipts → revenue (using register-mirror data, post-backfill) */
  (state.financial.receipts || []).forEach(r => {
    if (!r.paidAt) return;
    const mk = r.paidAt.slice(0, 7);
    if (!months[mk]) months[mk] = { monthKey: mk, revenue: 0, directCost: 0, overheadCost: 0 };
    months[mk].revenue += Number(r.amount || 0);
  });
  /* Payments → direct or overhead based on classification */
  (state.financial.payments || []).forEach(p => {
    if (!p.paidAt) return;
    const mk = p.paidAt.slice(0, 7);
    if (!months[mk]) months[mk] = { monthKey: mk, revenue: 0, directCost: 0, overheadCost: 0 };
    if (p.classification === 'overhead') {
      months[mk].overheadCost += Number(p.amount || 0);
    } else {
      months[mk].directCost += Number(p.amount || 0);
    }
  });
  /* Compute derived lines */
  return Object.values(months)
    .map(m => {
      m.grossProfit = m.revenue - m.directCost;
      m.netProfit = m.grossProfit - m.overheadCost;
      return m;
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function renderFinancialPL() {
  ensureFinancialState();
  const host = document.getElementById('finPLHost');
  if (!host) return;

  /* PTD statement */
  const ptd = computePLForPeriod(null);
  /* Period comparison: This Month / Last Month / YTD */
  const now = new Date();
  const thisMonthStart = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
  const thisMonthEnd = now.toISOString().slice(0, 10);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0') + '-01';
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
  const ytdStart = now.getFullYear() + '-01-01';

  const thisMonth = computePLForPeriod([thisMonthStart, thisMonthEnd]);
  const lastMonth = computePLForPeriod([lastMonthStart, lastMonthEnd]);
  const ytd = computePLForPeriod([ytdStart, thisMonthEnd]);

  /* Empty-state */
  if (ptd.revenue === 0 && ptd.directCost === 0 && ptd.overheadCost === 0) {
    host.innerHTML = `<div class="proc-empty"><div class="proc-empty-icon">📈</div>
      No P&amp;L data yet. Once IPCs are received and payments made, P&amp;L will populate here.
    </div>`;
    return;
  }

  /* SECTION 1 — Statement (cards-on-top) */
  const summary = `
    <div class="fin-summary-row">
      <div class="fin-summary-card">
        <div class="fin-summary-label">Net Revenue (PTD)</div>
        <div class="fin-summary-value">${fmt.money(ptd.netRevenue)}</div>
      </div>
      <div class="fin-summary-card ${ptd.grossProfit < 0 ? 'fin-card-warn' : ''}">
        <div class="fin-summary-label">Gross Profit (PTD)</div>
        <div class="fin-summary-value">${fmt.money(ptd.grossProfit)} <span style="font-size:11px;font-weight:400;color:var(--ink-3);">${fmt.pct(ptd.grossMarginPct, 1)}</span></div>
      </div>
      <div class="fin-summary-card ${ptd.netProfit < 0 ? 'fin-card-warn' : ''}">
        <div class="fin-summary-label">Net Profit (PTD)</div>
        <div class="fin-summary-value">${fmt.money(ptd.netProfit)} <span style="font-size:11px;font-weight:400;color:var(--ink-3);">${fmt.pct(ptd.netMarginPct, 1)}</span></div>
      </div>
    </div>`;

  const statementSection = `
    <div class="fin-subsection-head">P&amp;L Statement (Project to Date)</div>
    <table class="proc-table fin-pl-statement">
      <tbody>
        <tr><td>Revenue (Gross IPC)</td><td class="num">${fmt.money(ptd.revenue)}</td></tr>
        <tr><td style="padding-left:20px;color:var(--ink-3);">Less: Slippage</td><td class="num" style="color:var(--danger);">(${fmt.money(ptd.slippage)})</td></tr>
        <tr style="border-top:1px solid var(--line);"><td><strong>Net Revenue</strong></td><td class="num"><strong>${fmt.money(ptd.netRevenue)}</strong></td></tr>
        <tr><td style="padding-left:20px;color:var(--ink-3);">Less: Direct Cost</td><td class="num" style="color:var(--danger);">(${fmt.money(ptd.directCost)})</td></tr>
        <tr style="border-top:1px solid var(--line);"><td><strong>Gross Profit</strong> <span style="color:var(--ink-3);font-size:11px;">${fmt.pct(ptd.grossMarginPct, 1)}</span></td><td class="num"><strong>${fmt.money(ptd.grossProfit)}</strong></td></tr>
        <tr><td style="padding-left:20px;color:var(--ink-3);">Less: Overhead Cost</td><td class="num" style="color:var(--danger);">(${fmt.money(ptd.overheadCost)})</td></tr>
        <tr style="border-top:2px solid var(--accent-3); background:rgba(30, 58, 95, 0.05);"><td><strong>Net Profit</strong> <span style="color:var(--ink-3);font-size:11px;">${fmt.pct(ptd.netMarginPct, 1)}</span></td><td class="num"><strong>${fmt.money(ptd.netProfit)}</strong></td></tr>
      </tbody>
    </table>`;

  /* SECTION 2 — Monthly breakdown */
  const byMonth = computePLByMonth();
  const monthlyHtml = byMonth.length === 0 ? '' : `
    <div class="fin-subsection-head">Monthly Breakdown</div>
    <table class="proc-table">
      <thead><tr>
        <th>Month</th><th class="num">Revenue</th><th class="num">Direct Cost</th>
        <th class="num">Gross Profit</th><th class="num">Overhead</th><th class="num">Net Profit</th>
      </tr></thead>
      <tbody>${byMonth.map(m => `<tr>
        <td>${m.monthKey}</td>
        <td class="num">${fmt.money(m.revenue)}</td>
        <td class="num">${fmt.money(m.directCost)}</td>
        <td class="num" style="color:${m.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${fmt.money(m.grossProfit)}</td>
        <td class="num">${fmt.money(m.overheadCost)}</td>
        <td class="num" style="color:${m.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};"><strong>${fmt.money(m.netProfit)}</strong></td>
      </tr>`).join('')}</tbody>
    </table>`;

  /* SECTION 3 — Period comparison cards */
  const cmpCard = (label, p) => `
    <div class="fin-summary-card" style="text-align:left;">
      <div class="fin-summary-label">${label}</div>
      <table style="width:100%;margin-top:6px;font-size:11px;">
        <tr><td style="padding:1px 0;">Revenue</td><td class="num">${fmt.short(p.revenue)}</td></tr>
        <tr><td style="padding:1px 0;color:var(--ink-3);">− Direct</td><td class="num">${fmt.short(p.directCost)}</td></tr>
        <tr><td style="padding:1px 0;color:var(--ink-3);">− Overhead</td><td class="num">${fmt.short(p.overheadCost)}</td></tr>
        <tr style="border-top:1px solid var(--line);"><td style="padding:2px 0;"><strong>Net Profit</strong></td><td class="num" style="color:${p.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'};"><strong>${fmt.short(p.netProfit)}</strong></td></tr>
        <tr><td style="padding:1px 0;color:var(--ink-3);font-size:10px;">margin</td><td class="num" style="font-size:10px;">${fmt.pct(p.netMarginPct, 1)}</td></tr>
      </table>
    </div>`;
  const cmpSection = `
    <div class="fin-subsection-head">Period Comparison</div>
    <div class="fin-summary-row">
      ${cmpCard('This Month', thisMonth)}
      ${cmpCard('Last Month', lastMonth)}
      ${cmpCard('Year-to-Date', ytd)}
    </div>`;

  host.innerHTML = summary + statementSection + monthlyHtml + cmpSection;
}

/* ============================================================
   v1.3.7 — CASH FLOW FORECAST (Session 6)
   ============================================================
   NOTE: function name is computeFinancialCashFlowForecast (not
   computeCashFlowForecast) because the latter already exists in
   the codebase (line ~16926) for the Executive/Commercial
   dashboards. Discovered via grep AFTER initial naming caused
   a crash via JS function hoisting. Lesson recorded.
   ============================================================ */
function computeFinancialCashFlowForecast(n) {
  /* Returns N future month buckets with same shape as actuals.
     Method: trailing-3-month average of receipts and payments, with
     plannedOverheads substituted where set. Cumulative continues from
     final actual cumulative. */
  n = Math.max(1, Math.min(60, parseInt(n, 10) || 6));
  ensureFinancialState();
  _ensurePlannedOverheads();
  const actuals = computeCashFlowByMonth();

  /* Trailing-3 average from actuals (or zero if no history) */
  const last3 = actuals.slice(-3);
  const avgReceipts = last3.length > 0 ? last3.reduce((s, b) => s + b.receipts, 0) / last3.length : 0;
  const avgPayments = last3.length > 0 ? last3.reduce((s, b) => s + b.payments, 0) / last3.length : 0;
  /* Trailing-3 average overhead — used when planned overhead substitutes */
  const last3Overheads = last3.map(b => {
    /* For each actual month, compute its overhead portion from register payments */
    let overhead = 0;
    (state.financial.payments || []).forEach(p => {
      if (!p.paidAt) return;
      if (p.classification !== 'overhead') return;
      if (p.paidAt.slice(0, 7) !== b.monthKey) return;
      overhead += Number(p.amount || 0);
    });
    return overhead;
  });
  const avgOverhead = last3Overheads.length > 0
    ? last3Overheads.reduce((s, v) => s + v, 0) / last3Overheads.length : 0;
  const avgNonOverhead = Math.max(0, avgPayments - avgOverhead);

  /* Start cumulative where actuals end */
  let cumulative = actuals.length > 0 ? actuals[actuals.length - 1].cumulative : 0;

  /* Build N future month-keys */
  const now = new Date();
  const result = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    /* Use planned overhead if set, else use trailing avg overhead */
    const plannedOH = state.financial.plannedOverheads[mk];
    const overheadPortion = (typeof plannedOH === 'number') ? plannedOH : avgOverhead;
    const payments = overheadPortion + avgNonOverhead;
    const net = avgReceipts - payments;
    cumulative += net;
    result.push({
      monthKey: mk,
      receipts: avgReceipts,
      payments,
      net,
      cumulative,
      _isPlannedOverhead: (typeof plannedOH === 'number'),
    });
  }
  return result;
}

function renderCashFlowForecastChart(buckets) {
  if (!buckets || buckets.length === 0) {
    return `<div style="padding:10px; color:var(--ink-3); font-style:italic; font-size:11px;">No forecast data.</div>`;
  }
  /* Same SVG structure as renderCashFlowChart, but bars are dashed & lighter,
     cumulative line is dotted, to clearly indicate "this is projection". */
  const monthW = 60;
  const padL = 50, padR = 20, padT = 20, padB = 30;
  const chartH = 140;
  const W = padL + buckets.length * monthW + padR;
  const H = padT + chartH + padB;

  const maxBar = buckets.reduce((m, b) => Math.max(m, b.receipts, b.payments), 0) || 1;
  const cumMin = Math.min(0, ...buckets.map(b => b.cumulative));
  const cumMax = Math.max(0, ...buckets.map(b => b.cumulative));
  const cumRange = (cumMax - cumMin) || 1;
  const cumY = v => padT + chartH - ((v - cumMin) / cumRange) * chartH;
  const barH = v => (v / maxBar) * chartH;

  const barW = (monthW - 8) / 2;
  const bars = buckets.map((b, i) => {
    const cx = padL + i * monthW + monthW / 2;
    const recX = cx - barW - 2;
    const payX = cx + 2;
    const recY = padT + chartH - barH(b.receipts);
    const payY = padT + chartH - barH(b.payments);
    /* Dashed pattern + lower opacity to distinguish projection */
    const plannedTag = b._isPlannedOverhead ? ' · uses planned overhead' : '';
    return `
      <rect x="${recX.toFixed(1)}" y="${recY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH(b.receipts).toFixed(1)}" fill="var(--success, #2d5f3f)" opacity="0.35" stroke="var(--success, #2d5f3f)" stroke-dasharray="3,2"><title>${b.monthKey} Projected Receipts: ${fmt.money(b.receipts)}</title></rect>
      <rect x="${payX.toFixed(1)}" y="${payY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH(b.payments).toFixed(1)}" fill="var(--danger, #aa2222)" opacity="0.35" stroke="var(--danger, #aa2222)" stroke-dasharray="3,2"><title>${b.monthKey} Projected Payments: ${fmt.money(b.payments)}${plannedTag}</title></rect>
      <text x="${cx.toFixed(1)}" y="${(padT + chartH + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--ink-3)">${b.monthKey}</text>`;
  }).join('');

  const linePts = buckets.map((b, i) => {
    const cx = padL + i * monthW + monthW / 2;
    return `${cx.toFixed(1)},${cumY(b.cumulative).toFixed(1)}`;
  }).join(' ');
  const line = `<polyline points="${linePts}" fill="none" stroke="var(--accent-3, #1e3a5f)" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7" />`;

  return `<svg class="fin-cashflow-forecast" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;">${bars}${line}</svg>`;
}

function setForecastWindow(n) {
  ensureFinancialState();
  const v = parseInt(n, 10);
  if (!isFinite(v) || v <= 0 || v > 60) {
    toast('Forecast window must be between 1 and 60 months', 'warn');
    return false;
  }
  state.financial.ui.forecastWindow = v;
  saveState();
  if (state.financial.ui.activeFinancialTab === 'cashflow') renderFinancialCashFlow();
  return true;
}

/* End §F (Session 6 P&L + Forecast) */
/* End §F */

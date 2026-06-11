import type {
  FinancialReceipt, FinancialPayment, FinancialLiability, Project,
} from '../data/types';
import { TIMELINE, CURRENT_IDX } from './scurve';
import { toNum, formatMoney } from './money';

export interface CashFlowMonth {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
  cumNet: number;
  forecast: boolean;
}

/** Monthly inflow/outflow/net with running cumulative, over the demo timeline. */
export function monthlyCashFlow(
  receipts: FinancialReceipt[],
  payments: FinancialPayment[],
): CashFlowMonth[] {
  let cum = 0;
  return TIMELINE.map((month, i) => {
    const inflow = receipts.filter((r) => r.month === month).reduce((a, r) => a + r.amount, 0);
    const outflow = payments.filter((p) => p.month === month).reduce((a, p) => a + p.amount, 0);
    const net = inflow - outflow;
    cum += net;
    return { month, inflow, outflow, net, cumNet: cum, forecast: i > CURRENT_IDX };
  });
}

/**
 * Forecast the next N months of net cash from the trailing-3-month average of
 * actual net (the prototype's method). Returns the actual months up to "now"
 * plus N forecast months.
 */
export function forecastCashFlow(history: CashFlowMonth[], n: 3 | 6 | 12): CashFlowMonth[] {
  const actual = history.filter((m) => !m.forecast);
  const last3 = actual.slice(-3);
  const avgNet = last3.length ? last3.reduce((a, m) => a + m.net, 0) / last3.length : 0;
  let cum = actual.length ? actual[actual.length - 1].cumNet : 0;
  const out: CashFlowMonth[] = [...actual];
  for (let k = 1; k <= n; k++) {
    cum += avgNet;
    out.push({ month: `F+${k}`, inflow: 0, outflow: 0, net: avgNet, cumNet: cum, forecast: true });
  }
  return out;
}

export interface Kpi {
  label: string;
  value: string;
}

export interface FinancialKpiInputs {
  project: Project;
  receipts: FinancialReceipt[];
  payments: FinancialPayment[];
  liabilities: FinancialLiability[];
}

const cr = (n: number) => formatMoney(n);
const pct = (n: number) => `${n.toLocaleString('en-PK', { maximumFractionDigits: 1 })}%`;

/** A panel of financial KPIs derived from the registers + project salients. */
export function financialKpis({ project, receipts, payments, liabilities }: FinancialKpiInputs): Kpi[] {
  const contract = toNum(project.contractValue);
  const billed = toNum(project.billedToDate);
  const received = receipts.reduce((a, r) => a + r.amount, 0) || toNum(project.receivedToDate);
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const liab = liabilities.reduce((a, l) => a + l.amount, 0);
  const outstandingBilling = Math.max(0, billed - received);
  const cashPosition = received - paid;
  const grossProfit = billed - paid;
  const margin = billed ? (grossProfit / billed) * 100 : 0;
  const completionBilled = contract ? (billed / contract) * 100 : 0;
  const recoveryRate = billed ? (received / billed) * 100 : 0;
  const cat = (c: string) => payments.filter((p) => p.category === c).reduce((a, p) => a + p.amount, 0);
  const monthsActive = new Set(payments.map((p) => p.month)).size || 1;
  const burnRate = paid / monthsActive;
  const monthsCash = burnRate > 0 ? cashPosition / burnRate : 0;

  return [
    { label: 'Contract value', value: cr(contract) },
    { label: 'Billed to date', value: cr(billed) },
    { label: 'Received', value: cr(received) },
    { label: 'Outstanding billing', value: cr(outstandingBilling) },
    { label: 'Payments to date', value: cr(paid) },
    { label: 'Net cash position', value: cr(cashPosition) },
    { label: 'Gross profit', value: cr(grossProfit) },
    { label: 'Gross margin', value: pct(margin) },
    { label: 'Billed completion', value: pct(completionBilled) },
    { label: 'Recovery rate', value: pct(recoveryRate) },
    { label: 'Liabilities', value: cr(liab) },
    { label: 'Materials cost', value: cr(cat('materials')) },
    { label: 'Subcontract cost', value: cr(cat('subcontract')) },
    { label: 'Overheads', value: cr(cat('overhead')) },
    { label: 'Avg monthly burn', value: cr(burnRate) },
    { label: 'Months cash on hand', value: monthsCash.toLocaleString('en-PK', { maximumFractionDigits: 1 }) },
  ];
}

export interface Pnl {
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
}

export function pnlSummary(project: Project, payments: FinancialPayment[]): Pnl {
  const revenue = toNum(project.billedToDate);
  const cost = payments.reduce((a, p) => a + p.amount, 0);
  const grossProfit = revenue - cost;
  return { revenue, cost, grossProfit, marginPct: revenue ? (grossProfit / revenue) * 100 : 0 };
}

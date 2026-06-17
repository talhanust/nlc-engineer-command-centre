import { describe, it, expect } from 'vitest';
import { LocalDataProvider } from '../data/LocalDataProvider';
import { monthlyCashFlow, forecastCashFlow, financialKpis, pnlSummary } from './finance';

const provider = new LocalDataProvider();

describe('cash flow', () => {
  it('sums monthly inflow/outflow and accumulates net', async () => {
    const receipts = await provider.listReceipts('proj-f14f15');
    const payments = await provider.listPayments('proj-f14f15');
    const cf = monthlyCashFlow(receipts, payments);
    const nov = cf.find((m) => m.month === 'Nov-25')!;
    expect(nov.inflow).toBe(1900000000);
    expect(nov.outflow).toBe(900000000);
    expect(nov.net).toBe(1000000000);
    // final cumulative net = total receipts − total payments
    const totIn = receipts.reduce((a, r) => a + r.amount, 0);
    const totOut = payments.reduce((a, p) => a + p.amount, 0);
    expect(cf[cf.length - 1].cumNet).toBe(totIn - totOut);
  });

  it('forecasts N months from the trailing-3 average', async () => {
    const receipts = await provider.listReceipts('proj-f14f15');
    const payments = await provider.listPayments('proj-f14f15');
    const history = monthlyCashFlow(receipts, payments);
    const actualCount = history.filter((m) => !m.forecast).length;
    const f3 = forecastCashFlow(history, 3);
    expect(f3).toHaveLength(actualCount + 3);
    expect(f3.slice(-3).every((m) => m.forecast)).toBe(true);
    expect(forecastCashFlow(history, 12)).toHaveLength(actualCount + 12);
  });
});

describe('financial KPIs', () => {
  it('computes a panel including net cash position and margin', async () => {
    const project = (await provider.listProjects()).find((p) => p.id === 'proj-f14f15')!;
    const receipts = await provider.listReceipts('proj-f14f15');
    const payments = await provider.listPayments('proj-f14f15');
    const liabilities = await provider.listLiabilities('proj-f14f15');
    const kpis = financialKpis({ project, receipts, payments, liabilities });
    expect(kpis.length).toBeGreaterThanOrEqual(12);
    const labels = kpis.map((k) => k.label);
    expect(labels).toContain('Net cash position');
    expect(labels).toContain('Gross margin');
    expect(labels).toContain('Months cash on hand');
  });
});

describe('P&L', () => {
  it('revenue − cost = gross profit', async () => {
    const project = (await provider.listProjects()).find((p) => p.id === 'proj-f14f15')!;
    const payments = await provider.listPayments('proj-f14f15');
    const pnl = pnlSummary(project, payments);
    expect(pnl.grossProfit).toBeCloseTo(pnl.revenue - pnl.cost, 0);
    expect(pnl.marginPct).toBeGreaterThan(0);
  });
});

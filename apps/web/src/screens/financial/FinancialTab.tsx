import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useUiState } from '../../state/UiState';
import { formatMoney, formatPct, toNum } from '../../domain/money';
import type { MonthlySeriesPoint } from '../../data/types';
import {
  monthlyCashFlow, forecastCashFlow, financialKpis, pnlSummary,
} from '../../domain/finance';
import { KpiCard } from '../../components/KpiCard';
import { CashFlowChart } from '../../components/CashFlowChart';
import { EvmChart, buildEvm } from '../../components/EvmChart';
import { CategoryBar } from '../../components/CategoryCharts';
import { workingCapital } from '../../domain/workingcap';
import { marginByBill } from '../../domain/workingcap';
import type { BoqItem, Distribution } from '../../data/types';
import type {
  FinancialReceipt, FinancialPayment, FinancialLiability, PaymentCategory, Project,
} from '../../data/types';

const SUB = ['dashboard', 'receipts', 'payments', 'liabilities', 'cashflow', 'pnl'] as const;
type Sub = (typeof SUB)[number];
const LABEL: Record<Sub, string> = {
  dashboard: 'Dashboard', receipts: 'Receipts', payments: 'Payments',
  liabilities: 'Liabilities', cashflow: 'Cash flow', pnl: 'P&L',
};

interface Bundle {
  receipts: FinancialReceipt[];
  payments: FinancialPayment[];
  liabilities: FinancialLiability[];
  project: Project | undefined;
}

export function FinancialTab({ projectId }: { projectId: string }) {
  const { provider, projects } = useData();
  const [sub, setSub] = useState<Sub>('dashboard');
  const [b, setB] = useState<Bundle>({ receipts: [], payments: [], liabilities: [], project: undefined });

  async function reload() {
    const [receipts, payments, liabilities] = await Promise.all([
      provider.listReceipts(projectId),
      provider.listPayments(projectId),
      provider.listLiabilities(projectId),
    ]);
    setB({ receipts, payments, liabilities, project: projects.find((p) => p.id === projectId) });
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, projectId, projects]);

  return (
    <div>
      <div className="subtabs" role="tablist">
        {SUB.map((s) => (
          <button key={s} role="tab" aria-selected={sub === s} className={`subtab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>
            {LABEL[s]}
          </button>
        ))}
      </div>
      {sub === 'dashboard' && <Dashboard b={b} />}
      {sub === 'receipts' && <Receipts projectId={projectId} b={b} onAdded={reload} />}
      {sub === 'payments' && <Payments projectId={projectId} b={b} onAdded={reload} />}
      {sub === 'liabilities' && <Liabilities projectId={projectId} b={b} onAdded={reload} />}
      {sub === 'cashflow' && <CashFlow b={b} />}
      {sub === 'pnl' && <Pnl b={b} />}
    </div>
  );
}

function Dashboard({ b }: { b: Bundle }) {
  const { provider } = useData();
  const [series, setSeries] = useState<MonthlySeriesPoint[]>([]);
  useEffect(() => {
    if (!b.project) return;
    let alive = true;
    provider.listMonthlySeries(b.project.id).then((s) => alive && setSeries(s));
    return () => { alive = false; };
  }, [provider, b.project]);

  if (!b.project) return <p className="muted">Loading…</p>;
  const kpis = financialKpis({ project: b.project, receipts: b.receipts, payments: b.payments, liabilities: b.liabilities });
  const costToDate = b.payments.reduce((a, p) => a + p.amount, 0);
  const evm = series.length ? buildEvm(series, toNum(b.project.contractValue), costToDate) : [];
  const byCat = Object.entries(
    b.payments.reduce<Record<string, number>>((m, p) => { m[p.category] = (m[p.category] ?? 0) + p.amount; return m; }, {}),
  )
    .map(([name, value]) => ({ name: name[0].toUpperCase() + name.slice(1), value }))
    .sort((a, b2) => b2.value - a.value);

  return (
    <div>
      <div className="section-head"><h3>Financial dashboard</h3><span className="muted">{kpis.length} indicators</span></div>
      <div className="kpi-grid">
        {kpis.map((k) => (<KpiCard key={k.label} label={k.label} value={k.value} />))}
      </div>
      {evm.length > 0 && (
        <div className="panel-grid">
          <EvmChart data={evm} />
          <CategoryBar title="Cost by category" data={byCat} money ariaLabel="Cost by category" />
        </div>
      )}
      {(() => {
        const sumLiab = (re: RegExp) => b.liabilities.filter((l) => re.test(l.kind)).reduce((a, l) => a + l.amount, 0);
        const wc = workingCapital({
          receivables: Math.max(0, toNum(b.project.billedToDate) - toNum(b.project.receivedToDate)),
          retentionHeld: sumLiab(/retention/i),
          advancesOutstanding: sumLiab(/advance/i),
          payables: sumLiab(/rar|payable|outstanding/i),
        });
        return (
          <div className="panel-grid">
            <CategoryBar
              title="Working-capital position"
              ariaLabel="Working capital"
              money
              data={wc.components.map((c) => ({ name: c.label, value: c.amount }))}
            />
            <div className="card">
              <h3>Net working capital</h3>
              <div className="kpi-value" style={{ fontSize: 28 }}>{formatMoney(wc.net)}</div>
              <table className="data-table" aria-label="Working capital">
                <tbody>
                  {wc.components.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td className={`num ${c.kind === 'asset' ? 'pos' : 'neg'}`}>{c.kind === 'asset' ? '+' : '−'} {formatMoney(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td>Net</td><td className="num">{formatMoney(wc.net)}</td></tr></tfoot>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Receipts({ projectId, b, onAdded }: { projectId: string; b: Bundle; onAdded: () => void }) {
  const { provider } = useData();
  const [month, setMonth] = useState('Jun-26');
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  async function add() {
    const a = Number(amount.replace(/,/g, ''));
    if (!source.trim() || !Number.isFinite(a) || a <= 0) return;
    await provider.addReceipt(projectId, { month, source: source.trim(), amount: a });
    setSource(''); setAmount(''); onAdded();
  }
  const total = b.receipts.reduce((s, r) => s + r.amount, 0);
  return (
    <div>
      <div className="section-head"><h3>Receipts</h3><span className="muted">{formatMoney(total)} received</span></div>
      <div className="card create-row">
        <input aria-label="Receipt month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input aria-label="Receipt source" placeholder="Source (e.g. IPC-03)" value={source} onChange={(e) => setSource(e.target.value)} />
        <input aria-label="Receipt amount" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={add}>Record receipt</button>
      </div>
      <table className="data-table" aria-label="Receipts"><thead><tr><th>Month</th><th>Source</th><th className="num">Amount</th></tr></thead>
        <tbody>{b.receipts.map((r) => (<tr key={r.id}><td>{r.month}</td><td>{r.source}</td><td className="num">{formatMoney(r.amount)}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function Payments({ projectId, b, onAdded }: { projectId: string; b: Bundle; onAdded: () => void }) {
  const { provider } = useData();
  const [month, setMonth] = useState('Jun-26');
  const [category, setCategory] = useState<PaymentCategory>('materials');
  const [amount, setAmount] = useState('');
  async function add() {
    const a = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(a) || a <= 0) return;
    await provider.addPayment(projectId, { month, category, amount: a });
    setAmount(''); onAdded();
  }
  const total = b.payments.reduce((s, p) => s + p.amount, 0);
  return (
    <div>
      <div className="section-head"><h3>Payments</h3><span className="muted">{formatMoney(total)} paid</span></div>
      <div className="card create-row">
        <input aria-label="Payment month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <select aria-label="Payment category" value={category} onChange={(e) => setCategory(e.target.value as PaymentCategory)}>
          {['materials', 'labour', 'plant', 'subcontract', 'overhead'].map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        <input aria-label="Payment amount" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={add}>Record payment</button>
      </div>
      <table className="data-table" aria-label="Payments"><thead><tr><th>Month</th><th>Category</th><th className="num">Amount</th></tr></thead>
        <tbody>{b.payments.map((p) => (<tr key={p.id}><td>{p.month}</td><td style={{ textTransform: 'capitalize' }}>{p.category}</td><td className="num">{formatMoney(p.amount)}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function Liabilities({ projectId, b, onAdded }: { projectId: string; b: Bundle; onAdded: () => void }) {
  const { provider } = useData();
  const [kind, setKind] = useState('');
  const [amount, setAmount] = useState('');
  async function add() {
    const a = Number(amount.replace(/,/g, ''));
    if (!kind.trim() || !Number.isFinite(a) || a <= 0) return;
    await provider.addLiability(projectId, { kind: kind.trim(), amount: a });
    setKind(''); setAmount(''); onAdded();
  }
  const total = b.liabilities.reduce((s, l) => s + l.amount, 0);
  return (
    <div>
      <div className="section-head"><h3>Liabilities</h3><span className="muted">{formatMoney(total)} total</span></div>
      <div className="card create-row">
        <input aria-label="Liability kind" placeholder="Kind (e.g. Retention held)" value={kind} onChange={(e) => setKind(e.target.value)} />
        <input aria-label="Liability amount" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={add}>Add liability</button>
      </div>
      <table className="data-table" aria-label="Liabilities"><thead><tr><th>Kind</th><th className="num">Amount</th></tr></thead>
        <tbody>{b.liabilities.map((l) => (<tr key={l.id}><td>{l.kind}</td><td className="num">{formatMoney(l.amount)}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function CashFlow({ b }: { b: Bundle }) {
  const { rag } = useUiState(); // unused but keeps hook order if extended later
  void rag;
  const [n, setN] = useState<3 | 6 | 12>(3);
  const history = monthlyCashFlow(b.receipts, b.payments);
  const series = forecastCashFlow(history, n);
  return (
    <div>
      <div className="section-head">
        <h3>Cash flow &amp; forecast</h3>
        <div className="head-tools">
          <span className="muted small">Forecast horizon:</span>
          {[3, 6, 12].map((opt) => (
            <button key={opt} className={`subtab${n === opt ? ' active' : ''}`} onClick={() => setN(opt as 3 | 6 | 12)}>{opt} mo</button>
          ))}
        </div>
      </div>
      <CashFlowChart months={series} />
      <p className="muted small">Forecast months use the trailing-3-month average net (dimmed bars).</p>
    </div>
  );
}

function Pnl({ b }: { b: Bundle }) {
  const { provider } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [dists, setDists] = useState<Record<string, Distribution>>({});
  useEffect(() => {
    if (!b.project) return;
    let alive = true;
    const pid = b.project.id;
    Promise.all([provider.listBoq(pid), provider.listDistributions(pid)]).then(([items, ds]) => {
      if (!alive) return;
      setBoq(items);
      setDists(Object.fromEntries(ds.map((d) => [d.boqItemId, d])));
    });
    return () => { alive = false; };
  }, [provider, b.project]);

  if (!b.project) return <p className="muted">Loading…</p>;
  const pnl = pnlSummary(b.project, b.payments);
  const months = monthlyCashFlow(b.receipts, b.payments).filter((m) => !m.forecast);
  const bills = marginByBill(boq, dists);
  return (
    <div>
      <div className="section-head"><h3>Profit &amp; loss</h3></div>
      <div className="kpi-grid">
        <KpiCard label="Revenue (billed)" value={formatMoney(pnl.revenue)} />
        <KpiCard label="Cost (payments)" value={formatMoney(pnl.cost)} />
        <KpiCard label="Gross profit" value={formatMoney(pnl.grossProfit)} sub={<span className={pnl.grossProfit < 0 ? 'neg' : 'pos'}>{formatPct(pnl.marginPct)} margin</span>} />
      </div>
      {bills.length > 0 && (
        <div className="panel-grid">
          <CategoryBar title="Margin by bill" ariaLabel="Margin by bill" money data={bills.map((x) => ({ name: x.billNo, value: x.margin }))} />
          <div className="card">
            <h3>Margin by bill</h3>
            <table className="data-table" aria-label="Margin by bill table">
              <thead><tr><th>Bill</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Margin</th><th className="num">%</th></tr></thead>
              <tbody>
                {bills.map((x) => (
                  <tr key={x.billNo}>
                    <td>{x.billNo}</td>
                    <td className="num">{formatMoney(x.revenue)}</td>
                    <td className="num">{formatMoney(x.cost)}</td>
                    <td className={`num ${x.margin < 0 ? 'neg' : 'pos'}`}>{formatMoney(x.margin)}</td>
                    <td className="num">{formatPct(x.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Sublet work costed at BOQ value; self-execute at {Math.round(0.85 * 100)}% (assumption).</p>
          </div>
        </div>
      )}
      <div className="card">
        <h3>Monthly (cash basis)</h3>
        <table className="data-table" aria-label="Monthly P&L">
          <thead><tr><th>Month</th><th className="num">In</th><th className="num">Out</th><th className="num">Net</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}><td>{m.month}</td><td className="num">{formatMoney(m.inflow)}</td><td className="num">{formatMoney(m.outflow)}</td>
                <td className={`num ${m.net < 0 ? 'neg' : 'pos'}`}>{formatMoney(m.net)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Headline P&amp;L is accrual (billed vs cost); the monthly table is cash basis.</p>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMoneyFormat } from '../../state/useMoneyFormat';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useData } from '../../data/DataContext';
import { formatMoney, formatAxis } from '../../domain/money';
import { commercialCashflow, cashflowTotals } from '../../domain/commercialcashflow';
import { ChartCard, chartPalette } from '../../components/chartUtils';
import type { Ipc, Rar } from '../../data/types';

const cr = (n: number) => formatAxis(n);
const money = (n: number) => (n !== 0 ? formatMoney(n) : '0');

export function CashFlowTab({ projectId }: { projectId: string }) {
  useMoneyFormat();
  const { provider } = useData();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  useEffect(() => {
    let a = true;
    void Promise.all([provider.listIpcs(projectId), provider.listRars(projectId)]).then(([i, r]) => { if (a) { setIpcs(i); setRars(r); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const points = useMemo(() => commercialCashflow(ipcs, rars), [ipcs, rars]);
  const totals = useMemo(() => cashflowTotals(points), [points]);
  const c = chartPalette();

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Cash Flow</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Client IPC inflow (FGEHA → NLC) against subcontractor RAR outflow (NLC → S/C), with the running net working-capital position by period.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Cash flow summary">
        <Kpi label="Total inflow (IPC net)" value={money(totals.inflow)} sub="certified to client" />
        <Kpi label="Total outflow (RAR net)" value={money(totals.outflow)} sub="payable to subs" />
        <Kpi label="Net position" value={money(totals.net)} sub={totals.net >= 0 ? 'positive' : 'negative'} accent={totals.net >= 0} neg={totals.net < 0} />
      </div>

      {points.length === 0 ? (
        <p className="muted" style={{ marginTop: 14 }}>No IPCs or RARs yet — cash flow builds as certificates are raised.</p>
      ) : (
        <>
          <ChartCard title="Inflow vs outflow" subtitle="net working capital line" ariaLabel="Commercial cash flow">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: c.grid }} />
                <YAxis tickFormatter={cr} tickLine={false} axisLine={false} width={54} />
                <Tooltip formatter={(v: number | string) => cr(Number(v))} />
                <Legend />
                <Bar dataKey="inflow" name="Inflow" fill={c.success} radius={[3, 3, 0, 0]} />
                <Bar dataKey="outflow" name="Outflow" fill={c.amber} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="cumNet" name="Cumulative net" stroke={c.primary} strokeWidth={2.4} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="card">
            <table className="data-table" aria-label="Cash flow by period">
              <thead><tr><th>Period</th><th className="num">Inflow</th><th className="num">Outflow</th><th className="num">Net</th><th className="num">Cumulative</th></tr></thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.period}>
                    <td>{p.period}</td>
                    <td className="num">{money(p.inflow)}</td>
                    <td className="num">{money(p.outflow)}</td>
                    <td className={`num ${p.net < 0 ? 'neg' : ''}`}>{money(p.net)}</td>
                    <td className={`num ${p.cumNet < 0 ? 'neg' : ''}`}>{money(p.cumNet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent, neg }: { label: string; value: string; sub?: string; accent?: boolean; neg?: boolean }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={neg ? { color: 'var(--rag-red)' } : accent ? { color: 'var(--rag-green)' } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

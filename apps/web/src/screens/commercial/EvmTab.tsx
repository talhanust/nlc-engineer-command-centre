import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { useData } from '../../data/DataContext';
import { formatMoney, toNum } from '../../domain/money';
import { evm, indexStatus, SCHEDULE_LABEL, COST_LABEL, SELF_COST_FACTOR } from '../../domain/evm';
import { revisedContractValue } from '../../domain/variations';
import { ChartCard, chartPalette } from '../../components/chartUtils';
import { SkeletonRows } from '../../components/Skeleton';
import type { BoqItem, Distribution, Rar, Variation } from '../../data/types';

const cr = (n: number) => `${(n / 1e7).toFixed(1)} Cr`;
const money = (n: number) => formatMoney(n);
const signed = (n: number) => `${n >= 0 ? '+' : '−'} ${formatMoney(Math.abs(n))}`;

export function EvmTab({ projectId }: { projectId: string }) {
  const { provider, projects } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [dists, setDists] = useState<Distribution[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [vos, setVos] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let a = true;
    void Promise.all([provider.listBoq(projectId), provider.listDistributions(projectId), provider.listRars(projectId), provider.listVariations(projectId)])
      .then(([b, d, r, v]) => { if (a) { setBoq(b); setDists(d); setRars(r); setVos(v); setLoading(false); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const project = projects.find((p) => p.id === projectId);
  const r = useMemo(() => {
    const original = toNum(project?.contractValue ?? '0');
    const bac = revisedContractValue(original, vos);
    const pv = ((project?.plannedPct ?? 0) / 100) * bac;
    const ev = ((project?.actualPct ?? 0) / 100) * bac;
    const rate = new Map(boq.map((b) => [b.id, b.rate]));
    const totalBoq = boq.reduce((s, b) => s + b.amount, 0);
    const subletVal = dists.filter((d) => d.mode === 'sublet').reduce((s, d) => s + d.allocatedQty * (rate.get(d.boqItemId) ?? 0), 0);
    const subletShare = totalBoq > 0 ? Math.min(1, subletVal / totalBoq) : 0;
    const rarGross = rars.reduce((s, x) => s + x.gross, 0);
    const selfEv = ev * (1 - subletShare);
    const ac = rarGross + selfEv * SELF_COST_FACTOR;
    return evm({ bac, pv, ev, ac });
  }, [project, vos, boq, dists, rars]);

  const c = chartPalette();
  const sched = indexStatus(r.spi);
  const cost = indexStatus(r.cpi);
  const chartData = [
    { name: 'PV', value: r.pv, fill: c.muted },
    { name: 'EV', value: r.ev, fill: c.primary },
    { name: 'AC', value: r.ac, fill: c.amber },
  ];

  if (loading) return <div><h3>Earned Value</h3><SkeletonRows rows={4} cols={4} /></div>;

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Earned Value (EVM)</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Bridges physical progress (Execution) and financial actuals (Commercial). PV/EV from % complete × revised contract; AC from RAR booked + self-performed cost.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="EVM headline">
        <Kpi label="BAC" value={money(r.bac)} sub="budget at completion" />
        <Kpi label="Planned value (PV)" value={money(r.pv)} sub={`${(r.pctPlanned * 100).toFixed(0)}% scheduled`} />
        <Kpi label="Earned value (EV)" value={money(r.ev)} sub={`${(r.pctComplete * 100).toFixed(0)}% complete`} accent />
        <Kpi label="Actual cost (AC)" value={money(r.ac)} sub="RAR + self cost" />
      </div>

      <div className="analytics-grid">
        <ChartCard title="PV · EV · AC" subtitle="cumulative to date" ariaLabel="EVM bar chart">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: c.grid }} />
              <YAxis tickFormatter={cr} tickLine={false} axisLine={false} width={56} />
              <Tooltip formatter={(v: number | string) => cr(Number(v))} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((d) => <Cell key={d.name} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>Performance indices</h4>
          <div className="evm-index">
            <div>
              <div className="kpi-label">SPI · schedule</div>
              <div className={`evm-idx-val st-${sched}`}>{r.spi.toFixed(2)}</div>
              <div className={`urg-badge urg-${sched === 'ahead' ? 'low' : sched === 'on' ? 'medium' : 'critical'}`}>{SCHEDULE_LABEL[sched]}</div>
            </div>
            <div>
              <div className="kpi-label">CPI · cost</div>
              <div className={`evm-idx-val st-${cost}`}>{r.cpi.toFixed(2)}</div>
              <div className={`urg-badge urg-${cost === 'ahead' ? 'low' : cost === 'on' ? 'medium' : 'critical'}`}>{COST_LABEL[cost]}</div>
            </div>
          </div>
          <table className="kv-table" style={{ marginTop: 12 }}>
            <tbody>
              <tr><th>Schedule variance (SV)</th><td className={`num ${r.sv < 0 ? 'neg' : ''}`}>{signed(r.sv)}</td></tr>
              <tr><th>Cost variance (CV)</th><td className={`num ${r.cv < 0 ? 'neg' : ''}`}>{signed(r.cv)}</td></tr>
              <tr><th>Estimate at completion (EAC)</th><td className="num">{money(r.eac)}</td></tr>
              <tr><th>Estimate to complete (ETC)</th><td className="num">{money(r.etc)}</td></tr>
              <tr className="ipc-net-row"><th>Variance at completion (VAC)</th><td className={`num ${r.vac < 0 ? 'neg' : ''}`}><strong>{signed(r.vac)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>Indicative. AC basis: RAR booked gross + self-performed work at {Math.round(SELF_COST_FACTOR * 100)}% of earned value. SPI uses planned vs actual physical progress.</p>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={accent ? { color: 'var(--rag-green)' } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

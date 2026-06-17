import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { retentionTimeline, releaseSchedule, type RetentionPoint } from '../../domain/retention';
import { ChartCard, chartPalette } from '../../components/chartUtils';
import { KpiCard } from '../../components/KpiCard';
import type { Ipc } from '../../data/types';

const cr = (n: number) => `${(n / 1e7).toFixed(1)} Cr`;

export function RetentionTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  useEffect(() => {
    let a = true;
    provider.listIpcs(projectId).then((x) => a && setIpcs(x));
    return () => { a = false; };
  }, [provider, projectId]);

  const points: RetentionPoint[] = retentionTimeline(ipcs);
  const release = releaseSchedule(points);
  const c = chartPalette();

  return (
    <div>
      <div className="section-head"><h3>Retention timeline</h3><span className="muted">10% withheld per IPC</span></div>

      {points.length === 0 ? (
        <p className="muted">No IPCs yet — retention accrues as IPCs are certified.</p>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total held" value={formatMoney(release.totalHeld)} />
            <KpiCard label="Release at completion" value={formatMoney(release.atCompletion)} sub={<span className="muted">50%</span>} />
            <KpiCard label="Release after DLP" value={formatMoney(release.afterDlp)} sub={<span className="muted">50%</span>} />
          </div>

          <ChartCard title="Cumulative retention held" subtitle="by IPC period" ariaLabel="Retention timeline">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={points} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="retFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.amber} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={c.amber} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: c.grid }} />
                <YAxis tickFormatter={cr} tickLine={false} axisLine={false} width={52} />
                <Tooltip formatter={(v: number | string) => cr(Number(v))} />
                <Area type="monotone" dataKey="cumHeld" name="Held" stroke={c.amber} strokeWidth={2.4} fill="url(#retFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="card">
            <table className="data-table" aria-label="Retention ledger">
              <thead><tr><th>IPC</th><th>Period</th><th className="num">Gross</th><th className="num">Retention held</th><th className="num">Cumulative</th></tr></thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.ipcNo}>
                    <td>{p.ipcNo}</td><td>{p.period}</td>
                    <td className="num">{formatMoney(p.gross)}</td>
                    <td className="num">{formatMoney(p.held)}</td>
                    <td className="num">{formatMoney(p.cumHeld)}</td>
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

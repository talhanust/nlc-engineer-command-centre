import { useEffect, useState } from 'react';
import { useMoneyFormat } from '../../state/useMoneyFormat';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useData } from '../../data/DataContext';
import { formatMoney, toNum, formatAxis } from '../../domain/money';
import { retentionTimeline, retentionSummary, type RetentionPoint } from '../../domain/retention';
import { revisedContractValue } from '../../domain/variations';
import { ChartCard, chartPalette } from '../../components/chartUtils';
import type { Ipc, Variation } from '../../data/types';

const cr = (n: number) => formatAxis(n);
const money = (n: number) => (n > 0 ? formatMoney(n) : '0');

export function RetentionTab({ projectId }: { projectId: string }) {
  useMoneyFormat();
  const { provider, projects } = useData();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [vos, setVos] = useState<Variation[]>([]);
  useEffect(() => {
    let a = true;
    void Promise.all([provider.listIpcs(projectId), provider.listVariations(projectId)]).then(([x, v]) => { if (a) { setIpcs(x); setVos(v); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const original = toNum(projects.find((p) => p.id === projectId)?.contractValue ?? '0');
  const contractValue = revisedContractValue(original, vos);
  const points: RetentionPoint[] = retentionTimeline(ipcs);
  const sum = retentionSummary(ipcs, contractValue);
  const c = chartPalette();

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Retention</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Cumulative retention deducted across all IPCs. DLP (Defects Liability Period) split happens when the Final Bill is client-approved.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Retention summary">
        <Kpi label="Cumulative retention deducted" value={money(sum.deducted)} sub={`${sum.ipcCount} IPCs`} />
        <Kpi label="Released at substantial completion" value={money(sum.releasedAtCompletion)} sub={sum.finalBillApproved ? '50%' : '— Final Bill not approved'} />
        <Kpi label="Held for DLP" value={money(sum.heldForDlp)} sub={sum.finalBillApproved ? '50%' : 'full balance'} />
        <Kpi label="Released after DLP" value={money(sum.releasedAfterDlp)} sub="—" />
        <Kpi label="Written-off" value={money(sum.writtenOff)} sub="—" />
      </div>

      {contractValue > 0 && (
        <div className="card" style={{ marginTop: 12 }} aria-label="Retention cap">
          <div className="section-head" style={{ marginBottom: 6 }}>
            <h4 style={{ margin: 0 }}>Retention cap</h4>
            <span className="muted small">{sum.capPct}% of contract · {formatMoney(sum.cap)} ceiling</span>
          </div>
          <div className="boq-status" style={{ maxWidth: 480 }} title={`${Math.round(sum.capUsedPct * 100)}% of cap used`}>
            <span className="boq-prog" aria-hidden><span className="boq-prog-fill" style={{ width: `${Math.round(sum.capUsedPct * 100)}%`, background: sum.atCapped ? 'var(--rag-red)' : 'var(--rag-amber)' }} /></span>
            <span className="boq-pct mono small">{Math.round(sum.capUsedPct * 100)}%</span>
          </div>
          {sum.atCapped && <p className="muted small" style={{ color: 'var(--rag-red)', margin: '6px 0 0' }}>Retention has reached the contract cap — no further deduction on subsequent IPCs.</p>}
        </div>
      )}

      {points.length === 0 ? (
        <p className="muted" style={{ marginTop: 14 }}>No Final Bill raised yet. The DLP retention split is computed when the Final Bill is client-approved; the cumulative retention across paid IPCs will then be split per the contract: a portion released at Substantial Completion, the rest held for the Defects Liability Period and released on DLP expiry (or written off if defects are not rectified).</p>
      ) : (
        <>
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
                    <td className="mono small">{p.ipcNo}</td><td>{p.period}</td>
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

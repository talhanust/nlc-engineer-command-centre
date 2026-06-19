import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { portfolioEvm } from '../domain/portfolio';
import { SCHEDULE_LABEL } from '../domain/evm';
import type { Project } from '../data/types';

const pctOf = (n: number) => `${(n * 100).toFixed(0)}%`;
const urg = (s: string) => (s === 'ahead' ? 'low' : s === 'on' ? 'medium' : 'critical');

/** Portfolio earned-value roll-up: schedule performance across the in-scope projects. */
export function PortfolioPerformance({ projects }: { projects: Project[] }) {
  const { nodes } = useData();
  const navigate = useNavigate();
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  if (projects.length === 0) return null;
  const p = portfolioEvm(projects);

  return (
    <div className="card">
      <div className="section-head" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Portfolio performance <span className="muted small" style={{ fontWeight: 400 }}>· earned value</span></h3>
        <span className="muted small">{p.count} projects · {p.behind} behind schedule</span>
      </div>

      <div className="kpi-row" aria-label="Portfolio EVM">
        <Kpi label="Portfolio value (BAC)" value={formatMoney(p.bac)} sub="contract awards" />
        <Kpi label="Earned value (EV)" value={formatMoney(p.ev)} sub={`${p.actualPct.toFixed(0)}% complete`} accent />
        <Kpi label="Planned value (PV)" value={formatMoney(p.pv)} sub={`${p.plannedPct.toFixed(0)}% scheduled`} />
        <Kpi label="Portfolio SPI" value={p.spi.toFixed(2)} sub={SCHEDULE_LABEL[p.spi >= 1.02 ? 'ahead' : p.spi <= 0.98 ? 'behind' : 'on']} status={p.spi >= 1.02 ? 'ahead' : p.spi <= 0.98 ? 'behind' : 'on'} />
        <Kpi label="Outstanding receivable" value={formatMoney(p.outstanding)} sub={`${pctOf(p.billed > 0 ? p.received / p.billed : 0)} collected`} />
      </div>

      <table className="data-table" aria-label="Project performance">
        <thead><tr><th>Project</th><th>Client</th><th className="num">Contract</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">SPI</th><th>Schedule</th><th></th></tr></thead>
        <tbody>
          {p.projects.map((r) => (
            <tr key={r.id}>
              <td>{nameOf(r.id)}</td>
              <td className="small">{r.client}</td>
              <td className="num">{formatMoney(r.bac)}</td>
              <td className="num">{r.plannedPct}%</td>
              <td className="num">{r.actualPct}%</td>
              <td className={`num evm-spi st-${r.status}`}>{r.spi.toFixed(2)}</td>
              <td><span className={`urg-badge urg-${urg(r.status)}`}>{SCHEDULE_LABEL[r.status]}</span></td>
              <td><button className="btn-ghost btn-mini" aria-label={`Open ${nameOf(r.id)}`} onClick={() => navigate(`/node/${r.id}/commercial`)}>Open →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, sub, accent, status }: { label: string; value: string; sub?: string; accent?: boolean; status?: string }) {
  const color = status === 'behind' ? 'var(--rag-red)' : status === 'ahead' ? 'var(--rag-green)' : accent ? 'var(--rag-green)' : undefined;
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={color ? { color } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

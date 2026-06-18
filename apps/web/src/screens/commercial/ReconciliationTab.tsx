import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { reconKpis, perIpcRows, perContractorRows, linkerRows } from '../../domain/reconcile';
import type { Ipc, Rar, RarIpcLink, Subcontractor, Distribution, BoqItem } from '../../data/types';

type View = 'ipc' | 'contractor' | 'linker';
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—');
const money = (n: number) => (n !== 0 ? formatMoney(n) : '0');

export function ReconciliationTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [links, setLinks] = useState<RarIpcLink[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [dists, setDists] = useState<Distribution[]>([]);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [view, setView] = useState<View>('ipc');

  async function load() {
    const [i, r, l, s, d, b] = await Promise.all([
      provider.listIpcs(projectId), provider.listRars(projectId), provider.listRarIpcLinks(projectId),
      provider.listSubcontractors(projectId), provider.listDistributions(projectId), provider.listBoq(projectId),
    ]);
    setIpcs(i); setRars(r); setLinks(l); setSubs(s); setDists(d); setBoq(b);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const kpis = useMemo(() => reconKpis(ipcs, rars, dists, boq), [ipcs, rars, dists, boq]);
  const ipcRows = useMemo(() => perIpcRows(ipcs, rars, links), [ipcs, rars, links]);
  const contractorRows = useMemo(() => perContractorRows(rars, dists, boq, subs), [rars, dists, boq, subs]);
  const linkRows = useMemo(() => linkerRows(rars, ipcs, links, subs), [rars, ipcs, links, subs]);

  async function linkOne(rarId: string, ipcId: string, amount: number) {
    await provider.addRarIpcLink(projectId, { rarId, ipcId, amount });
    await load();
  }
  async function autoLinkAll() {
    let n = 0;
    for (const row of linkRows) {
      const top = row.suggestions[0];
      if (top && !row.currentLinks.length) { await provider.addRarIpcLink(projectId, { rarId: row.rarId, ipcId: top.ipcId, amount: row.gross }); n++; }
    }
    await load();
    toast({ message: n ? `Auto-linked ${n} RAR${n === 1 ? '' : 's'}` : 'No RARs with BoQ overlap to link', kind: n ? 'success' : 'info' });
  }

  const ipcTotals = { gross: ipcRows.reduce((s, r) => s + r.gross, 0), dist: ipcRows.reduce((s, r) => s + r.distCost, 0) };
  const conTotals = { dist: contractorRows.reduce((s, r) => s + r.distCost, 0), gross: contractorRows.reduce((s, r) => s + r.rarGross, 0), paid: contractorRows.reduce((s, r) => s + r.rarPaid, 0) };

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Reconciliation</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Compare what NLC bills the client (IPCs) against what NLC pays sub-contractors (RARs). Per-IPC and per-contractor coverage views with a linkage editor.</p>
        </div>
        <button className="btn" onClick={autoLinkAll}>⚡ Auto-link all RARs</button>
      </div>

      <div className="kpi-row" aria-label="Reconciliation summary">
        <Kpi label="NLC revenue (IPCs)" value={money(kpis.nlcRevenue)} sub="gross billed to client" />
        <Kpi label="Distributed cost" value={money(kpis.distributedCost)} sub="cost via subs/labour" />
        <Kpi label="RAR booked (gross)" value={money(kpis.rarBooked)} sub={`${money(kpis.rarPaid)} paid`} />
        <Kpi label="Overall coverage" value={pct(kpis.overallCoverage)} sub="RAR ÷ distributed" neg={kpis.overallCoverage === 0} />
        <Kpi label="Working capital" value={money(kpis.workingCapital)} sub="distributed minus RAR paid" neg={kpis.workingCapital < 0} />
      </div>

      <div className="seg" role="tablist" aria-label="Reconciliation view" style={{ margin: '14px 0' }}>
        <button role="tab" aria-selected={view === 'ipc'} className={`seg-btn${view === 'ipc' ? ' active' : ''}`} onClick={() => setView('ipc')}>Per-IPC View</button>
        <button role="tab" aria-selected={view === 'contractor'} className={`seg-btn${view === 'contractor' ? ' active' : ''}`} onClick={() => setView('contractor')}>Per-Contractor View</button>
        <button role="tab" aria-selected={view === 'linker'} className={`seg-btn${view === 'linker' ? ' active' : ''}`} onClick={() => setView('linker')}>RAR ↔ IPC Linker</button>
      </div>

      {view === 'ipc' && (
        <table className="data-table" aria-label="Per-IPC reconciliation">
          <thead><tr><th>IPC No.</th><th>Period</th><th className="num">IPC Gross</th><th className="num">Dist. Cost</th><th>Linked RARs</th><th className="num">Coverage</th><th>Status</th></tr></thead>
          <tbody>
            {ipcRows.map((r) => (
              <tr key={r.ipcNo}>
                <td className="mono small">{r.ipcNo}</td><td>{r.period}</td>
                <td className="num">{formatMoney(r.gross)}</td>
                <td className="num">{r.distCost > 0 ? formatMoney(r.distCost) : <span className="muted">0 <span className="small">no links</span></span>}</td>
                <td className="small">{r.linkedRars.length ? r.linkedRars.join(', ') : <span className="muted">—</span>}</td>
                <td className="num">{pct(r.coverage)}</td>
                <td>{r.linked ? <span className="status-pill st-vetted">Linked</span> : <span className="status-pill st-draft">Unlinked</span>}</td>
              </tr>
            ))}
            <tr className="boq-total-row"><td colSpan={2}><strong>Total</strong></td><td className="num"><strong>{formatMoney(ipcTotals.gross)}</strong></td><td className="num"><strong>{ipcTotals.dist > 0 ? formatMoney(ipcTotals.dist) : '0'}</strong></td><td /><td /><td /></tr>
          </tbody>
        </table>
      )}

      {view === 'contractor' && (
        <table className="data-table" aria-label="Per-contractor reconciliation">
          <thead><tr><th>Code</th><th>Name (Type)</th><th className="num">Dist. Cost</th><th className="num">RAR Gross</th><th className="num">RAR Paid</th><th className="num">Coverage</th><th>Status</th></tr></thead>
          <tbody>
            {contractorRows.map((r) => (
              <tr key={r.code}>
                <td className="mono small">{r.code}</td>
                <td>{r.name} <span className="muted small">· {r.type}</span></td>
                <td className="num">{money(r.distCost)}</td>
                <td className="num">{formatMoney(r.rarGross)}</td>
                <td className="num">{money(r.rarPaid)}</td>
                <td className="num">{pct(r.coverage)}</td>
                <td>{r.overClaimed ? <span className="status-pill st-draft">Over-claimed</span> : <span className="status-pill st-vetted">OK</span>}</td>
              </tr>
            ))}
            <tr className="boq-total-row"><td colSpan={2}><strong>Total</strong></td><td className="num"><strong>{money(conTotals.dist)}</strong></td><td className="num"><strong>{formatMoney(conTotals.gross)}</strong></td><td className="num"><strong>{money(conTotals.paid)}</strong></td><td /><td /></tr>
          </tbody>
        </table>
      )}

      {view === 'linker' && (
        <table className="data-table" aria-label="RAR IPC linker">
          <thead><tr><th>RAR No.</th><th>Contractor</th><th>Current Links</th><th>Suggested (top 3)</th><th className="num">RAR Gross</th><th>Actions</th></tr></thead>
          <tbody>
            {linkRows.map((r) => (
              <tr key={r.rarNo}>
                <td className="mono small">{r.rarNo}</td>
                <td className="small">{r.contractor}</td>
                <td className="small">{r.currentLinks.length ? r.currentLinks.join(', ') : <span className="muted">none</span>}</td>
                <td className="small">{r.suggestions.length ? r.suggestions.map((s) => s.ipcNo).join(', ') : <span className="muted">no BoQ overlap</span>}</td>
                <td className="num">{formatMoney(r.gross)}</td>
                <td>{r.suggestions[0] && !r.currentLinks.length ? <button className="btn-ghost btn-mini" aria-label={`Link ${r.rarNo}`} onClick={() => linkOne(r.rarId, r.suggestions[0].ipcId, r.gross)}>Link → {r.suggestions[0].ipcNo}</button> : <span className="muted small">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, neg }: { label: string; value: string; sub?: string; neg?: boolean }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={neg ? { color: 'var(--rag-red)' } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { reconcileRarIpc } from '../../domain/reconcile';
import { KpiCard } from '../../components/KpiCard';
import type { Ipc, Rar, RarIpcLink, Subcontractor } from '../../data/types';

export function ReconciliationTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [links, setLinks] = useState<RarIpcLink[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      provider.listIpcs(projectId), provider.listRars(projectId),
      provider.listRarIpcLinks(projectId), provider.listSubcontractors(projectId),
    ]).then(([i, r, l, s]) => { if (alive) { setIpcs(i); setRars(r); setLinks(l); setSubs(s); } });
    return () => { alive = false; };
  }, [provider, projectId]);

  const recon = useMemo(() => reconcileRarIpc(ipcs, rars, links), [ipcs, rars, links]);
  const subName = useMemo(() => {
    const m = new Map(subs.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? id;
  }, [subs]);

  return (
    <div>
      <div className="section-head"><h3>Reconciliation — RAR ↔ IPC</h3><span className="muted">via recovery links</span></div>

      <div className="kpi-grid">
        <KpiCard label="Client IPC gross" value={formatMoney(recon.totals.ipcGross)} />
        <KpiCard label="Sub-recoveries applied" value={formatMoney(recon.totals.recovered)} />
        <KpiCard label="RAR gross" value={formatMoney(recon.totals.rarGross)} />
        <KpiCard label="RAR outstanding" value={formatMoney(recon.totals.outstanding)}
          sub={recon.totals.outstanding > 0 ? <span className="neg">to recover</span> : <span className="pos">cleared</span>} />
      </div>

      <div className="card">
        <h3>Client IPCs — recoveries applied</h3>
        <table className="data-table" aria-label="IPC reconciliation">
          <thead><tr><th>IPC</th><th className="num">Gross</th><th className="num">Recovered from subs</th><th className="num">Net of recoveries</th></tr></thead>
          <tbody>
            {recon.ipcRows.map((r) => (
              <tr key={r.ipcNo}>
                <td>{r.ipcNo}</td>
                <td className="num">{formatMoney(r.gross)}</td>
                <td className="num">{r.recovered ? formatMoney(r.recovered) : '—'}</td>
                <td className="num">{formatMoney(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Subcontractor RARs — recovery status</h3>
        <table className="data-table" aria-label="RAR reconciliation">
          <thead><tr><th>RAR</th><th>Subcontractor</th><th className="num">Gross</th><th className="num">Recovered</th><th className="num">Outstanding</th></tr></thead>
          <tbody>
            {recon.rarRows.map((r) => (
              <tr key={r.rarNo}>
                <td>{r.rarNo}</td>
                <td>{subName(r.subcontractorId)}</td>
                <td className="num">{formatMoney(r.gross)}</td>
                <td className="num">{r.recovered ? formatMoney(r.recovered) : '—'}</td>
                <td className="num">{r.outstanding > 0 ? <span className="neg">{formatMoney(r.outstanding)}</span> : <span className="pos">cleared</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { RAR_STATUS_LABEL } from '../domain/rar';
import { AuditTrail } from './AuditTrail';
import type { Rar, Ipc, RarIpcLink } from '../data/types';

export function RarDetailModal({ projectId, rar, onClose }: { projectId: string; rar: Rar; onClose: () => void }) {
  const { provider } = useData();
  const [links, setLinks] = useState<RarIpcLink[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  useEffect(() => {
    let a = true;
    Promise.all([provider.listRarIpcLinks(projectId), provider.listIpcs(projectId)]).then(([l, i]) => {
      if (a) { setLinks(l.filter((x) => x.rarId === rar.id)); setIpcs(i); }
    });
    return () => { a = false; };
  }, [provider, projectId, rar.id]);

  const ipcNo = (id: string) => ipcs.find((i) => i.id === id)?.ipcNo ?? id;
  const recovered = links.reduce((a, l) => a + l.amount, 0);
  const outstanding = Math.max(0, rar.netPayable - recovered);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`RAR ${rar.rarNo} detail`} aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{rar.rarNo} · {rar.period}</h3>
          <span className={`status-pill st-${rar.status}`}>{RAR_STATUS_LABEL[rar.status]}</span>
        </div>
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">Gross</div><div className="kpi-value">{formatMoney(rar.gross)}</div></div>
          <div className="kpi"><div className="kpi-label">Net payable</div><div className="kpi-value">{formatMoney(rar.netPayable)}</div></div>
          <div className="kpi"><div className="kpi-label">Recovered</div><div className="kpi-value">{formatMoney(recovered)}</div></div>
          <div className="kpi"><div className="kpi-label">Outstanding</div><div className="kpi-value">{formatMoney(outstanding)}</div></div>
        </div>

        <h3>Recovery against IPCs</h3>
        {links.length === 0 ? (
          <p className="muted small">No recoveries posted against client IPCs yet.</p>
        ) : (
          <table className="data-table" aria-label="RAR recovery links">
            <thead><tr><th>IPC</th><th className="num">Amount</th></tr></thead>
            <tbody>{links.map((l) => (<tr key={l.id}><td>{ipcNo(l.ipcId)}</td><td className="num">{formatMoney(l.amount)}</td></tr>))}</tbody>
            <tfoot><tr><td>Total recovered</td><td className="num">{formatMoney(recovered)}</td></tr></tfoot>
          </table>
        )}

        <div style={{ marginTop: 14 }}><AuditTrail entity="RAR" reference={rar.rarNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

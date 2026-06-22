import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { computeDeductions, DEFAULT_DEDUCTION_SETTINGS } from '../domain/deductions';
import { IPC_STATUS_LABEL } from '../domain/ipc';
import { AuditTrail } from './AuditTrail';
import type { Ipc, Rar, RarIpcLink, BoqItem } from '../data/types';

export function IpcDetailModal({ projectId, ipc, onClose }: { projectId: string; ipc: Ipc; onClose: () => void }) {
  const { provider } = useData();
  const [links, setLinks] = useState<RarIpcLink[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  useEffect(() => {
    let a = true;
    Promise.all([provider.listRarIpcLinks(projectId), provider.listRars(projectId), provider.listBoq(projectId)]).then(([l, r, b]) => {
      if (a) { setLinks(l.filter((x) => x.ipcId === ipc.id)); setRars(r); setBoq(b); }
    });
    return () => { a = false; };
  }, [provider, projectId, ipc.id]);

  const boqById = new Map(boq.map((b) => [b.id, b]));
  const d = computeDeductions(ipc.gross, 0, DEFAULT_DEDUCTION_SETTINGS);
  const rarNo = (id: string) => rars.find((r) => r.id === id)?.rarNo ?? id;
  const recovered = links.reduce((a, l) => a + l.amount, 0);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`${ipc.ipcNo} detail`} aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{ipc.ipcNo} · {ipc.period}</h3>
          <span className={`status-pill st-${ipc.status}`}>{IPC_STATUS_LABEL[ipc.status]}</span>
        </div>
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">Gross</div><div className="kpi-value">{formatMoney(ipc.gross)}</div></div>
          <div className="kpi"><div className="kpi-label">Net payable</div><div className="kpi-value">{formatMoney(ipc.netPayable)}</div></div>
          <div className="kpi"><div className="kpi-label">Cumulative</div><div className="kpi-value">{formatMoney(ipc.cumGross)}</div></div>
        </div>

        <h3>Itemwise breakdown</h3>
        {ipc.lines && ipc.lines.length > 0 ? (
          <table className="data-table" aria-label="IPC itemwise lines">
            <thead><tr><th>Code</th><th>Description</th><th>Unit</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {ipc.lines.map((l, i) => {
                const b = boqById.get(l.boqItemId);
                return (
                  <tr key={`${l.boqItemId}-${i}`}>
                    <td className="mono small">{b?.code ?? '—'}</td>
                    <td>{b?.description ?? l.boqItemId}{b?.billName ? <div className="muted small">Bill {b.billNo} · {b.billName}</div> : null}</td>
                    <td className="small">{b?.unit ?? '—'}</td>
                    <td className="num">{l.qty.toLocaleString('en-PK')}</td>
                    <td className="num">{l.rate.toLocaleString('en-PK')}</td>
                    <td className="num">{formatMoney(l.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}>Gross certified</td><td className="num">{formatMoney(ipc.gross)}</td></tr></tfoot>
          </table>
        ) : (
          <p className="muted small">No itemwise lines recorded for this certificate (gross was entered as a lump sum).</p>
        )}

        <h3 style={{ marginTop: 14 }}>Deduction waterfall</h3>
        <table className="data-table" aria-label="IPC detail deductions">
          <tbody>
            <tr><td>Gross certified</td><td className="num">{formatMoney(d.gross)}</td></tr>
            {d.lines.map((l) => (<tr key={l.label}><td>{l.label}{l.pct ? ` (${l.pct}%)` : ''}</td><td className="num neg">− {formatMoney(l.amount)}</td></tr>))}
          </tbody>
          <tfoot><tr><td>Net payable</td><td className="num">{formatMoney(d.net)}</td></tr></tfoot>
        </table>

        <h3 style={{ marginTop: 14 }}>Sub-recoveries applied</h3>
        {links.length === 0 ? (
          <p className="muted small">No RAR recoveries linked to this IPC.</p>
        ) : (
          <table className="data-table" aria-label="IPC recovery links">
            <thead><tr><th>RAR</th><th className="num">Amount</th></tr></thead>
            <tbody>{links.map((l) => (<tr key={l.id}><td>{rarNo(l.rarId)}</td><td className="num">{formatMoney(l.amount)}</td></tr>))}</tbody>
            <tfoot><tr><td>Total recovered</td><td className="num">{formatMoney(recovered)}</td></tr></tfoot>
          </table>
        )}

        <div style={{ marginTop: 14 }}><AuditTrail entity="IPC" reference={ipc.ipcNo} /></div>

        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

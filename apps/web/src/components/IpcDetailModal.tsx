import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { ipcDeductionBreakdown, deductionsFromConfig, IPC_STATUS_LABEL, DEFAULT_COMMERCIAL_CONFIG } from '../domain/ipc';
import { measurementSheet } from '../domain/measurement';
import { AuditTrail } from './AuditTrail';
import { Attachments } from './Attachments';
import type { Ipc, BoqItem, CommercialConfig } from '../data/types';

const qty = (n: number) => (n ? n.toLocaleString('en-PK', { maximumFractionDigits: 2 }) : '—');

export function IpcDetailModal({ projectId, ipc, onClose }: { projectId: string; ipc: Ipc; onClose: () => void }) {
  const { provider } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [cfg, setCfg] = useState<CommercialConfig>(DEFAULT_COMMERCIAL_CONFIG);
  const [onlyBilled, setOnlyBilled] = useState(false);

  useEffect(() => {
    let a = true;
    Promise.all([
      provider.listBoq(projectId), provider.listIpcs(projectId), provider.getCommercialConfig(projectId),
    ]).then(([b, i, c]) => {
      if (a) { setBoq(b); setIpcs(i); setCfg(c); }
    });
    return () => { a = false; };
  }, [provider, projectId, ipc.id]);

  const sheet = useMemo(() => measurementSheet(ipc, ipcs, boq, { onlyBilled }), [ipc, ipcs, boq, onlyBilled]);
  const ded = ipcDeductionBreakdown(ipc.gross, { d: deductionsFromConfig(cfg) });
  const cumPct = sheet.boqTotal > 0 ? sheet.cumGross / sheet.boqTotal : 0;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`${ipc.ipcNo} detail`} aria-modal="true">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{ipc.ipcNo} · {ipc.period}</h3>
          <span className={`status-pill st-${ipc.status}`}>{IPC_STATUS_LABEL[ipc.status]}</span>
        </div>

        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">This IPC (gross)</div><div className="kpi-value">{formatMoney(sheet.thisGross || ipc.gross)}</div></div>
          <div className="kpi"><div className="kpi-label">Previous</div><div className="kpi-value">{formatMoney(sheet.prevGross)}</div></div>
          <div className="kpi"><div className="kpi-label">Cumulative</div><div className="kpi-value">{formatMoney(sheet.cumGross || ipc.cumGross)}</div></div>
          <div className="kpi"><div className="kpi-label">Net payable</div><div className="kpi-value">{formatMoney(ded.net)}</div></div>
          <div className="kpi"><div className="kpi-label">% of BOQ</div><div className="kpi-value">{(cumPct * 100).toFixed(1)}%</div></div>
        </div>

        <div className="section-head" style={{ marginTop: 8 }}>
          <h3>Measurement — previous · this · cumulative</h3>
          <label className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyBilled} onChange={(e) => setOnlyBilled(e.target.checked)} aria-label="Only items billed in this IPC" />
            billed this IPC only
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table measure-table" aria-label="IPC measurement sheet">
            <thead>
              <tr>
                <th rowSpan={2}>Code</th><th rowSpan={2}>Description</th><th rowSpan={2} className="num">BOQ qty</th>
                <th colSpan={2} className="grp">Previous</th>
                <th colSpan={2} className="grp grp-now">This IPC</th>
                <th colSpan={2} className="grp">Cumulative</th>
                <th rowSpan={2} className="num">Balance</th><th rowSpan={2} className="num">%</th>
              </tr>
              <tr>
                <th className="num">Qty</th><th className="num">Amount</th>
                <th className="num grp-now">Qty</th><th className="num grp-now">Amount</th>
                <th className="num">Qty</th><th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.item.id} className={r.billedThis ? 'row-billed' : undefined}>
                  <td className="mono small">{r.item.code}</td>
                  <td>{r.item.description}<div className="muted small">Bill {r.item.billNo} · {r.item.billName}</div></td>
                  <td className="num small">{qty(r.boqQty)} {r.item.unit}</td>
                  <td className="num small">{qty(r.prevQty)}</td><td className="num small">{formatMoney(r.prevAmount)}</td>
                  <td className="num grp-now">{qty(r.thisQty)}</td><td className="num grp-now">{formatMoney(r.thisAmount)}</td>
                  <td className="num small">{qty(r.cumQty)}</td><td className="num">{formatMoney(r.cumAmount)}</td>
                  <td className="num small">{formatMoney(r.balanceAmount)}</td>
                  <td className="num small">{(r.pct * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totals ({sheet.rows.length} items)</td>
                <td></td><td className="num">{formatMoney(sheet.prevGross)}</td>
                <td></td><td className="num grp-now">{formatMoney(sheet.thisGross)}</td>
                <td></td><td className="num">{formatMoney(sheet.cumGross)}</td>
                <td className="num">{formatMoney(sheet.boqTotal - sheet.cumGross)}</td><td className="num">{(cumPct * 100).toFixed(0)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <h3 style={{ marginTop: 14 }}>Deduction waterfall (client billing)</h3>
        <table className="data-table" aria-label="IPC detail deductions">
          <tbody>
            <tr><td>Gross certified (this IPC)</td><td className="num">{formatMoney(ded.gross)}</td></tr>
            <tr><td>Less retention @ {ded.retentionPct}%</td><td className="num neg">- {formatMoney(ded.retention)}</td></tr>
            <tr><td>Less income tax @ {ded.incomeTaxPct}%</td><td className="num neg">- {formatMoney(ded.incomeTax)}</td></tr>
            {ded.gstPct > 0 && <tr><td>Less GST / stamp @ {ded.gstPct}%</td><td className="num neg">- {formatMoney(ded.gst)}</td></tr>}
          </tbody>
          <tfoot><tr><td>Net payable</td><td className="num">{formatMoney(ded.net)}</td></tr></tfoot>
        </table>

        <div style={{ marginTop: 14 }}><Attachments projectId={projectId} entity="IPC" reference={ipc.ipcNo} /></div>
        <div style={{ marginTop: 14 }}><AuditTrail entity="IPC" reference={ipc.ipcNo} /></div>

        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

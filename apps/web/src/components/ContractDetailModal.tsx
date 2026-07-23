import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { contractBoqView } from '../domain/contractBoqView';
import { RAR_STATUS_LABEL } from '../domain/rar';
import { AuditTrail } from './AuditTrail';
import type { Contract, BoqItem, ProgressUpdate, Rar, Subcontractor } from '../data/types';

const STATUS_LABEL: Record<Contract['status'], string> = {
  draft: 'Draft', awarded: 'Awarded', in_progress: 'In progress', completed: 'Completed', closed: 'Closed',
};

export function ContractDetailModal({ projectId, contract, onClose }: { projectId: string; contract: Contract; onClose: () => void }) {
  const { provider } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);

  useEffect(() => {
    let on = true;
    Promise.all([
      provider.listBoq(projectId), provider.listProgress(projectId),
      provider.listRars(projectId), provider.listSubcontractors(projectId),
    ]).then(([b, p, r, s]) => { if (on) { setBoq(b); setProgress(p); setRars(r); setSubs(s); } });
    return () => { on = false; };
  }, [provider, projectId, contract.id]);

  const subName = subs.find((s) => s.id === contract.subcontractorId)?.name ?? '—';
  const myRars = useMemo(() => rars.filter((r) => r.contractId === contract.id), [rars, contract.id]);

  const execByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of progress) m.set(p.boqItemId, (m.get(p.boqItemId) ?? 0) + p.executedQty);
    return m;
  }, [progress]);

  // The contract's OWN BOQ: its lines at its sublet rates. Pricing this at the
  // client rate would misstate the contract in the place a user checks it.
  const view = useMemo(() => contractBoqView(contract, boq, rars), [contract, boq, rars]);
  const rows = view.rows;
  const executedTotal = useMemo(
    () => rows.reduce((a, r) => a + Math.min(execByItem.get(r.boqItemId) ?? 0, r.subletQty) * r.subletRate, 0),
    [rows, execByItem],
  );
  const billedTotal = view.billedTotal;
  const retentionPct = Math.min(5, contract.retentionPct ?? 5);
  const retentionHeld = myRars.reduce((a, r) => a + r.gross, 0) * retentionPct / 100;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`${contract.contractNo} detail`} aria-modal="true">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{contract.contractNo} · {contract.title}</h3>
          <span className={`status-pill st-${contract.status}`}>{STATUS_LABEL[contract.status]}</span>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          {subName} · scope {contract.scopeBills.length ? `bills ${contract.scopeBills.join(', ')}` : 'full BOQ'} · retention {retentionPct}%
        </p>

        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">Contract value</div><div className="kpi-value">{formatMoney(view.subletValue)}</div><div className="muted small">{view.lineBased ? 'sum of sublet lines' : 'as recorded'}</div></div>
          {view.lineBased && <div className="kpi"><div className="kpi-label">Revenue at client rates</div><div className="kpi-value">{formatMoney(view.clientValue)}</div><div className="muted small">same quantities, BOQ rates</div></div>}
          {view.lineBased && <div className="kpi"><div className="kpi-label">Margin</div><div className={`kpi-value ${view.margin < 0 ? 'neg' : ''}`}>{formatMoney(view.margin)}</div><div className="muted small">{view.marginPct.toFixed(2)}%</div></div>}
          <div className="kpi"><div className="kpi-label">Executed</div><div className="kpi-value">{formatMoney(executedTotal)}</div><div className="muted small">at sublet rates</div></div>
          <div className="kpi"><div className="kpi-label">RAR-billed</div><div className="kpi-value">{formatMoney(billedTotal)}</div></div>
          <div className="kpi"><div className="kpi-label">Balance to bill</div><div className="kpi-value">{formatMoney(view.balanceTotal)}</div></div>
          <div className="kpi"><div className="kpi-label">Retention held</div><div className="kpi-value">{formatMoney(retentionHeld)}</div></div>
        </div>

        {view.storedValueMismatch && (
          <div className="card" style={{ borderColor: 'var(--warning)', marginTop: 8 }} aria-label="Contract value mismatch">
            <strong className="neg">The stored contract value does not match its lines.</strong>
            <div className="muted small">
              Recorded {formatMoney(view.storedValueMismatch.stored)}, but the lines sum to{' '}
              {formatMoney(view.storedValueMismatch.derived)}. This happens when a contract was written by an earlier build
              that priced lines at the client rate. Revise the BOQ to correct it — the figures above use the lines.
            </div>
          </div>
        )}

        <div className="section-head" style={{ marginTop: 8 }}>
          <h3>Contractor Bill of Quantities</h3>
          <span className="muted small">
            {view.lineBased
              ? `${rows.length} sublet line(s) · quantities and rates as awarded to this subcontractor`
              : 'legacy contract — no sublet BOQ recorded, showing the scope bills at client rates'}
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table measure-table" aria-label="Contractor BOQ">
            <thead><tr>
              <th>Code</th><th>Description</th>
              <th className="num">{view.lineBased ? 'Sublet qty' : 'Qty'}</th><th>Unit</th>
              <th className="num">{view.lineBased ? 'Sublet rate' : 'Rate'}</th>
              <th className="num">{view.lineBased ? 'Sublet amount' : 'BOQ amount'}</th>
              {view.lineBased && <th className="num muted" title="The client BOQ rate, for reference">Client rate</th>}
              {view.lineBased && <th className="num">Margin</th>}
              <th className="num" title={view.lineBased ? 'Executed quantity valued at the sublet rate' : 'Executed at BOQ rates'}>Executed</th>
              <th className="num">RAR-billed</th><th className="num">Balance</th><th className="num">%</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.boqItemId} className={r.billed > 0 ? 'row-billed' : undefined}>
                  <td className="mono small">{r.code}</td>
                  <td>{r.description}<div className="muted small">Bill {r.billNo} · {r.billName}</div></td>
                  <td className="num small">{r.subletQty.toLocaleString('en-PK')}</td>
                  <td className="small">{r.unit}</td>
                  <td className="num small">{r.subletRate.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</td>
                  <td className="num">{formatMoney(r.subletAmount)}</td>
                  {view.lineBased && <td className="num small muted">{r.clientRate.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</td>}
                  {view.lineBased && <td className={`num small ${r.negative ? 'neg' : ''}`}>{formatMoney(r.margin)}{r.negative ? ' ⚠' : ''}</td>}
                  <td className="num small">{formatMoney(Math.min(execByItem.get(r.boqItemId) ?? 0, r.subletQty) * r.subletRate)}</td>
                  <td className="num">{formatMoney(r.billed)}</td>
                  <td className="num small">{formatMoney(r.balance)}</td>
                  <td className="num small">{r.pct.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={5}>Totals ({rows.length} items)</td>
              <td className="num">{formatMoney(view.subletValue)}</td>
              {view.lineBased && <td className="num muted small">at client rates</td>}
              {view.lineBased && <td className={`num ${view.margin < 0 ? 'neg' : ''}`}>{formatMoney(view.margin)}</td>}
              <td className="num">{formatMoney(executedTotal)}</td>
              <td className="num">{formatMoney(billedTotal)}</td>
              <td className="num">{formatMoney(view.balanceTotal)}</td>
              <td className="num">{view.subletValue > 0 ? ((billedTotal / view.subletValue) * 100).toFixed(0) : '0'}%</td>
            </tr></tfoot>
          </table>
        </div>

        <h3 style={{ marginTop: 14 }}>RARs under this contract</h3>
        {myRars.length === 0 ? (
          <p className="muted small">No RARs billed under this contract yet.</p>
        ) : (
          <table className="data-table" aria-label="Contract RARs">
            <thead><tr><th>RAR</th><th>Period</th><th>Status</th><th className="num">Gross</th><th className="num">Net payable</th></tr></thead>
            <tbody>
              {myRars.map((r) => (
                <tr key={r.id}><td className="mono small">{r.rarNo}</td><td className="small">{r.period}</td>
                  <td className="small">{RAR_STATUS_LABEL[r.status]}</td>
                  <td className="num">{formatMoney(r.gross)}</td><td className="num">{formatMoney(r.netPayable)}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14 }}><AuditTrail entity="Contract" reference={contract.contractNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

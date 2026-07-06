import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
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
  const [onlyScope, setOnlyScope] = useState(true);

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

  const billedByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of myRars) for (const l of r.lines ?? []) m.set(l.boqItemId, (m.get(l.boqItemId) ?? 0) + l.amount);
    return m;
  }, [myRars]);

  const inScope = (b: BoqItem) => !contract.scopeBills.length || contract.scopeBills.includes(b.billNo);
  const rows = useMemo(() => boq.filter((b) => (onlyScope ? inScope(b) : true)).map((item) => {
    const execQty = execByItem.get(item.id) ?? 0;
    const executedValue = execQty * item.rate;
    const billed = billedByItem.get(item.id) ?? 0;
    return { item, execQty, executedValue, billed, balance: item.amount - billed, pct: item.amount > 0 ? billed / item.amount : 0 };
  }), [boq, onlyScope, execByItem, billedByItem, contract.scopeBills]);

  const scopeValue = rows.reduce((a, r) => a + r.item.amount, 0);
  const executedTotal = rows.reduce((a, r) => a + r.executedValue, 0);
  const billedTotal = rows.reduce((a, r) => a + r.billed, 0);
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
          <div className="kpi"><div className="kpi-label">Contract value</div><div className="kpi-value">{formatMoney(contract.value)}</div></div>
          <div className="kpi"><div className="kpi-label">Scope BOQ value</div><div className="kpi-value">{formatMoney(scopeValue)}</div></div>
          <div className="kpi"><div className="kpi-label">Executed</div><div className="kpi-value">{formatMoney(executedTotal)}</div></div>
          <div className="kpi"><div className="kpi-label">RAR-billed</div><div className="kpi-value">{formatMoney(billedTotal)}</div></div>
          <div className="kpi"><div className="kpi-label">Retention held</div><div className="kpi-value">{formatMoney(retentionHeld)}</div></div>
        </div>

        <div className="section-head" style={{ marginTop: 8 }}>
          <h3>Contractor Bill of Quantities</h3>
          <label className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyScope} onChange={(e) => setOnlyScope(e.target.checked)} aria-label="Scope bills only" />
            scope bills only
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table measure-table" aria-label="Contractor BOQ">
            <thead><tr>
              <th>Code</th><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th>
              <th className="num">BOQ amount</th><th className="num">Executed</th><th className="num">RAR-billed</th><th className="num">Balance</th><th className="num">%</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item.id} className={r.billed > 0 ? 'row-billed' : undefined}>
                  <td className="mono small">{r.item.code}</td>
                  <td>{r.item.description}<div className="muted small">Bill {r.item.billNo} · {r.item.billName}</div></td>
                  <td className="num small">{r.item.qty.toLocaleString('en-PK')}</td>
                  <td className="small">{r.item.unit}</td>
                  <td className="num small">{r.item.rate.toLocaleString('en-PK')}</td>
                  <td className="num">{formatMoney(r.item.amount)}</td>
                  <td className="num small">{formatMoney(r.executedValue)}</td>
                  <td className="num">{formatMoney(r.billed)}</td>
                  <td className="num small">{formatMoney(r.balance)}</td>
                  <td className="num small">{(r.pct * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td colSpan={5}>Totals ({rows.length} items)</td>
              <td className="num">{formatMoney(scopeValue)}</td>
              <td className="num">{formatMoney(executedTotal)}</td>
              <td className="num">{formatMoney(billedTotal)}</td>
              <td className="num">{formatMoney(scopeValue - billedTotal)}</td>
              <td className="num">{scopeValue > 0 ? ((billedTotal / scopeValue) * 100).toFixed(0) : '0'}%</td>
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

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { contractBoqView } from '../domain/contractBoqView';
import { RAR_STATUS_LABEL } from '../domain/rar';
import { AuditTrail } from './AuditTrail';
import { DetailDrawer, ProgressMeter, type DrawerTab } from './DetailDrawer';
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

  const pillClass = contract.status === 'closed' || contract.status === 'completed' ? 'st-completed'
    : contract.status === 'draft' ? 'st-draft' : 'st-awarded';
  const billedPct = view.subletValue > 0 ? (billedTotal / view.subletValue) * 100 : 0;

  const hero = (
    <div className="kpi-row">
      <div className="kpi-card"><div className="kpi-label">Contract value</div>
        <div className="kpi-value">{formatMoney(view.subletValue)}</div>
        <div className="muted small">{view.lineBased ? 'sum of sublet lines' : 'as recorded'}</div></div>
      {view.lineBased && <div className="kpi-card"><div className="kpi-label">Revenue at client rates</div>
        <div className="kpi-value">{formatMoney(view.clientValue)}</div>
        <div className="muted small">same quantities, BOQ rates</div></div>}
      {view.lineBased && <div className="kpi-card"><div className="kpi-label">Margin</div>
        <div className={`kpi-value ${view.margin < 0 ? 'neg' : ''}`}>{formatMoney(view.margin)}</div>
        <div className="muted small">{view.marginPct.toFixed(2)}%</div></div>}
      <div className="kpi-card"><div className="kpi-label">Billed to date</div>
        <div className="kpi-value">{formatMoney(billedTotal)}</div>
        <div style={{ marginTop: 6 }}><ProgressMeter pct={billedPct} tone={billedPct > 100 ? 'danger' : 'good'} /></div></div>
      <div className="kpi-card"><div className="kpi-label">Retention held</div>
        <div className="kpi-value">{formatMoney(retentionHeld)}</div>
        <div className="muted small">{retentionPct}% of gross</div></div>
    </div>
  );

  const boqTab = (
    <>
      {view.storedValueMismatch && (
        <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: 12 }} aria-label="Contract value mismatch">
          <strong className="neg">The stored contract value does not match its lines.</strong>
          <div className="muted small">
            Recorded {formatMoney(view.storedValueMismatch.stored)}, but the lines sum to{' '}
            {formatMoney(view.storedValueMismatch.derived)}. Revise the BOQ to correct it — the figures here use the lines.
          </div>
        </div>
      )}
      <div className="muted small" style={{ marginBottom: 8 }}>
        {view.lineBased
          ? `${rows.length} sublet line(s) · quantities and rates as awarded to this subcontractor`
          : 'legacy contract — no sublet BOQ recorded, showing the scope bills at client rates'}
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
            <th className="num">Executed</th><th className="num">RAR-billed</th><th style={{ minWidth: 90 }}>Progress</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const exec = Math.min(execByItem.get(r.boqItemId) ?? 0, r.subletQty) * r.subletRate;
              return (
                <tr key={r.boqItemId} className={r.billed > 0 ? 'row-billed' : undefined}>
                  <td className="mono small">{r.code}</td>
                  <td>{r.description}<div className="muted small">Bill {r.billNo} · {r.billName}</div></td>
                  <td className="num small">{r.subletQty.toLocaleString('en-PK')}</td>
                  <td className="small">{r.unit}</td>
                  <td className="num small">{r.subletRate.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</td>
                  <td className="num">{formatMoney(r.subletAmount)}</td>
                  {view.lineBased && <td className="num small muted">{r.clientRate.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</td>}
                  {view.lineBased && <td className={`num small ${r.negative ? 'neg' : ''}`}>{formatMoney(r.margin)}{r.negative ? ' \u26a0' : ''}</td>}
                  <td className="num small">{formatMoney(exec)}</td>
                  <td className="num">{formatMoney(r.billed)}</td>
                  <td><ProgressMeter pct={r.pct} tone={r.pct > 100 ? 'danger' : r.pct > 0 ? 'good' : 'primary'} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr>
            <td colSpan={5}>Totals ({rows.length} items)</td>
            <td className="num">{formatMoney(view.subletValue)}</td>
            {view.lineBased && <td className="num muted small">at client rates</td>}
            {view.lineBased && <td className={`num ${view.margin < 0 ? 'neg' : ''}`}>{formatMoney(view.margin)}</td>}
            <td className="num">{formatMoney(executedTotal)}</td>
            <td className="num">{formatMoney(billedTotal)}</td>
            <td><ProgressMeter pct={billedPct} tone={billedPct > 100 ? 'danger' : 'good'} /></td>
          </tr></tfoot>
        </table>
      </div>
    </>
  );

  const rarsTab = (
    myRars.length === 0 ? <p className="muted small">No RARs billed under this contract yet.</p> : (
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
    )
  );

  const tabs: DrawerTab[] = [
    { id: 'boq', label: 'Bill of Quantities', badge: rows.length, content: boqTab },
    { id: 'rars', label: 'RARs', badge: myRars.length, content: rarsTab },
    { id: 'audit', label: 'History', content: <AuditTrail entity="Contract" reference={contract.contractNo} /> },
  ];

  return (
    <DetailDrawer
      title={contract.contractNo}
      subtitle={`${contract.title} · ${subName} · scope ${contract.scopeBills.length ? `bills ${contract.scopeBills.join(', ')}` : 'full BOQ'} · retention ${retentionPct}%`}
      pill={<span className={`status-pill ${pillClass}`}>{STATUS_LABEL[contract.status]}</span>}
      hero={hero}
      tabs={tabs}
      onClose={onClose}
    />
  );
}

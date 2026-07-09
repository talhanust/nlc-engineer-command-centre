import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { ExportMenu } from '../../components/ExportMenu';
import { formatMoney } from '../../domain/money';
import {
  buildBoqRows, groupBoq, filterBoqRows, boqTotals,
  MODE_LABEL, STATUS_LABEL, type BoqRow,
} from '../../domain/boqrollup';
import type { BoqItem, Distribution, ProgressUpdate, Ipc } from '../../data/types';
import { ipcVettedPaidByItem } from '../../domain/ipc';
import { BoqImport } from './BoqImport';
import { BoqWorkflowStrip } from '../../components/BoqWorkflowStrip';

const num = (n: number) => n.toLocaleString('en-PK');
const money = (n: number) => (n > 0 ? formatMoney(n) : '—');

import { BaselineLockBanner } from '../../components/BaselineLockBanner';

export function BoqRegister({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [dists, setDists] = useState<Distribution[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [importing, setImporting] = useState(false);
  const [baselineLocked, setBaselineLocked] = useState(false);
  const [workflowLocked, setWorkflowLocked] = useState(false);
  const locked = baselineLocked || workflowLocked;
  const [search, setSearch] = useState('');
  const [bill, setBill] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let alive = true;
    void Promise.all([
      provider.listBoq(projectId),
      provider.listDistributions(projectId),
      provider.listProgress(projectId),
      provider.listIpcs(projectId),
    ]).then(([b, d, p, i]) => { if (alive) { setItems(b); setDists(d); setProgress(p); setIpcs(i); } });
    return () => { alive = false; };
  }, [provider, projectId]);

  const vp = useMemo(() => ipcVettedPaidByItem(ipcs), [ipcs]);
  const allRows = useMemo(() => buildBoqRows(items, dists, progress, vp), [items, dists, progress, vp]);
  const rows = useMemo(() => filterBoqRows(allRows, { search, bill, status }), [allRows, search, bill, status]);
  const bills = useMemo(() => groupBoq(rows), [rows]);
  const grand = useMemo(() => boqTotals(rows), [rows]);
  const billNos = useMemo(() => Array.from(new Set(items.map((i) => i.billNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [items]);

  return (
    <div>
      <BaselineLockBanner projectId={projectId} kind="boq" onChange={setBaselineLocked} />
      <BoqWorkflowStrip projectId={projectId} onChange={setWorkflowLocked} />
      <div className="section-head">
        <div>
          <h3>Bill of Quantities</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Read-only contract baseline · {items.length} items across {billNos.length} bills · Executed/Vetted/Paid populate from the IPC pipeline
          </p>
        </div>
        <div className="muted">
          <button className="btn-ghost" disabled={locked} title={locked ? 'BOQ is locked — raise a variation order to edit' : ''} onClick={() => setImporting(true)}>Import</button>
          <span style={{ marginLeft: 6, display: 'inline-block' }}>
            <ExportMenu
              filename={`${projectId.replace('proj-', '')}-boq`}
              title="Bill of Quantities"
              meta={[['Items', String(allRows.length)], ['Total', formatMoney(grand.amount)]]}
              columns={[
                { label: 'Bill' }, { label: 'Section' }, { label: 'Code' }, { label: 'Description' }, { label: 'Unit' },
                { label: 'Contract Qty', align: 'right' }, { label: 'Rate', align: 'right' }, { label: 'Amount', align: 'right' },
                { label: 'Mode' }, { label: 'Executed Qty', align: 'right' }, { label: 'Executed Value', align: 'right' }, { label: '% Complete', align: 'right' },
              ]}
              rows={allRows.map((r) => [r.item.billNo, r.item.section ?? '', r.item.code, r.item.description, r.item.unit, r.item.qty, r.item.rate, Math.round(r.item.amount), MODE_LABEL[r.mode], r.executedQty, Math.round(r.executedValue), `${Math.round(r.pct * 100)}%`])}
            />
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="muted">No BOQ yet. Use Import to paste a CSV/TSV bill of quantities.</p>
      ) : (
        <>
          <div className="filter-bar card" role="group" aria-label="BOQ filters">
            <input className="input" aria-label="Search BOQ" placeholder="Search description, code, section…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Bill filter" value={bill} onChange={(e) => setBill(e.target.value)}>
              <option value="all">All bills</option>
              {billNos.map((b) => <option key={b} value={b}>Bill {b}</option>)}
            </select>
            <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All status</option>
              <option value="unassigned">Unassigned</option>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
            <span className="muted small filter-count">{rows.length} of {allRows.length} items</span>
          </div>

          <div className="table-wrap">
            <table className="data-table boq-table" aria-label="Bill of Quantities">
              <thead>
                <tr>
                  <th>Item ref</th><th>Description</th><th>Unit</th>
                  <th className="num">Contract qty</th><th className="num">Rate</th><th className="num">Amount</th>
                  <th>Mode</th>
                  <th className="num">Executed</th><th className="num">Vetted</th><th className="num">Paid</th><th className="num">Receivable</th>
                  <th className="num">Status</th>
                </tr>
              </thead>
              {bills.map((b) => (
                <tbody key={b.billNo}>
                  <tr className="boq-bill-row">
                    <td colSpan={5}><strong>Bill #{b.billNo} — {b.billName}</strong></td>
                    <td className="num"><strong>{formatMoney(b.totals.amount)}</strong></td>
                    <td />
                    <td className="num">{money(b.totals.executedValue)}</td>
                    <td className="num">{money(b.totals.vettedValue)}</td>
                    <td className="num">{money(b.totals.paidValue)}</td>
                    <td className="num">{money(b.totals.receivableValue)}</td>
                    <td />
                  </tr>
                  {b.sections.map((s) => (
                    <BoqSection key={`${b.billNo}-${s.section}`} section={s.section} rows={s.rows} />
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr className="boq-total-row">
                  <td colSpan={5}><strong>Grand total · {grand.count} items</strong></td>
                  <td className="num"><strong>{formatMoney(grand.amount)}</strong></td>
                  <td />
                  <td className="num"><strong>{money(grand.executedValue)}</strong></td>
                  <td className="num"><strong>{money(grand.vettedValue)}</strong></td>
                  <td className="num"><strong>{money(grand.paidValue)}</strong></td>
                  <td className="num"><strong>{money(grand.receivableValue)}</strong></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {importing && (
        <BoqImport projectId={projectId} onClose={() => setImporting(false)} onImported={(r) => { setItems(r); setImporting(false); }} />
      )}
    </div>
  );
}

function BoqSection({ section, rows }: { section: string; rows: BoqRow[] }) {
  return (
    <>
      {section !== '—' && (
        <tr className="boq-section-row"><td colSpan={12}>{section}</td></tr>
      )}
      {rows.map((r) => (
        <tr key={r.item.id}>
          <td className="mono small">{r.item.code}</td>
          <td>{r.item.description}{r.item.revisedByVo && <span className="status-pill st-vetted" style={{ marginLeft: 6, fontSize: 10 }} title={`Revised by approved ${r.item.revisedByVo}`}>{r.item.revisedByVo}</span>}{r.item.section?.startsWith('VO ') && !r.item.revisedByVo && <span className="status-pill st-paid" style={{ marginLeft: 6, fontSize: 10 }} title="Added by variation">added</span>}</td>
          <td className="small">{r.item.unit}</td>
          <td className="num">{num(r.item.qty)}</td>
          <td className="num">{num(r.item.rate)}</td>
          <td className="num">{formatMoney(r.item.amount)}</td>
          <td><span className={`mode-badge mode-${r.mode}`}>{r.mode === 'unassigned' ? '⚠ ' : ''}{MODE_LABEL[r.mode]}</span></td>
          <td className="num">{money(r.executedValue)}</td>
          <td className="num">{money(r.vettedValue)}</td>
          <td className="num">{money(r.paidValue)}</td>
          <td className="num">{money(r.receivableValue)}</td>
          <td>
            <div className="boq-status" title={STATUS_LABEL[r.status]}>
              <span className="boq-prog" aria-hidden><span className="boq-prog-fill" style={{ width: `${Math.round(r.pct * 100)}%` }} /></span>
              <span className="boq-pct mono small">{Math.round(r.pct * 100)}%</span>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

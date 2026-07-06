import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import type { BoqItem, Distribution, ProgressUpdate, Subcontractor } from '../../data/types';

const num = (n: number) => n.toLocaleString('en-PK');
const money = (n: number) => (n > 0 ? formatMoney(n) : '—');

interface Row {
  item: BoqItem;
  party: string;
  mode: Distribution['mode'];
  allocated: number;
  executed: number;
  entryId?: string;
  entryPeriod?: string;
}

export function ExecutionTracker({ projectId, onManageDistribution }: { projectId: string; onManageDistribution?: () => void }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [dists, setDists] = useState<Distribution[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [search, setSearch] = useState('');
  const [bill, setBill] = useState('all');
  const [hideUnassigned, setHideUnassigned] = useState(true);

  async function load() {
    const [b, s, d, p] = await Promise.all([
      provider.listBoq(projectId), provider.listSubcontractors(projectId),
      provider.listDistributions(projectId), provider.listProgress(projectId),
    ]);
    setItems(b); setSubs(s); setDists(d); setProgress(p);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = (id?: string) => subs.find((s) => s.id === id)?.name ?? 'Subcontractor';
  const distByItem = useMemo(() => new Map(dists.map((d) => [d.boqItemId, d])), [dists]);
  const progByItem = useMemo(() => {
    const m = new Map<string, ProgressUpdate[]>();
    for (const p of progress) { const a = m.get(p.boqItemId) ?? []; a.push(p); m.set(p.boqItemId, a); }
    return m;
  }, [progress]);
  const billNos = useMemo(() => Array.from(new Set(items.map((i) => i.billNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [items]);

  const rows: Row[] = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((it) => (bill === 'all' || it.billNo === bill) && (!s || `${it.code} ${it.description}`.toLowerCase().includes(s)))
      .map((it) => {
        const d = distByItem.get(it.id);
        const mode = d?.mode ?? 'unassigned';
        const allocated = mode === 'unassigned' ? 0 : (d && d.allocatedQty > 0 ? d.allocatedQty : it.qty);
        const entries = progByItem.get(it.id) ?? [];
        const executed = entries.reduce((a, p) => a + p.executedQty, 0);
        const managed = entries[0];
        const party = mode === 'sublet' ? subName(d?.subcontractorId) : mode === 'self' ? 'NLC Self-execution' : 'Unassigned';
        return { item: it, party, mode, allocated, executed, entryId: managed?.id, entryPeriod: managed?.period };
      })
      .filter((r) => !hideUnassigned || r.mode !== 'unassigned');
  }, [items, distByItem, progByItem, search, bill, hideUnassigned, subs]);

  async function saveExecuted(r: Row, value: number) {
    const v = Math.max(0, value);
    if (r.entryId) await provider.upsertProgress(projectId, { id: r.entryId, boqItemId: r.item.id, period: r.entryPeriod ?? 'Cumulative', executedQty: v, role: 'qs' });
    else await provider.upsertProgress(projectId, { boqItemId: r.item.id, period: 'Cumulative', executedQty: v, role: 'qs' });
    setProgress(await provider.listProgress(projectId));
  }

  const totals = rows.reduce((a, r) => ({
    allocVal: a.allocVal + r.allocated * r.item.rate,
    execVal: a.execVal + r.executed * r.item.rate,
    balance: a.balance + Math.max(0, r.allocated - r.executed) * r.item.rate,
  }), { allocVal: 0, execVal: 0, balance: 0 });

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Execution Tracker</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Record executed quantities by Self-Execution and each Subcontractor. The cumulative total feeds the IPC pipeline.</p>
        </div>
        {onManageDistribution && <button className="btn-ghost" onClick={onManageDistribution}>⚙ Manage Distribution</button>}
      </div>

      {items.length === 0 ? (
        <p className="muted">Import a BOQ and set a distribution first.</p>
      ) : (
        <>
          <div className="filter-bar card" role="group" aria-label="Execution filters">
            <input className="input" aria-label="Search items" placeholder="Search description, code…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Bill filter" value={bill} onChange={(e) => setBill(e.target.value)}>
              <option value="all">All bills</option>
              {billNos.map((b) => <option key={b} value={b}>Bill {b}</option>)}
            </select>
            <label className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={hideUnassigned} onChange={(e) => setHideUnassigned(e.target.checked)} /> Hide unassigned
            </label>
            <span className="muted small filter-count">{rows.length} items</span>
          </div>

          <div className="table-wrap">
            <table className="data-table exec-table" aria-label="Execution tracker">
              <thead>
                <tr>
                  <th>Description / Party</th><th>Unit</th>
                  <th className="num">Allocated</th><th className="num">Rate</th><th className="num">Executed</th>
                  <th className="num">Balance</th><th className="num">Revenue</th><th className="num">Progress</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>No items match your filter.</td></tr>
                ) : rows.map((r) => {
                  const balance = Math.max(0, r.allocated - r.executed);
                  const pct = r.allocated > 0 ? Math.min(1, r.executed / r.allocated) : 0;
                  const over = r.executed > r.allocated + 1e-6;
                  return (
                    <tr key={r.item.id} className={over ? 'row-flag' : ''}>
                      <td>
                        <div>{r.item.description}</div>
                        <div className="muted small">{r.item.code} · {r.party}{over ? ' · ⚠ exceeds plan' : ''}</div>
                      </td>
                      <td className="small">{r.item.unit}</td>
                      <td className="num">{num(r.allocated)}</td>
                      <td className="num">{num(r.item.rate)}</td>
                      <td className="num"><input className="qty-input" aria-label={`Executed ${r.item.code}`} defaultValue={r.executed || ''} placeholder="0" onBlur={(e) => saveExecuted(r, Number(e.target.value) || 0)} /></td>
                      <td className={`num ${over ? 'neg' : ''}`}>{num(balance)}</td>
                      <td className="num">{money(r.executed * r.item.rate)}</td>
                      <td>
                        <div className="boq-status" title={`${Math.round(pct * 100)}%`}>
                          <span className="boq-prog" aria-hidden><span className="boq-prog-fill" style={{ width: `${Math.round(pct * 100)}%`, background: over ? 'var(--rag-red)' : undefined }} /></span>
                          <span className="boq-pct mono small">{Math.round(pct * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="boq-total-row">
                    <td colSpan={2}><strong>Totals · {rows.length} items</strong></td>
                    <td className="num"><strong>{formatMoney(totals.allocVal)}</strong></td>
                    <td /><td /><td className="num"><strong>{money(totals.balance)}</strong></td>
                    <td className="num"><strong>{money(totals.execVal)}</strong></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

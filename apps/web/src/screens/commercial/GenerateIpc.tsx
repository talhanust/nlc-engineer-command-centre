import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { ipcDeductionBreakdown, ipcClaimedQtyByItem } from '../../domain/ipc';
import type { BoqItem, Ipc, ProgressUpdate } from '../../data/types';

const num = (n: number) => n.toLocaleString('en-PK');
const money = (n: number) => (n > 0 ? formatMoney(n) : '—');

export function GenerateIpc({ projectId, onGenerated }: { projectId: string; onGenerated?: () => void }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [period, setPeriod] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bill, setBill] = useState('all');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const [b, p, i] = await Promise.all([provider.listBoq(projectId), provider.listProgress(projectId), provider.listIpcs(projectId)]);
    setItems(b); setProgress(p); setIpcs(i);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const executedByItem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of progress) m[p.boqItemId] = (m[p.boqItemId] ?? 0) + p.executedQty;
    return m;
  }, [progress]);
  const claimedByItem = useMemo(() => ipcClaimedQtyByItem(ipcs), [ipcs]);
  const billNos = useMemo(() => Array.from(new Set(items.map((i) => i.billNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [items]);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((it) => (bill === 'all' || it.billNo === bill) && (!s || `${it.code} ${it.description}`.toLowerCase().includes(s)))
      .map((it) => {
        const executed = executedByItem[it.id] ?? 0;
        const inIpc = claimedByItem[it.id] ?? 0;
        const pending = Math.max(0, executed - inIpc);
        return { item: it, executed, inIpc, pending };
      });
  }, [items, executedByItem, claimedByItem, search, bill]);

  const selectedCount = Object.values(sel).filter((q) => q > 0).length;
  const gross = useMemo(() => Object.entries(sel).reduce((a, [id, qty]) => {
    const it = items.find((x) => x.id === id);
    return a + (it ? qty * it.rate : 0);
  }, 0), [sel, items]);
  const ded = ipcDeductionBreakdown(gross);

  function setQty(id: string, qty: number) {
    setSel((prev) => ({ ...prev, [id]: Math.max(0, qty) }));
  }
  function toggle(id: string, pending: number) {
    setSel((prev) => {
      if (id in prev) { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: pending > 0 ? pending : 0 };
    });
  }
  function selectAllPending() {
    const next: Record<string, number> = {};
    for (const r of rows) if (r.pending > 0) next[r.item.id] = r.pending;
    setSel(next);
  }
  function clearAll() { setSel({}); }

  async function generate() {
    const lines = Object.entries(sel).filter(([, q]) => q > 0).map(([id, qty]) => {
      const it = items.find((x) => x.id === id)!;
      return { boqItemId: id, qty, rate: it.rate, amount: +(qty * it.rate).toFixed(2) };
    });
    if (lines.length === 0) return;
    setBusy(true);
    const created = await provider.createIpc(projectId, { period: period.trim() || date, date, gross, lines });
    setBusy(false);
    setSel({});
    await load();
    toast({ message: `${created.ipcNo} generated · ${formatMoney(gross)} gross`, kind: 'success' });
    onGenerated?.();
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Generate Interim Payment Certificate</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Select line items and quantities to claim from the Client for Consultant vetting.</p>
        </div>
        <div className="head-tools">
          <button className="btn-ghost btn-mini" onClick={selectAllPending}>Select all pending</button>
          <button className="btn-ghost btn-mini" onClick={selectAllPending} title="Claim each item's executed-but-unclaimed quantity">⚡ Suggest from progress</button>
          <button className="btn-ghost btn-mini" onClick={clearAll}>Clear</button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <>
          <div className="filter-bar card" role="group" aria-label="IPC setup">
            <label className="small">Period <input className="input" aria-label="IPC period" placeholder="e.g. Oct 2026" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
            <input type="date" aria-label="IPC date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select aria-label="Bill filter" value={bill} onChange={(e) => setBill(e.target.value)}>
              <option value="all">All bills</option>
              {billNos.map((b) => <option key={b} value={b}>Bill {b}</option>)}
            </select>
            <input className="input" aria-label="Search items" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="muted small filter-count">{selectedCount} items · {formatMoney(gross)}</span>
          </div>

          <div className="table-wrap">
            <table className="data-table ipc-gen-table" aria-label="Generate IPC">
              <thead>
                <tr>
                  <th></th><th>Description</th><th>Unit</th><th className="num">Rate</th>
                  <th className="num">Executed</th><th className="num">In IPC</th><th className="num">Pending</th>
                  <th className="num">This IPC qty</th><th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const checked = r.item.id in sel;
                  const qty = sel[r.item.id] ?? 0;
                  const over = qty > r.pending + 1e-6;
                  return (
                    <tr key={r.item.id} className={checked ? 'row-selected' : ''}>
                      <td><input type="checkbox" checked={checked} aria-label={`Select ${r.item.code}`} onChange={() => toggle(r.item.id, r.pending)} /></td>
                      <td>{r.item.description}<div className="muted small">{r.item.code}</div></td>
                      <td className="small">{r.item.unit}</td>
                      <td className="num">{num(r.item.rate)}</td>
                      <td className="num">{num(r.executed)}</td>
                      <td className="num muted">{num(r.inIpc)}</td>
                      <td className="num">{num(r.pending)}</td>
                      <td className="num">
                        <input className="qty-input" aria-label={`This IPC qty ${r.item.code}`} disabled={!checked}
                          value={checked ? qty : ''} placeholder="0"
                          onChange={(e) => setQty(r.item.id, Number(e.target.value) || 0)} />
                      </td>
                      <td className={`num ${over ? 'neg' : ''}`}>{money(qty * r.item.rate)}{over ? ' ⚠' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ipc-net card" aria-label="IPC deduction summary">
            <h4 style={{ margin: '0 0 8px' }}>This IPC · deduction to net</h4>
            <table className="kv-table">
              <tbody>
                <tr><th>Gross claimed</th><td className="num">{formatMoney(ded.gross)}</td></tr>
                <tr><th>Less retention @ {ded.retentionPct}%</th><td className="num neg">− {money(ded.retention)}</td></tr>
                <tr><th>Less income tax @ {ded.incomeTaxPct}%</th><td className="num neg">− {money(ded.incomeTax)}</td></tr>
                <tr><th>Less advance recovery</th><td className="num neg">− {money(ded.advanceRecovery)}</td></tr>
                <tr className="ipc-net-row"><th>Net payable</th><td className="num"><strong>{formatMoney(ded.net)}</strong></td></tr>
              </tbody>
            </table>
            <button className="btn" style={{ marginTop: 10 }} disabled={busy || gross <= 0} onClick={generate}>Generate IPC</button>
          </div>
        </>
      )}
    </div>
  );
}

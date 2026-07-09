import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import type { BoqItem, Distribution, Rar, Subcontractor, Contract } from '../../data/types';

const num = (n: number) => n.toLocaleString('en-PK');
const money = (n: number) => (n > 0 ? formatMoney(n) : '—');

export function GenerateRar({ projectId, onGenerated }: { projectId: string; onGenerated?: () => void }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [dists, setDists] = useState<Distribution[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractId, setContractId] = useState('');
  const [subId, setSubId] = useState('');
  const [period, setPeriod] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sel, setSel] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const [b, d, s, r, c] = await Promise.all([
      provider.listBoq(projectId), provider.listDistributions(projectId), provider.listSubcontractors(projectId), provider.listRars(projectId), provider.listContracts(projectId),
    ]);
    setBoq(b); setDists(d); setSubs(s); setRars(r); setContracts(c);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const rateOf = useMemo(() => new Map(boq.map((b) => [b.id, b.rate])), [boq]);
  const itemOf = useMemo(() => new Map(boq.map((b) => [b.id, b])), [boq]);

  // qty already billed to this contractor per BoQ item across prior RAR lines
  const billedByItem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rars) if (r.subcontractorId === subId) for (const ln of r.lines ?? []) m[ln.boqItemId] = (m[ln.boqItemId] ?? 0) + ln.qty;
    return m;
  }, [rars, subId]);

  const rows = useMemo(() => {
    if (!subId) return [];
    return dists
      .filter((d) => d.mode === 'sublet' && d.subcontractorId === subId)
      .map((d) => {
        const item = itemOf.get(d.boqItemId);
        const rate = rateOf.get(d.boqItemId) ?? 0;
        const billed = billedByItem[d.boqItemId] ?? 0;
        const pending = Math.max(0, d.allocatedQty - billed);
        return { boqItemId: d.boqItemId, item, rate, allocated: d.allocatedQty, billed, pending };
      })
      .filter((r) => r.item);
  }, [dists, subId, itemOf, rateOf, billedByItem]);

  const gross = useMemo(() => Object.entries(sel).reduce((a, [id, qty]) => a + qty * (rateOf.get(id) ?? 0), 0), [sel, rateOf]);
  const count = Object.values(sel).filter((q) => q > 0).length;

  function setQty(id: string, qty: number) { setSel((prev) => ({ ...prev, [id]: Math.max(0, qty) })); }
  function toggle(id: string, pending: number) {
    setSel((prev) => { if (id in prev) { const n = { ...prev }; delete n[id]; return n; } return { ...prev, [id]: pending }; });
  }
  function billAllPending() { const n: Record<string, number> = {}; for (const r of rows) if (r.pending > 0) n[r.boqItemId] = r.pending; setSel(n); }

  async function generate() {
    const lines = Object.entries(sel).filter(([, q]) => q > 0).map(([id, qty]) => ({ boqItemId: id, qty, rate: rateOf.get(id) ?? 0, amount: +(qty * (rateOf.get(id) ?? 0)).toFixed(2) }));
    if (lines.length === 0 || !subId) return;
    setBusy(true);
    const created = await provider.createRar(projectId, { period: period.trim() || date, date, subcontractorId: subId, contractId: contractId || undefined, gross, lines });
    setBusy(false);
    setSel({});
    await load();
    toast({ message: `${created.rarNo} generated · ${formatMoney(gross)} gross`, kind: 'success' });
    onGenerated?.();
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Generate Running Account Receipt (RAR)</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Bill subcontractors and labour contractors for work executed under their CA. Contractor-specific deductions apply.</p>
        </div>
      </div>

      <div className="filter-bar card" role="group" aria-label="RAR setup">
        <span className="muted small" style={{ fontWeight: 600 }}>RAR setup</span>
        <select aria-label="Select contract" value={contractId} onChange={(e) => {
          const c = contracts.find((x) => x.id === e.target.value);
          setContractId(e.target.value); setSubId(c?.subcontractorId ?? ''); setSel({});
        }}>
          <option value="">— Select contract —</option>
          {contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNo} · {subs.find((s) => s.id === c.subcontractorId)?.name ?? ''}</option>)}
        </select>
        <label className="small">Period <input className="input" aria-label="RAR period" placeholder="e.g. Oct 2026" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        <input type="date" aria-label="RAR date" value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="muted small filter-count">{count} items · {formatMoney(gross)}</span>
      </div>

      {!subId ? (
        <div className="empty-state card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40 }}>👷</div>
          <h4 style={{ margin: '8px 0 4px' }}>Select a contractor to begin</h4>
          <p className="muted small" style={{ margin: 0 }}>Choose a Subcontracted (S/C) or Labour Only (L/O) contractor from the dropdown above to see executed work eligible for RAR billing.</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="muted" style={{ padding: 16 }}>No distributed work for this contractor yet. Allocate BoQ items to them in the Distribution Planner first.</p>
      ) : (
        <>
          <div className="head-tools" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="btn-ghost btn-mini" onClick={billAllPending}>Bill all pending</button>
            <button className="btn-ghost btn-mini" onClick={() => setSel({})}>Clear</button>
          </div>
          <table className="data-table" aria-label="Generate RAR">
            <thead><tr><th></th><th>Description</th><th>Unit</th><th className="num">Rate</th><th className="num">Allocated</th><th className="num">Billed</th><th className="num">Pending</th><th className="num">This RAR qty</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const checked = r.boqItemId in sel;
                const qty = sel[r.boqItemId] ?? 0;
                const over = qty > r.pending + 1e-6;
                return (
                  <tr key={r.boqItemId} className={checked ? 'row-selected' : ''}>
                    <td><input type="checkbox" checked={checked} aria-label={`Select ${r.item!.code}`} onChange={() => toggle(r.boqItemId, r.pending)} /></td>
                    <td>{r.item!.description}<div className="muted small">{r.item!.code}</div></td>
                    <td className="small">{r.item!.unit}</td>
                    <td className="num">{num(r.rate)}</td>
                    <td className="num">{num(r.allocated)}</td>
                    <td className="num muted">{num(r.billed)}</td>
                    <td className="num">{num(r.pending)}</td>
                    <td className="num"><input className="qty-input" aria-label={`This RAR qty ${r.item!.code}`} disabled={!checked} value={checked ? qty : ''} placeholder="0" onChange={(e) => setQty(r.boqItemId, Number(e.target.value) || 0)} /></td>
                    <td className={`num ${over ? 'neg' : ''}`}>{money(qty * r.rate)}{over ? ' ⚠' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="btn" style={{ marginTop: 12 }} disabled={busy || gross <= 0} onClick={generate}>Generate RAR</button>
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { readWorkbook } from '../../domain/xlsxImport';
import { itemLocks, contractLineIssues, contractValue } from '../../domain/contractLocks';
import { matchSubletRows, type SubletImportRow } from '../../domain/subletImport';
import { contractMargin } from '../../domain/contractMargin';
import { SUBLET_TEMPLATE_AOA, SUBLET_TEMPLATE_FILENAME } from '../../domain/csvTemplates';
import { downloadText, toCsv } from '../../components/hrExport';
import type { BoqItem, Contract, ContractKind, ContractLine, Subcontractor } from '../../data/types';

type Draft = { boqItemId: string; qty: string; rate: string };
const num = (s: string): number => { const n = Number(String(s).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : 0; };

/**
 * Create a sublet or labor contract from a subcontractor's own BOQ.
 *
 * The flow is deliberately linear — contractor details, then the BOQ (uploaded or
 * typed), then review — because a contract is a commitment and the person signing
 * it should see every committed quantity before it locks. On create the contract
 * is written, the subcontractor is created if new, and each line locks its
 * quantity of the corresponding item in the distribution planner.
 */
export function NewSubletContract({ projectId, onCreated }: { projectId: string; onCreated?: (c: Contract) => void }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

  // Contractor: pick an existing one, or enter a new one.
  const [existingSubId, setExistingSubId] = useState('');
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');
  const [owner, setOwner] = useState('');
  const [cnic, setCnic] = useState('');
  const [pec, setPec] = useState('');
  const [contact, setContact] = useState('');
  const [kind, setKind] = useState<ContractKind>('sublet');
  const [title, setTitle] = useState('');
  const [retention, setRetention] = useState('5');

  const [rows, setRows] = useState<Draft[]>([]);
  const [importNote, setImportNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ackOverlap, setAckOverlap] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([provider.listBoq(projectId), provider.listSubcontractors(projectId), provider.listContracts(projectId)])
      .then(([b, s, c]) => { if (alive) { setItems(b); setSubs(s); setContracts(c); } });
    return () => { alive = false; };
  }, [provider, projectId]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const locks = useMemo(() => itemLocks(items, contracts), [items, contracts]);

  const lines: ContractLine[] = rows
    .map((r) => ({ boqItemId: r.boqItemId, qty: num(r.qty), rate: num(r.rate) }))
    .filter((l) => l.boqItemId && l.qty > 0);
  const value = contractValue(lines);
  const issues = useMemo(() => contractLineIssues(lines, items, contracts), [lines, items, contracts]);
  // Margin is worked out against the ORIGINAL BOQ: the sublet BOQ is only what we
  // pay, the project's own rate is what we earn.
  const margin = useMemo(() => contractMargin(lines, items), [lines, items]);

  async function onUpload(file: File) {
    setError(''); setImportNote('');
    try {
      const wb = await readWorkbook(file);
      const grid = wb.grids[wb.sheetNames[0]] ?? [];
      // Find a header row, then columns for code, quantity and rate.
      let headerRow = 0;
      for (let i = 0; i < Math.min(grid.length, 8); i++) {
        const joined = grid[i].join(' ').toLowerCase();
        if (/code|item/.test(joined) && /(qty|quantity)/.test(joined)) { headerRow = i; break; }
      }
      const header = (grid[headerRow] ?? []).map((c) => c.toLowerCase());
      const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
      const cCode = col('code', 'item');
      const cQty = col('qty', 'quantity');
      const cRate = col('rate', 'price');
      const cBill = col('bill');
      const cDesc = col('description', 'desc', 'particulars');
      if (cCode < 0 || cQty < 0) { setError('Could not find "code" and "quantity" columns in that file.'); return; }

      // A BOQ groups rows under a bill header, so carry the last bill down.
      let currentBill = '';
      const uploaded: SubletImportRow[] = [];
      for (const g of grid.slice(headerRow + 1)) {
        if (cBill >= 0 && String(g[cBill] ?? '').trim()) currentBill = String(g[cBill]).trim();
        const code = String(g[cCode] ?? '').trim();
        if (!code) continue;
        uploaded.push({
          bill: currentBill, code,
          qty: num(String(g[cQty] ?? '')),
          rate: cRate >= 0 ? num(String(g[cRate] ?? '')) : 0,
          description: cDesc >= 0 ? String(g[cDesc] ?? '').trim() : undefined,
        });
      }

      const res = matchSubletRows(uploaded, items);
      if (res.matched.length === 0) { setError('No rows matched a BOQ item. Check the code (and bill) columns against the project BOQ.'); return; }
      setRows(res.matched.map((m) => ({
        boqItemId: m.boqItemId, qty: String(m.qty),
        rate: String(m.rate || itemById.get(m.boqItemId)?.rate || 0),
      })));

      // Report honestly: an ambiguous code is NOT guessed at, it is reported, because
      // the wrong item here becomes the wrong commitment.
      const notes = [`Imported ${res.matched.length} line(s).`];
      if (res.ambiguous.length) {
        const list = [...new Set(res.ambiguous.map((a) => a.code))].slice(0, 5).join(', ');
        notes.push(`${res.ambiguous.length} row(s) skipped — the code matches more than one BOQ item and neither the bill nor the description tells them apart (${list}). Add a "bill" column, or correct the code in your sheet.`);
      }
      if (res.unmatched.length) {
        const list = [...new Set(res.unmatched.map((u) => u.code))].slice(0, 5).join(', ');
        notes.push(`${res.unmatched.length} row(s) skipped — no such item in this project's BOQ (${list}).`);
      }
      setImportNote(notes.join(' '));
    } catch {
      setError('Could not read that spreadsheet.');
    }
  }

  function addRow() { setRows((r) => [...r, { boqItemId: '', qty: '', rate: '' }]); }
  function setRow(i: number, patch: Partial<Draft>) {
    setRows((r) => r.map((row, j) => {
      if (j !== i) return row;
      const next = { ...row, ...patch };
      // Default the rate to the BOQ rate when an item is first chosen.
      if (patch.boqItemId && !row.rate) next.rate = String(itemById.get(patch.boqItemId)?.rate ?? '');
      return next;
    }));
  }
  function removeRow(i: number) { setRows((r) => r.filter((_, j) => j !== i)); }

  const canSubmit = lines.length > 0 && title.trim() && (existingSubId || name.trim()) && (issues.length === 0 || ackOverlap);

  async function create() {
    setBusy(true); setError('');
    try {
      const c = await provider.createSubletContract(projectId, {
        title: title.trim(),
        kind,
        subcontractorId: existingSubId || undefined,
        subcontractor: existingSubId ? undefined : { name: name.trim(), trade: trade.trim() || 'General', kind, owner: owner.trim() || undefined, cnic: cnic.trim() || undefined, pecCategory: pec.trim() || undefined, contact: contact.trim() || undefined },
        lines,
        retentionPct: num(retention),
      });
      onCreated?.(c);
      // Reset for the next contract.
      setRows([]); setTitle(''); setName(''); setTrade(''); setOwner(''); setCnic(''); setPec(''); setContact('');
      setExistingSubId(''); setAckOverlap(false); setImportNote('Contract created. Quantities are now locked in the distribution planner.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the contract.');
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) return <p className="muted">Import a BOQ before creating contracts against it.</p>;

  return (
    <div>
      <div className="section-head"><h3>New sublet / labor contract</h3>
        <span className="muted small">enter the contractor, add their BOQ, review, and create</span>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>1 · Contractor</h4>
        <div className="create-row">
          <label className="small">Type{' '}
            <select aria-label="Contract type" value={kind} onChange={(e) => setKind(e.target.value as ContractKind)}>
              <option value="sublet">Sublet</option>
              <option value="labor">Labor</option>
            </select>
          </label>
          <label className="small">Existing contractor{' '}
            <select aria-label="Existing contractor" value={existingSubId} onChange={(e) => setExistingSubId(e.target.value)}>
              <option value="">— new contractor —</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.trade})</option>)}
            </select>
          </label>
        </div>
        {!existingSubId && (
          <div className="create-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <input aria-label="Contractor name" placeholder="Contractor name *" value={name} onChange={(e) => setName(e.target.value)} />
            <input aria-label="Trade" placeholder="Trade (e.g. Earthworks)" value={trade} onChange={(e) => setTrade(e.target.value)} />
            <input aria-label="Owner" placeholder="Owner / representative" value={owner} onChange={(e) => setOwner(e.target.value)} />
            <input aria-label="CNIC" placeholder="CNIC / NTN" value={cnic} onChange={(e) => setCnic(e.target.value)} />
            <input aria-label="PEC category" placeholder="PEC category" value={pec} onChange={(e) => setPec(e.target.value)} />
            <input aria-label="Contact" placeholder="Contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        )}
        <div className="create-row" style={{ marginTop: 8 }}>
          <input aria-label="Contract title" placeholder="Contract title * (e.g. Earthworks — Zone 1)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ minWidth: 280 }} />
          <label className="small">Retention %{' '}
            <input aria-label="Retention percent" style={{ width: 56 }} value={retention} onChange={(e) => setRetention(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-head" style={{ marginTop: 0 }}><h4 style={{ margin: 0 }}>2 · Subcontractor BOQ</h4>
          <div className="head-tools">
            <label className="btn-ghost btn-mini" style={{ cursor: 'pointer' }}>
              Upload xlsx / csv
              <input type="file" accept=".xlsx,.xls,.csv" aria-label="Upload subcontractor BOQ" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ''; }} />
            </label>
            <button className="btn-ghost btn-mini" onClick={() => downloadText(SUBLET_TEMPLATE_FILENAME, toCsv(SUBLET_TEMPLATE_AOA), 'text/csv')}>Sample CSV</button>
            <button className="btn-ghost btn-mini" onClick={addRow}>+ add line</button>
          </div>
        </div>
        {importNote && <p className="muted small" style={{ marginTop: 0 }}>{importNote}</p>}
        <p className="muted small" style={{ marginTop: 0 }}>
          Only what is sublet goes here — the items, the sublet quantity and the <strong>sublet rate</strong>. Upload a
          sheet (xlsx/csv) with columns <strong>bill, code, qty, rate</strong>, or add lines by hand; any other columns are
          ignored, so your own working sheet is fine. <strong>bill</strong> matters: the same code (e.g. 401f lean concrete)
          is priced under several bills, so bill+code is what identifies the item — add <strong>description</strong> too if a
          code repeats within one bill. Margin is worked out for you against the original BOQ; leaving the rate at the BOQ
          rate means zero margin.
        </p>

        {rows.length > 0 && (
          <table className="data-table" aria-label="Contract BOQ">
            <thead><tr>
              <th>BOQ item</th><th className="num">Sublet qty</th><th className="num">BOQ qty</th><th className="num">Unallocated</th>
              <th className="num" title="The original BOQ rate — what NLC earns">BOQ rate</th>
              <th className="num" title="What the subcontractor is paid">Sublet rate</th>
              <th className="num">Amount</th>
              <th className="num" title="(BOQ rate − sublet rate) × sublet qty">Margin</th>
              <th></th>
            </tr></thead>
            <tbody>
              {rows.map((row, i) => {
                const item = itemById.get(row.boqItemId);
                const lock = row.boqItemId ? locks.get(row.boqItemId) : undefined;
                const lineM = margin.lines.find((x) => x.boqItemId === row.boqItemId);
                const qty = num(row.qty);
                // How much is free for THIS contract = BOQ qty minus what OTHER contracts hold.
                const free = lock ? lock.unallocatedQty : (item?.qty ?? 0);
                const over = item ? qty > free + 1e-6 : false;
                return (
                  <tr key={i} className={over ? 'row-flag' : ''}>
                    <td>
                      <select aria-label={`Item ${i}`} value={row.boqItemId} onChange={(e) => setRow(i, { boqItemId: e.target.value })} style={{ maxWidth: 320 }}>
                        <option value="">— select item —</option>
                        {items.map((it) => <option key={it.id} value={it.id}>{it.code} — {it.description}</option>)}
                      </select>
                    </td>
                    <td className="num"><input className="qty-input" style={{ width: 90 }} aria-label={`Qty ${i}`} value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></td>
                    <td className="num small muted">{item ? `${item.qty.toLocaleString('en-PK')} ${item.unit}` : '—'}</td>
                    <td className={`num small ${over ? 'neg' : ''}`}>{item ? `${free.toLocaleString('en-PK')} ${item.unit}` : '—'}</td>
                    <td className="num small muted">{item ? item.rate.toLocaleString('en-PK', { maximumFractionDigits: 2 }) : '—'}</td>
                    <td className="num"><input className="qty-input" style={{ width: 80 }} aria-label={`Rate ${i}`} value={row.rate} onChange={(e) => setRow(i, { rate: e.target.value })} /></td>
                    <td className="num">{formatMoney(qty * num(row.rate))}</td>
                    <td className={`num small ${lineM && lineM.negative ? 'neg' : ''}`}
                      title={lineM ? `${formatMoney(lineM.revenue)} at BOQ rate − ${formatMoney(lineM.cost)} sublet` : ''}>
                      {lineM ? `${formatMoney(lineM.margin)} (${lineM.marginPct.toFixed(1)}%)${lineM.negative ? ' ⚠' : ''}` : '—'}
                    </td>
                    <td><button className="link-btn" aria-label={`Remove line ${i}`} onClick={() => removeRow(i)}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr>
              <th>Contract value</th><th /><th /><th /><th />
              <th className="num muted small">{formatMoney(margin.revenue)} at BOQ</th>
              <th className="num">{formatMoney(value)}</th>
              <th className={`num ${margin.margin < 0 ? 'neg' : ''}`}>{formatMoney(margin.margin)} ({margin.marginPct.toFixed(1)}%)</th>
              <th />
            </tr></tfoot>
          </table>
        )}
      </div>

      {lines.length > 0 && (
        <div className="card" style={{ marginTop: 12 }} aria-label="Contract margin">
          <div className="kpi-row">
            <div className="kpi"><div className="kpi-label">Revenue at BOQ rates</div><div className="kpi-value">{formatMoney(margin.revenue)}</div><div className="muted small">original BOQ × sublet qty</div></div>
            <div className="kpi"><div className="kpi-label">Contract value</div><div className="kpi-value">{formatMoney(margin.cost)}</div><div className="muted small">sublet rate × sublet qty</div></div>
            <div className="kpi"><div className="kpi-label">Margin</div><div className={`kpi-value ${margin.margin < 0 ? 'neg' : ''}`}>{formatMoney(margin.margin)}</div><div className="muted small">{margin.marginPct.toFixed(2)}% of revenue</div></div>
          </div>
          {margin.negativeLines.length > 0 && (
            <p className="neg small" style={{ marginBottom: 0 }} role="alert">
              ⚠ {margin.negativeLines.length} line(s) priced at or above the BOQ rate — they earn nothing or lose money:{' '}
              {margin.negativeLines.slice(0, 6).map((l) => l.code).join(', ')}
              {margin.negativeLines.length > 6 ? ` +${margin.negativeLines.length - 6} more` : ''}.
            </p>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--warning)' }} aria-label="Overlap warning">
          <strong className="neg">{issues.length} item(s) would be over-committed across contracts.</strong>
          <div className="muted small">
            The quantity locked to all contractors would exceed the BOQ for:{' '}
            {issues.map((x) => `${x.itemCode} (+${x.overBy})`).join(', ')}. This is allowed — split work across contractors, or
            revise a contract — but confirm it is intended.
          </div>
          <label className="small" style={{ marginTop: 6, display: 'inline-block' }}>
            <input type="checkbox" checked={ackOverlap} onChange={(e) => setAckOverlap(e.target.checked)} aria-label="Acknowledge overlap" />{' '}
            I understand these items are over-committed.
          </label>
        </div>
      )}

      {error && <p className="neg small" role="alert" style={{ marginTop: 8 }}>{error}</p>}

      <div className="create-row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={create} disabled={!canSubmit || busy}>
          {busy ? 'Creating…' : `Create contract · ${formatMoney(value)}`}
        </button>
        {!canSubmit && lines.length > 0 && issues.length > 0 && !ackOverlap && <span className="muted small">acknowledge the overlap to continue</span>}
      </div>
    </div>
  );
}

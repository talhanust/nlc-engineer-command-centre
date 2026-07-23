import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { readWorkbook } from '../../domain/xlsxImport';
import { itemLocks, contractLineIssues, contractValue } from '../../domain/contractLocks';
import { matchSubletRows, parseSubletGrid, rowKey, type SkippedRow, type SubletImportResult } from '../../domain/subletImport';
import { ImportReconciliation } from '../../components/ImportReconciliation';
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
  const [recon, setRecon] = useState<SubletImportResult | null>(null);
  const [uploadedRows, setUploadedRows] = useState<ReturnType<typeof parseSubletGrid>['rows']>([]);
  const [resolutions, setResolutions] = useState<Map<string, string>>(new Map());
  const [fileName, setFileName] = useState('');
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
  // A line without a sublet rate is incomplete, not free: it is excluded from the
  // value and the margin (counting it would read as 100% margin) and it blocks
  // creation until priced.
  const pricedLines = lines.filter((l) => l.rate > 0);
  const unpriced = lines.length - pricedLines.length;
  const value = contractValue(pricedLines);
  const issues = useMemo(() => contractLineIssues(lines, items, contracts), [lines, items, contracts]);
  // Margin is worked out against the ORIGINAL BOQ: the sublet BOQ is only what we
  // pay, the project's own rate is what we earn.
  const margin = useMemo(() => contractMargin(pricedLines, items), [pricedLines, items]);

  async function onUpload(file: File) {
    setError(''); setImportNote(''); setRecon(null); setResolutions(new Map());
    try {
      const wb = await readWorkbook(file);
      const grid = wb.grids[wb.sheetNames[0]] ?? [];
      const { rows: uploaded, error: parseErr } = parseSubletGrid(grid);
      if (parseErr) { setError(parseErr); return; }

      setUploadedRows(uploaded);
      const res = matchSubletRows(uploaded, items);
      setRecon(res);
      if (res.matched.length === 0) {
        setError('No rows matched a BOQ item. Check the code (and bill) columns against the project BOQ.');
        return;
      }
      // A missing rate stays EMPTY — never backfilled from the client rate.
      setRows(res.matched.map((m) => ({
        boqItemId: m.boqItemId, qty: String(m.qty), rate: m.rate > 0 ? String(m.rate) : '',
      })));
      setImportNote(`Imported ${res.matched.length} line(s).`);
    } catch {
      setError('Could not read that spreadsheet.');
    }
  }

  function addRow() { setRows((r) => [...r, { boqItemId: '', qty: '', rate: '' }]); }
  function setRow(i: number, patch: Partial<Draft>) {
    setRows((r) => r.map((row, j) => {
      if (j !== i) return row;
      // The rate here is what the SUBCONTRACTOR is paid. It is never defaulted from
      // the BOQ (client) rate: pre-filling it would silently produce a contract that
      // pays away the whole client rate — zero margin — while looking like a
      // deliberately negotiated figure. It must be entered or uploaded.
      return { ...row, ...patch };
    }));
  }
  function removeRow(i: number) { setRows((r) => r.filter((_, j) => j !== i)); }

  const canSubmit = pricedLines.length > 0 && unpriced === 0 && title.trim() && (existingSubId || name.trim()) && (issues.length === 0 || ackOverlap);

  function resolve(row: SkippedRow, boqItemId: string) {
    const next = new Map(resolutions);
    if (boqItemId) next.set(rowKey(row), boqItemId); else next.delete(rowKey(row));
    setResolutions(next);
    const res = matchSubletRows(uploadedRows, items, next);
    setRecon(res);
    setRows(res.matched.map((m) => ({
      boqItemId: m.boqItemId, qty: String(m.qty), rate: m.rate > 0 ? String(m.rate) : '',
    })));
  }

  async function create() {
    setBusy(true); setError('');
    try {
      const c = await provider.createSubletContract(projectId, {
        title: title.trim(),
        kind,
        subcontractorId: existingSubId || undefined,
        subcontractor: existingSubId ? undefined : { name: name.trim(), trade: trade.trim() || 'General', kind, owner: owner.trim() || undefined, cnic: cnic.trim() || undefined, pecCategory: pec.trim() || undefined, contact: contact.trim() || undefined },
        lines: pricedLines,
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
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); void onUpload(f); } e.target.value = ''; }} />
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
          code repeats within one bill. The rate you enter is the <strong>sublet rate</strong> — what this subcontractor is paid. It is never pre-filled from
          the client rate; margin is then worked out for you against the original BOQ.
        </p>

        {rows.length > 0 && (
          <table className="data-table" aria-label="Contract BOQ">
            <thead><tr>
              <th>BOQ item</th><th className="num">Sublet qty</th><th className="num">BOQ qty</th><th className="num">Unallocated</th>
              <th className="num muted" title="Reference only — the original BOQ (client) rate NLC is paid. Not editable here.">Client rate (ref)</th>
              <th className="num" title="What THIS subcontractor is paid — the contract rate">Sublet rate *</th>
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
                    <td className="num">
                      <input className={`qty-input ${num(row.rate) <= 0 && row.boqItemId ? 'input-flag' : ''}`} style={{ width: 90 }}
                        aria-label={`Sublet rate ${i}`} placeholder="sublet rate" value={row.rate}
                        onChange={(e) => setRow(i, { rate: e.target.value })} />
                    </td>
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

      {recon && <ImportReconciliation result={recon} fileName={fileName} items={items} resolutions={resolutions} onResolve={resolve} />}

      {unpriced > 0 && (
        <div className="card" style={{ marginTop: 12, borderColor: 'var(--danger)' }} aria-label="Unpriced lines">
          <strong className="neg">{unpriced} line(s) have no sublet rate.</strong>
          <div className="muted small">
            Enter the rate agreed with this subcontractor for each. It is deliberately not pre-filled from the client rate —
            paying the client rate would leave no margin.
          </div>
        </div>
      )}

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

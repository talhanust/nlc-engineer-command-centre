import { useMemo, useRef, useState } from 'react';
import { useData } from '../../data/DataContext';
import { parseBoqPaste, itemAmount, type ParsedRow } from '../../domain/boq';
import { BOQ_TEMPLATE_AOA, BOQ_TEMPLATE_FILENAME } from '../../domain/csvTemplates';
import { downloadText, toCsv } from '../../components/hrExport';
import { readWorkbook, detectHeaderRow, autoMapColumns, gridToRows, mapIsValid, MAP_FIELDS, type Workbook, type ColumnMap } from '../../domain/xlsxImport';
import { formatMoney } from '../../domain/money';
import type { BoqItem } from '../../data/types';

const SAMPLE = 'bill,code,description,unit,qty,rate\n1,I-101,Site clearance,Sqm,45000,85';
type Mode = 'file' | 'paste';

export function BoqImport({ projectId, onClose, onImported }: {
  projectId: string; onClose: () => void; onImported: (rows: BoqItem[]) => void;
}) {
  const { provider } = useData();
  const [mode, setMode] = useState<Mode>('file');
  const fileRef = useRef<HTMLInputElement>(null);

  // --- file mode state ---
  const [wb, setWb] = useState<Workbook | null>(null);
  const [sheet, setSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileErr, setFileErr] = useState('');
  const [busy, setBusy] = useState(false);

  // --- paste mode state ---
  const [text, setText] = useState('');
  const parsed = parseBoqPaste(text);

  const grid = wb && sheet ? wb.grids[sheet] ?? [] : [];
  const headerCells = grid[headerRow] ?? [];

  const fileRows: ParsedRow[] = useMemo(
    () => (grid.length && map && mapIsValid(map) ? gridToRows(grid, headerRow, map) : []),
    [grid, map, headerRow],
  );

  const rows = mode === 'file' ? fileRows : parsed.rows;
  const total = rows.reduce((a, r) => a + itemAmount(r.qty, r.rate), 0);
  const preview = rows.slice(0, 8);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileErr(''); setFileName(file.name); setBusy(true);
    try {
      const book = await readWorkbook(file);
      const first = book.sheetNames[0] ?? '';
      const g = book.grids[first] ?? [];
      const hr = detectHeaderRow(g);
      setWb(book); setSheet(first); setHeaderRow(hr); setMap(autoMapColumns(g[hr] ?? []));
    } catch {
      setFileErr('Could not read that file. Use .xlsx, .xls or .csv.'); setWb(null); setMap(null);
    } finally { setBusy(false); }
  }

  function pickSheet(name: string) {
    const g = wb?.grids[name] ?? [];
    const hr = detectHeaderRow(g);
    setSheet(name); setHeaderRow(hr); setMap(autoMapColumns(g[hr] ?? []));
  }
  function setHeader(i: number) {
    setHeaderRow(i); setMap(autoMapColumns(grid[i] ?? []));
  }
  function setCol(field: keyof ColumnMap, value: number) {
    setMap((m) => (m ? { ...m, [field]: value } : m));
  }

  async function confirm() {
    if (rows.length === 0) return;
    const out = await provider.replaceBoq(projectId, rows);
    onImported(out);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Import BOQ" aria-modal="true">
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="section-head">
          <h3>Import BOQ</h3>
          <div className="head-tools">
            <button className="btn-ghost btn-mini"
              onClick={() => downloadText(BOQ_TEMPLATE_FILENAME, toCsv(BOQ_TEMPLATE_AOA), 'text/csv')}>Sample CSV</button>
            <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="seg" role="tablist" aria-label="Import mode" style={{ marginBottom: 12 }}>
          <button role="tab" aria-selected={mode === 'file'} className={`seg-btn ${mode === 'file' ? 'active' : ''}`} onClick={() => setMode('file')}>Upload Excel / CSV</button>
          <button role="tab" aria-selected={mode === 'paste'} className={`seg-btn ${mode === 'paste' ? 'active' : ''}`} onClick={() => setMode('paste')}>Paste rows</button>
        </div>

        {mode === 'file' ? (
          <>
            <p className="muted small">
              Upload a real BOQ workbook. The header row and columns are detected automatically — review the mapping below
              and adjust if needed. Columns: <strong>bill, code, description, unit, qty, rate</strong> (description, qty and
              rate are required). Keep a <strong>bill</strong> column — the same code is often priced under several bills,
              and bill+code is what identifies an item later when a contractor BOQ is matched to it. Download the
              <strong> Sample CSV</strong> for the exact shape.
            </p>
            <div className="create-row" style={{ marginBottom: 10 }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" aria-label="BOQ file" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
              <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Reading…' : '⬆ Choose file'}</button>
              {fileName && <span className="muted small">{fileName}</span>}
            </div>
            {fileErr && <p className="neg small">{fileErr}</p>}

            {wb && (
              <div className="card" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                <div className="create-row" style={{ flexWrap: 'wrap' }}>
                  {wb.sheetNames.length > 1 && (
                    <label className="small">Sheet&nbsp;
                      <select aria-label="Sheet" value={sheet} onChange={(e) => pickSheet(e.target.value)}>
                        {wb.sheetNames.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="small">Header row&nbsp;
                    <select aria-label="Header row" value={headerRow} onChange={(e) => setHeader(Number(e.target.value))}>
                      {grid.slice(0, 30).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 40) || '(blank)'}</option>)}
                    </select>
                  </label>
                </div>

                <div className="map-grid">
                  {MAP_FIELDS.map((f) => (
                    <label key={f.key} className="small">
                      {f.label}{f.required && <span className="neg"> *</span>}
                      <select aria-label={`Map ${f.label}`} value={map ? map[f.key] : -1} onChange={(e) => setCol(f.key, Number(e.target.value))}>
                        <option value={-1}>— none —</option>
                        {headerCells.map((h, i) => <option key={i} value={i}>{h || `Col ${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {map && !mapIsValid(map) && <p className="neg small">Map Description, Quantity and Rate to continue.</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="muted small">Paste CSV or tab-separated rows with a header (description, qty, rate required). e.g.</p>
            <pre className="sample">{SAMPLE}</pre>
            <textarea aria-label="BOQ paste area" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste rows here…" />
            {parsed.error && text.trim() !== '' && <p className="neg small">{parsed.error}</p>}
          </>
        )}

        {rows.length > 0 && (
          <>
            <p className="muted small">{rows.length} rows recognized · total {formatMoney(total)}</p>
            <table className="data-table" aria-label="Import preview">
              <thead><tr><th>Bill</th><th>Code</th><th>Description</th><th className="num">Qty</th><th className="num">Rate</th></tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td>{r.billNo}</td><td>{r.code}</td><td>{r.description}</td>
                    <td className="num">{r.qty.toLocaleString('en-PK')}</td><td className="num">{r.rate.toLocaleString('en-PK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={confirm} disabled={rows.length === 0}>Replace BOQ ({rows.length})</button>
        </div>
      </div>
    </div>
  );
}

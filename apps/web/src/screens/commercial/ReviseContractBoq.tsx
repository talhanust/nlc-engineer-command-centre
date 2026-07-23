import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { readWorkbook } from '../../domain/xlsxImport';
import { matchSubletRows, parseSubletGrid, rowKey, type SkippedRow, type SubletImportResult } from '../../domain/subletImport';
import { ImportReconciliation } from '../../components/ImportReconciliation';
import { diffContractLines, type ContractLineDiff } from '../../domain/contractLineDiff';
import { contractMargin } from '../../domain/contractMargin';
import { SUBLET_TEMPLATE_AOA, SUBLET_TEMPLATE_FILENAME } from '../../domain/csvTemplates';
import { downloadText, toCsv } from '../../components/hrExport';
import type { BoqItem, Contract, ContractLine } from '../../data/types';

const KIND_LABEL: Record<string, string> = { added: 'Added', removed: 'Removed', changed: 'Changed', unchanged: 'Unchanged' };

/**
 * Re-upload a corrected BOQ onto an existing DRAFT contract.
 *
 * This is the alternative to deleting the contract and building it again: the
 * contract keeps its number, its approval chain and its audit history, and the
 * user approves an explicit diff — what is added, removed and changed, and what it
 * does to the value — instead of hoping the second attempt is right.
 *
 * Only a draft can be revised. Once awarded, quantities and rates are contractual
 * and change through a variation, not a silent edit; the provider enforces that.
 */
export function ReviseContractBoq({ projectId, contract, onClose, onSaved }: {
  projectId: string; contract: Contract; onClose: () => void; onSaved: () => void;
}) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [proposed, setProposed] = useState<ContractLine[] | null>(null);
  const [recon, setRecon] = useState<SubletImportResult | null>(null);
  const [uploaded, setUploaded] = useState<ReturnType<typeof parseSubletGrid>['rows']>([]);
  const [resolutions, setResolutions] = useState<Map<string, string>>(new Map());
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    void provider.listBoq(projectId).then((b) => { if (on) setItems(b); });
    return () => { on = false; };
  }, [provider, projectId]);

  const current = useMemo(() => contract.lines ?? [], [contract.lines]);
  const diff: ContractLineDiff | null = useMemo(
    () => (proposed ? diffContractLines(current, proposed, items) : null),
    [current, proposed, items],
  );
  const margin = useMemo(() => (proposed ? contractMargin(proposed, items) : null), [proposed, items]);

  async function onUpload(file: File) {
    setError(''); setRecon(null); setResolutions(new Map());
    try {
      const wb = await readWorkbook(file);
      const grid = wb.grids[wb.sheetNames[0]] ?? [];
      const { rows, error: parseErr } = parseSubletGrid(grid);
      if (parseErr) { setError(parseErr); return; }

      setUploaded(rows);
      const res = matchSubletRows(rows, items);
      setRecon(res);
      if (res.matched.length === 0) {
        setError('No rows matched a BOQ item. Check the code (and bill) columns against the project BOQ.');
        setProposed(null);
        return;
      }
      setProposed(res.matched.map((m) => ({ boqItemId: m.boqItemId, qty: m.qty, rate: m.rate })));
    } catch {
      setError('Could not read that spreadsheet.');
    }
  }

  function resolve(row: SkippedRow, boqItemId: string) {
    const next = new Map(resolutions);
    if (boqItemId) next.set(rowKey(row), boqItemId); else next.delete(rowKey(row));
    setResolutions(next);
    const res = matchSubletRows(uploaded, items, next);
    setRecon(res);
    setProposed(res.matched.map((m) => ({ boqItemId: m.boqItemId, qty: m.qty, rate: m.rate })));
  }

  async function apply() {
    if (!proposed) return;
    setBusy(true); setError('');
    try {
      await provider.updateContractLines(projectId, contract.id, proposed);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revise the contract.');
    } finally { setBusy(false); }
  }

  const isDraft = contract.status === 'draft';

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Revise contract BOQ" aria-modal="true" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>Revise BOQ · {contract.contractNo}</h3>
          <button className="btn-ghost btn-mini" onClick={() => downloadText(SUBLET_TEMPLATE_FILENAME, toCsv(SUBLET_TEMPLATE_AOA), 'text/csv')}>Sample CSV</button>
        </div>

        {!isDraft ? (
          <div className="card" style={{ borderColor: 'var(--danger)' }} aria-label="Revision blocked">
            <strong className="neg">This contract is {contract.status.replace('_', ' ')}, so its BOQ is frozen.</strong>
            <div className="muted small">
              Quantities and rates became contractual at award. Change them through a variation, which keeps the original
              contract intact and records what changed and why.
            </div>
          </div>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>
              Upload the corrected contractor BOQ. The <strong>rate column must hold the sublet rate</strong> — what this
              subcontractor is paid, not the client BOQ rate. Nothing is changed until you approve the differences below.
            </p>

            <div className="create-row">
              <label className="btn" style={{ cursor: 'pointer' }}>
                ⬆ Choose corrected BOQ
                <input type="file" accept=".xlsx,.xls,.csv" aria-label="Revised contractor BOQ" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); void onUpload(f); } e.target.value = ''; }} />
              </label>
            </div>
            {error && <p className="neg small" role="alert">{error}</p>}
            {recon && <ImportReconciliation result={recon} fileName={fileName} items={items} resolutions={resolutions} onResolve={resolve} />}

            {diff && (
              <>
                <div className="kpi-row" style={{ marginTop: 12 }} aria-label="Revision totals">
                  <div className="kpi"><div className="kpi-label">Current value</div><div className="kpi-value">{formatMoney(diff.fromValue)}</div></div>
                  <div className="kpi"><div className="kpi-label">Revised value</div><div className="kpi-value">{formatMoney(diff.toValue)}</div></div>
                  <div className="kpi"><div className="kpi-label">Change</div><div className={`kpi-value ${diff.delta < 0 ? 'neg' : ''}`}>{diff.delta >= 0 ? '+' : ''}{formatMoney(diff.delta)}</div></div>
                  {margin && <div className="kpi"><div className="kpi-label">Margin after</div><div className={`kpi-value ${margin.margin < 0 ? 'neg' : ''}`}>{formatMoney(margin.margin)}</div><div className="muted small">{margin.marginPct.toFixed(2)}%</div></div>}
                </div>

                {diff.identical ? (
                  <p className="muted small">The uploaded sheet matches the current BOQ exactly — nothing to change.</p>
                ) : (
                  <p className="muted small">
                    {diff.added.length} added · {diff.removed.length} removed · {diff.changed.length} changed ·{' '}
                    {diff.unchanged.length} unchanged
                  </p>
                )}

                <div className="table-scroll" style={{ maxHeight: 320 }}>
                  <table className="data-table" aria-label="Revision diff">
                    <thead><tr>
                      <th>Change</th><th>Code</th><th>Description</th>
                      <th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th><th className="num">Delta</th>
                    </tr></thead>
                    <tbody>
                      {diff.changes.filter((c) => c.kind !== 'unchanged').map((c) => (
                        <tr key={c.boqItemId}>
                          <td className="small">{KIND_LABEL[c.kind]}</td>
                          <td className="mono small">{c.code}</td>
                          <td className="small">{c.description}</td>
                          <td className="num small">
                            {c.kind === 'changed' && c.fromQty !== c.toQty
                              ? <><span className="muted">{c.fromQty?.toLocaleString('en-PK')}</span> → {c.toQty?.toLocaleString('en-PK')}</>
                              : (c.toQty ?? c.fromQty)?.toLocaleString('en-PK')}
                          </td>
                          <td className="num small">
                            {c.kind === 'changed' && c.fromRate !== c.toRate
                              ? <><span className="muted">{c.fromRate?.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</span> → {c.toRate?.toLocaleString('en-PK', { maximumFractionDigits: 2 })}</>
                              : (c.toRate ?? c.fromRate)?.toLocaleString('en-PK', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="num">{formatMoney(c.toAmount)}</td>
                          <td className={`num small ${c.delta < 0 ? 'neg' : ''}`}>{c.delta >= 0 ? '+' : ''}{formatMoney(c.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {margin && margin.negativeLines.length > 0 && (
                  <p className="neg small" role="alert">
                    ⚠ After this revision, {margin.negativeLines.length} line(s) would be priced at or above the client rate:{' '}
                    {margin.negativeLines.slice(0, 6).map((l) => l.code).join(', ')}.
                  </p>
                )}
              </>
            )}
          </>
        )}

        <div className="create-row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          {isDraft && diff && !diff.identical && (
            <button className="btn" disabled={busy} aria-label="Apply revision" onClick={apply}>
              {busy ? 'Applying…' : `Apply revision · ${formatMoney(diff.toValue)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

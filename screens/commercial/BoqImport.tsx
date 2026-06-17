import { useState } from 'react';
import { useData } from '../../data/DataContext';
import { parseBoqPaste, itemAmount } from '../../domain/boq';
import { formatMoney } from '../../domain/money';
import type { BoqItem } from '../../data/types';

const SAMPLE = 'bill,code,description,unit,qty,rate\n1,I-101,Site clearance,Sqm,45000,85';

export function BoqImport({
  projectId,
  onClose,
  onImported,
}: {
  projectId: string;
  onClose: () => void;
  onImported: (rows: BoqItem[]) => void;
}) {
  const { provider } = useData();
  const [text, setText] = useState('');
  const parsed = parseBoqPaste(text);
  const preview = parsed.rows.slice(0, 8);

  async function confirm() {
    if (parsed.rows.length === 0) return;
    const rows = await provider.replaceBoq(projectId, parsed.rows);
    onImported(rows);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Import BOQ" aria-modal="true">
      <div className="modal">
        <div className="section-head">
          <h3>Import BOQ</h3>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="muted small">
          Paste CSV or tab-separated rows with a header. Columns are matched by name
          (description, qty and rate are required; bill, code and unit optional). e.g.
        </p>
        <pre className="sample">{SAMPLE}</pre>
        <textarea
          aria-label="BOQ paste area"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste rows here…"
        />
        {parsed.error && text.trim() !== '' && <p className="neg small">{parsed.error}</p>}
        {parsed.rows.length > 0 && (
          <>
            <p className="muted small">
              {parsed.rows.length} rows recognized · total{' '}
              {formatMoney(parsed.rows.reduce((a, r) => a + itemAmount(r.qty, r.rate), 0))}
            </p>
            <table className="data-table" aria-label="Import preview">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td>{r.billNo}</td>
                    <td>{r.code}</td>
                    <td>{r.description}</td>
                    <td className="num">{r.qty.toLocaleString('en-PK')}</td>
                    <td className="num">{r.rate.toLocaleString('en-PK')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={confirm} disabled={parsed.rows.length === 0}>
            Replace BOQ ({parsed.rows.length})
          </button>
        </div>
      </div>
    </div>
  );
}

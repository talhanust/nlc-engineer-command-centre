import { formatMoney } from '../domain/money';

// Reconciliation is to the rupee, never to the nearest million: "Rs 2,342.7 Mn"
// against "Rs 2,518.7 Mn" hides whether the difference is 176,000,000 or
// 176,003,598, and the whole point of a control total is that it ties exactly.
const exact = (v: number) => formatMoney(v, 'rs');
import type { SkipReason, SubletImportResult } from '../domain/subletImport';

const REASON_LABEL: Record<SkipReason, string> = {
  'ambiguous': 'Code matches more than one BOQ item',
  'not-in-boq': 'No such item in this project’s BOQ',
  'no-quantity': 'No quantity',
  'no-rate': 'No sublet rate',
};

/**
 * Reconcile an uploaded BOQ to the last rupee.
 *
 * A spreadsheet import that reports only what it took is unsafe: a provisional
 * sum with no item code, a mistyped code, a blank rate — each quietly reduces the
 * contract, and the shortfall only surfaces when someone totals the sheet by hand.
 * So this states the file total, the imported total, and the difference between
 * them, and names every row it could not take together with the money on it.
 *
 * The variance is the control: zero means the contract equals the sheet.
 */
export function ImportReconciliation({ result, fileName }: { result: SubletImportResult; fileName?: string }) {
  const clean = result.variance === 0 && result.skipped.length === 0;

  return (
    <div className="card" style={{ marginTop: 12, borderColor: clean ? 'var(--rag-green)' : 'var(--warning)' }}
      aria-label="Import reconciliation">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h4 style={{ margin: 0 }}>Import reconciliation{fileName ? ` · ${fileName}` : ''}</h4>
        <span className={`status-pill ${clean ? 'st-completed' : 'st-draft'}`}>
          {clean ? 'Reconciled' : 'Variance'}
        </span>
      </div>

      <div className="kpi-row" style={{ marginTop: 8 }}>
        <div className="kpi-card">
          <div className="kpi-label">In the file</div>
          <div className="kpi-value">{exact(result.fileValue)}</div>
          <div className="muted small">{result.matched.length + result.skipped.length} row(s)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Imported</div>
          <div className="kpi-value">{exact(result.matchedValue)}</div>
          <div className="muted small">{result.matched.length} line(s)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Difference</div>
          <div className={`kpi-value ${result.variance !== 0 ? 'neg' : ''}`}>{exact(result.variance)}</div>
          <div className="muted small">{result.variance === 0 ? 'nothing lost' : `${result.skipped.length} row(s) not imported`}</div>
        </div>
      </div>

      {result.skipped.length > 0 && (
        <>
          <p className="neg small" style={{ marginBottom: 4 }}>
            These rows were not imported. Until they are resolved the contract is {exact(result.variance)} short of the sheet.
          </p>
          <div className="table-scroll" style={{ maxHeight: 200 }}>
            <table className="data-table" aria-label="Rows not imported">
              <thead><tr><th>Bill</th><th>Code</th><th>Description</th><th className="num">Amount</th><th>Why</th></tr></thead>
              <tbody>
                {result.skipped.map((s, i) => (
                  <tr key={`${s.bill}-${s.code}-${i}`}>
                    <td className="small">{s.bill || '—'}</td>
                    <td className="mono small">{s.code || '—'}</td>
                    <td className="small">{s.description || '—'}</td>
                    <td className="num">{exact(s.amount)}</td>
                    <td className="small muted">{REASON_LABEL[s.reason]}{s.detail ? ` — ${s.detail}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            A row with no item code (a provisional or lump sum) is matched on its description. If it is still not found, add
            it to the project BOQ first — a sublet line has to point at something the client is billed for, or the margin on
            it cannot be worked out.
          </p>
        </>
      )}
    </div>
  );
}

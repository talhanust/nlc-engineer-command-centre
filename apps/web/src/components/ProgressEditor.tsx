import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { toNum } from '../domain/money';
import type { Project, MonthlySeriesPoint } from '../data/types';

/** Edit headline progress (actual %, billed, received) and per-month cumulative actuals. */
export function ProgressEditor({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => void }) {
  const { provider, refresh } = useData();
  const [actual, setActual] = useState(String(project.actualPct));
  const [planned, setPlanned] = useState(String(project.plannedPct));
  const [billed, setBilled] = useState(String(toNum(project.billedToDate)));
  const [received, setReceived] = useState(String(toNum(project.receivedToDate)));
  const [series, setSeries] = useState<MonthlySeriesPoint[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    provider.listMonthlySeries(project.id).then((s) => alive && setSeries(s));
    return () => { alive = false; };
  }, [provider, project.id]);

  async function save() {
    setBusy(true);
    try {
      await provider.updateProject(project.id, {
        plannedPct: Number(planned) || 0,
        actualPct: Number(actual) || 0,
        billedToDate: String(Math.round(Number(billed.replace(/,/g, '')) || 0)),
        receivedToDate: String(Math.round(Number(received.replace(/,/g, '')) || 0)),
      });
      for (const [month, v] of Object.entries(edits)) {
        const n = Number(v);
        if (Number.isFinite(n)) await provider.setMonthlyActual(project.id, month, n);
      }
      await refresh();
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label="Update progress" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Update progress — {project.id}</h3>
        <div className="create-row" style={{ marginTop: 8 }}>
          <label className="small">Planned %{' '}<input aria-label="Edit planned pct" value={planned} onChange={(e) => setPlanned(e.target.value)} style={{ width: 70 }} /></label>
          <label className="small">Actual %{' '}<input aria-label="Edit actual pct" value={actual} onChange={(e) => setActual(e.target.value)} style={{ width: 70 }} /></label>
        </div>
        <div className="create-row" style={{ marginTop: 8 }}>
          <label className="small">Billed (PKR){' '}<input aria-label="Edit billed" value={billed} onChange={(e) => setBilled(e.target.value)} /></label>
          <label className="small">Received (PKR){' '}<input aria-label="Edit received" value={received} onChange={(e) => setReceived(e.target.value)} /></label>
        </div>

        {series.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3>Monthly actuals (cumulative %)</h3>
            <table className="data-table" aria-label="Edit monthly actuals">
              <thead><tr><th>Month</th><th className="num">Planned</th><th className="num">Actual</th></tr></thead>
              <tbody>
                {series.map((p) => (
                  <tr key={p.month}>
                    <td>{p.month}</td>
                    <td className="num">{p.planned}%</td>
                    <td className="num">
                      <input
                        className="qty-input"
                        aria-label={`Actual ${p.month}`}
                        defaultValue={p.actual ?? ''}
                        placeholder="—"
                        onChange={(e) => setEdits((prev) => ({ ...prev, [p.month]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={busy}>Save progress</button>
        </div>
      </div>
    </div>
  );
}

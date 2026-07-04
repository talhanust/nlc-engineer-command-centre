import { useState } from 'react';
import { useData } from '../data/DataContext';
import { parseScheduleRows, parseScurveRows, textToRows, type Row } from '../domain/importers';
import { readSheetRows } from './xlsxImport';

type Kind = 'schedule' | 'scurve';

/** Upload (.xlsx/.csv) or paste a schedule / S-curve baseline, preview, then apply. */
export function BaselineImport({ projectId, kind, onClose, onDone }: { projectId: string; kind: Kind; onClose: () => void; onDone: () => void }) {
  const { provider } = useData();
  const [rows, setRows] = useState<Row[]>([]);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const title = kind === 'schedule' ? 'Import schedule baseline' : 'Import S-curve baseline';
  const parsed = kind === 'schedule' ? parseScheduleRows(rows) : parseScurveRows(rows);
  const count = kind === 'schedule' ? (parsed as ReturnType<typeof parseScheduleRows>).rows.length : (parsed as ReturnType<typeof parseScurveRows>).points.length;

  async function onFile(file: File) {
    setError('');
    try { setRows(await readSheetRows(file)); }
    catch { setError('Could not read that file.'); }
  }
  function applyPaste() {
    setRows(textToRows(paste));
  }
  async function apply() {
    setBusy(true);
    try {
      if (kind === 'schedule') {
        const r = parseScheduleRows(rows);
        if (r.error) { setError(r.error); return; }
        await provider.replaceSchedule(projectId, r.rows);
      } else {
        const r = parseScurveRows(rows);
        if (r.error) { setError(r.error); return; }
        await provider.importScurve(projectId, r.points);
      }
      onDone();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={title} aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted small">
          {kind === 'schedule'
            ? 'Columns: Activity ID, Name, WBS, Start, Finish, [Milestone].'
            : 'Columns: Month, Planned %, [Actual %].'}
        </p>
        <div className="create-row">
          <label className="btn-ghost" style={{ cursor: 'pointer' }}>
            Choose .xlsx / .csv
            <input type="file" accept=".xlsx,.xls,.csv" aria-label={`${kind} file`} style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <span className="muted small">or paste below</span>
        </div>
        <textarea
          aria-label={`${kind} paste`}
          placeholder={kind === 'schedule' ? 'A-100\tEarthworks\t1.1\t2025-09-01\t2025-12-15' : 'Sep-25\t5\t4'}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={6}
          style={{ width: '100%', marginTop: 8 }}
        />
        <div className="create-row" style={{ marginTop: 6 }}>
          <button className="btn-ghost" onClick={applyPaste} disabled={!paste.trim()}>Parse pasted text</button>
          {count > 0 && <span className="pos small">{count} {kind === 'schedule' ? 'activities' : 'months'} ready</span>}
          {error && <span className="neg small">{error}</span>}
        </div>

        {count > 0 && (
          <div className="sample" style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
            {kind === 'schedule'
              ? (parsed as ReturnType<typeof parseScheduleRows>).rows.slice(0, 8).map((a, i) => (<div key={i}>{a.activityId} · {a.name} · {a.plannedStart}→{a.plannedFinish}</div>))
              : (parsed as ReturnType<typeof parseScurveRows>).points.slice(0, 12).map((p, i) => (<div key={i}>{p.month}: planned {p.planned}% {p.actual != null ? `· actual ${p.actual}%` : ''}</div>))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={apply} disabled={busy || count === 0}>Apply baseline</button>
        </div>
      </div>
    </div>
  );
}

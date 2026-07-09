import { useState } from 'react';
import { useData } from '../data/DataContext';
import { parseScheduleRows, parseScurveRows, textToRows, type Row } from '../domain/importers';
import { readSheetRows } from './xlsxImport';
import { readXerText, isXerFile } from './xerImport';
import { parseXerSchedule, predecessorLabel, type XerScheduleResult } from '../domain/xer';
import type { ScheduleActivity } from '../data/types';

type Kind = 'schedule' | 'scurve';
type DraftActivity = Omit<ScheduleActivity, 'id' | 'projectId'>;

/** Upload a P6 .xer / .xlsx / .csv, or paste, a schedule / S-curve baseline;
 *  preview, then apply. .xer files get the full Primavera mapping (WBS paths,
 *  durations from calendars, logic links, float/critical, %-complete); tabular
 *  files keep the existing flexible column mapping. */
export function BaselineImport({ projectId, kind, onClose, onDone }: { projectId: string; kind: Kind; onClose: () => void; onDone: () => void }) {
  const { provider } = useData();
  const [rows, setRows] = useState<Row[]>([]);
  const [xer, setXer] = useState<XerScheduleResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const title = kind === 'schedule' ? 'Import schedule baseline' : 'Import S-curve baseline';
  const parsed = kind === 'schedule' ? parseScheduleRows(rows) : parseScurveRows(rows);
  const tabularCount = kind === 'schedule'
    ? (parsed as ReturnType<typeof parseScheduleRows>).rows.length
    : (parsed as ReturnType<typeof parseScurveRows>).points.length;
  const count = xer ? xer.activities.length : tabularCount;

  const preview: DraftActivity[] = xer
    ? xer.activities.slice(0, 10)
    : (kind === 'schedule' ? (parsed as ReturnType<typeof parseScheduleRows>).rows.slice(0, 10) : []);

  async function onFile(file: File) {
    setError(''); setXer(null); setRows([]); setFileName(file.name);
    try {
      if (kind === 'schedule' && isXerFile(file)) {
        const result = parseXerSchedule(await readXerText(file));
        if (result.activities.length === 0) { setError(result.warnings[0] || 'No activities found in that .xer file.'); return; }
        setXer(result);
      } else {
        setRows(await readSheetRows(file));
      }
    } catch {
      setError('Could not read that file.');
    }
  }
  function applyPaste() {
    setXer(null); setFileName('');
    setRows(textToRows(paste));
  }
  async function apply() {
    setBusy(true);
    try {
      if (kind === 'schedule') {
        if (xer) {
          await provider.replaceSchedule(projectId, xer.activities);
        } else {
          const r = parseScheduleRows(rows);
          if (r.error) { setError(r.error); return; }
          await provider.replaceSchedule(projectId, r.rows);
        }
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
            ? 'Upload a Primavera P6 .xer (WBS, logic, float and %-complete are read in full) or an .xlsx/.csv with columns: Activity ID, Name, WBS, Start, Finish, [Milestone].'
            : 'Columns: Month, Planned %, [Actual %].'}
        </p>
        <div className="create-row">
          <label className="btn-ghost" style={{ cursor: 'pointer' }}>
            {kind === 'schedule' ? 'Choose .xer / .xlsx / .csv' : 'Choose .xlsx / .csv'}
            <input
              type="file"
              accept={kind === 'schedule' ? '.xer,.xlsx,.xls,.csv' : '.xlsx,.xls,.csv'}
              aria-label={`${kind} file`}
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
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

        {xer && (
          <div className="card" style={{ marginTop: 8 }} aria-label="XER import summary">
            <div className="small">
              <strong>Primavera P6 file</strong>{fileName ? ` · ${fileName}` : ''}{xer.projectShortName ? ` · project ${xer.projectShortName}` : ''}
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {xer.activities.length} activities · {xer.wbsCount} WBS · {xer.relationshipCount} logic links · {xer.milestoneCount} milestones · {xer.resourceCount} resources
            </div>
            {(xer.planStart || xer.planFinish) && (
              <div className="muted small">Programme window: {xer.planStart || '—'} → {xer.planFinish || '—'}</div>
            )}
            {xer.warnings.length > 0 && <div className="neg small" style={{ marginTop: 4 }}>{xer.warnings.join(' ')}</div>}
          </div>
        )}

        {count > 0 && (
          <div className="sample" style={{ marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>
            {kind === 'schedule'
              ? preview.map((a, i) => (
                  <div key={i} className="small">
                    {a.activityId} · {a.name} · <span className="muted">{a.wbs}</span> · {a.plannedStart}→{a.plannedFinish} · {a.durationDays}d
                    {a.isCritical ? <span className="neg"> · critical</span> : null}
                    {a.predecessors?.length ? <span className="muted"> · after {predecessorLabel(a.predecessors)}</span> : null}
                  </div>
                ))
              : (parsed as ReturnType<typeof parseScurveRows>).points.slice(0, 12).map((p, i) => (
                  <div key={i}>{p.month}: planned {p.planned}% {p.actual != null ? `· actual ${p.actual}%` : ''}</div>
                ))}
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

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { parseScheduleRows, parseScurveRows, textToRows, type Row } from '../domain/importers';
import { readSheetRows } from './xlsxImport';
import { readXerText, isXerFile, readFileBytes } from './xerImport';
import { hashBytes, shortHash, type FileHash } from './fileHash';
import { scurveFromSchedule, reconcileProgrammeCost } from '../domain/scurveFromSchedule';
import { formatMoney } from '../domain/money';
import { parseXerSchedule, predecessorLabel, type XerScheduleResult } from '../domain/xer';
import type { ScheduleActivity, BoqWbsLink } from '../data/types';
import { diffSchedule, isNoOp, diffHeadline, detectRenames, unrescuedOrphans, type ScheduleDiff, type RenameCandidate } from '../domain/scheduleDiff';

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
  // Re-importing must never be a silent overwrite: hold the current programme
  // and its BOQ links so the change set can be shown before anything is written.
  const [current, setCurrent] = useState<ScheduleActivity[]>([]);
  const [links, setLinks] = useState<BoqWbsLink[]>([]);
  // Proposed remaps the user has agreed to. Defaults are set once the diff lands.
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set());
  // Provenance of the uploaded file, and the optional derived planned curve.
  const [source, setSource] = useState<{ name: string; bytes: number; hash: FileHash } | null>(null);
  const [deriveCurve, setDeriveCurve] = useState(true);
  const [boqAmount, setBoqAmount] = useState(0);
  useEffect(() => {
    if (kind !== 'schedule') return;
    let alive = true;
    void Promise.all([provider.listSchedule(projectId), provider.listBoqWbs(projectId), provider.listBoq(projectId)])
      .then(([s, l, boq]) => { if (alive) { setCurrent(s); setLinks(l); setBoqAmount(boq.reduce((t, i) => t + i.amount, 0)); } });
    return () => { alive = false; };
  }, [provider, projectId, kind]);

  const title = kind === 'schedule' ? 'Import schedule baseline' : 'Import S-curve baseline';
  const parsed = kind === 'schedule' ? parseScheduleRows(rows) : parseScurveRows(rows);
  const tabularCount = kind === 'schedule'
    ? (parsed as ReturnType<typeof parseScheduleRows>).rows.length
    : (parsed as ReturnType<typeof parseScurveRows>).points.length;
  const count = xer ? xer.activities.length : tabularCount;

  const incoming: DraftActivity[] = xer ? xer.activities : (kind === 'schedule' ? (parsed as ReturnType<typeof parseScheduleRows>).rows : []);
  const diff: ScheduleDiff | null = useMemo(
    () => (kind === 'schedule' && incoming.length > 0 ? diffSchedule(current, incoming, links) : null),
    [kind, incoming, current, links],
  );
  // A renamed activity looks like a removal plus an addition. Offer to carry its
  // BOQ links — and their quantity allocations — across, rather than lose them.
  const renames: RenameCandidate[] = useMemo(
    () => (diff && !diff.isFirstImport ? detectRenames(diff, current) : []),
    [diff, current],
  );
  const lost = useMemo(() => (diff ? unrescuedOrphans(diff, renames.filter((r) => accepted.has(r.fromActivityId))) : []), [diff, renames, accepted]);

  const curve = useMemo(
    () => (xer ? scurveFromSchedule(xer.activities.map((a, i) => ({ ...a, id: `t${i}`, projectId })), {
      workingWeekdays: xer.workingWeekdays, holidays: xer.holidays,
    }) : null),
    [xer, projectId],
  );
  const reconciliation = useMemo(
    () => (curve && curve.costLoaded ? reconcileProgrammeCost(curve.totalCost, boqAmount) : null),
    [curve, boqAmount],
  );

  const preview: DraftActivity[] = xer
    ? xer.activities.slice(0, 10)
    : (kind === 'schedule' ? (parsed as ReturnType<typeof parseScheduleRows>).rows.slice(0, 10) : []);

  // High-confidence renames are pre-ticked; the rest wait to be chosen.
  useEffect(() => {
    setAccepted(new Set(renames.filter((r) => r.score >= 0.85).map((r) => r.fromActivityId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renames.map((r) => `${r.fromActivityId}>${r.toActivityId}`).join('|')]);

  function toggleRename(fromActivityId: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(fromActivityId)) next.delete(fromActivityId); else next.add(fromActivityId);
      return next;
    });
  }

  async function onFile(file: File) {
    setError(''); setXer(null); setRows([]); setFileName(file.name);
    try {
      if (kind === 'schedule' && isXerFile(file)) {
        const result = parseXerSchedule(await readXerText(file));
        if (result.activities.length === 0) { setError(result.warnings[0] || 'No activities found in that .xer file.'); return; }
        setXer(result);
        // Hash the bytes as they were uploaded, so the record proves which file
        // produced this baseline.
        const bytes = await readFileBytes(file);
        setSource({ name: file.name, bytes: bytes.byteLength, hash: await hashBytes(bytes) });
      } else {
        setRows(await readSheetRows(file));
      }
    } catch {
      setError('Could not read that file.');
    }
  }
  function applyPaste() {
    setXer(null); setFileName(''); setSource(null);
    setRows(textToRows(paste));
  }
  async function apply() {
    setBusy(true);
    try {
      if (kind === 'schedule') {
        if (xer) {
          const meta = {
            projectCode: xer.projectShortName,
            dataDate: xer.dataDate,
            planStart: xer.planStart,
            planFinish: xer.planFinish,
            workingWeekdays: xer.workingWeekdays,
            holidays: xer.holidays,
            totalBudgetCost: xer.totalBudgetCost,
            sourceFileName: source?.name,
            sourceFileBytes: source?.bytes,
            sourceFileHash: source?.hash.hash,
            sourceHashAlgorithm: source?.hash.algorithm,
            importedAt: new Date().toISOString(),
          };
          const saved = await provider.replaceSchedule(projectId, xer.activities, xer.wbs, meta);
          // The planned curve is computed from the programme we just stored, so the
          // two can never drift apart.
          if (deriveCurve && curve && curve.points.length > 0) {
            await provider.importScurve(projectId, scurveFromSchedule(saved, meta).points);
          }
        } else {
          const r = parseScheduleRows(rows);
          if (r.error) { setError(r.error); return; }
          await provider.replaceSchedule(projectId, r.rows);
        }
        // The new activities exist now, so the mappings can be carried across.
        for (const r of renames) {
          if (accepted.has(r.fromActivityId)) await provider.remapBoqWbsActivity(projectId, r.fromActivityId, r.toActivityId);
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

            {source && (
              <div className="muted small" style={{ marginTop: 4 }} aria-label="Source provenance"
                title={`${source.hash.algorithm.toUpperCase()}: ${source.hash.hash}`}>
                Source recorded: {source.name} · {(source.bytes / 1024).toFixed(0)} KB · {source.hash.algorithm} {shortHash(source.hash.hash)}
              </div>
            )}

            {curve && curve.costLoaded && (
              <div style={{ marginTop: 6 }}>
                <label className="small">
                  <input type="checkbox" checked={deriveCurve} onChange={(e) => setDeriveCurve(e.target.checked)}
                    aria-label="Derive planned S-curve from the programme" />{' '}
                  Derive the planned S-curve from this programme
                  <span className="muted"> — cost-loaded, {formatMoney(curve.totalCost)} over {curve.points.length} months</span>
                </label>
                {reconciliation && (
                  <div className={`small ${reconciliation.agrees ? 'pos' : 'neg'}`} aria-label="Budget reconciliation" style={{ marginTop: 2 }}>
                    {reconciliation.agrees
                      ? `Programme budget agrees with the BOQ within ${Math.abs(reconciliation.differencePct)}%.`
                      : `⚠ Programme budget differs from the BOQ by ${reconciliation.differencePct}% (${formatMoney(reconciliation.programmeCost)} vs ${formatMoney(reconciliation.boqAmount)}). Check for bills missing from the programme, or resources never loaded.`}
                  </div>
                )}
              </div>
            )}
            {curve && !curve.costLoaded && (
              <div className="muted small" style={{ marginTop: 4 }}>
                This programme carries no resource costs, so no planned curve can be derived from it.
              </div>
            )}
          </div>
        )}

        {diff && !diff.isFirstImport && (
          <div className="card" style={{ marginTop: 8, borderColor: diff.orphaned.length ? 'var(--danger)' : undefined }} aria-label="Import change set">
            <div className="small"><strong>Change set</strong> — {diffHeadline(diff)}</div>
            {diff.finishShiftDays !== 0 && (
              <div className={`small ${diff.finishShiftDays > 0 ? 'neg' : 'pos'}`}>
                Programme finish moves {Math.abs(diff.finishShiftDays)} day(s) {diff.finishShiftDays > 0 ? 'later' : 'earlier'}
              </div>
            )}
            {diff.slipped.length > 0 && (
              <div className="muted small">
                Worst slip: {diff.slipped.slice(0, 3).map((s) => `${s.activityId} +${s.finishSlipDays}d`).join(', ')}
              </div>
            )}
            {renames.length > 0 && (
              <div className="card" style={{ margin: '8px 0' }} aria-label="Proposed remaps">
                <div className="small"><strong>Renamed activities</strong> — carry their BOQ mappings across?</div>
                <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
                  {renames.map((r) => (
                    <li key={r.fromActivityId} className="small" style={{ marginBottom: 3 }}>
                      <label>
                        <input type="checkbox" checked={accepted.has(r.fromActivityId)} onChange={() => toggleRename(r.fromActivityId)}
                          aria-label={`Remap ${r.fromActivityId} to ${r.toActivityId}`} />{' '}
                        <span className="mono">{r.fromActivityId}</span> → <span className="mono">{r.toActivityId}</span>{' '}
                        <span className="muted">· {r.linkCount} link(s) · {Math.round(r.score * 100)}% · {r.reason}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lost.length > 0 ? (
              <div className="neg small" role="alert" style={{ marginTop: 4 }}>
                ⚠ {lost.length} mapped activity(ies) would be removed with no successor, orphaning{' '}
                {lost.reduce((s, o) => s + o.linkCount, 0)} BOQ link(s): {lost.slice(0, 5).map((o) => o.activityId).join(', ')}.
                Their quantity allocations will be lost.
              </div>
            ) : diff.orphaned.length > 0 ? (
              <div className="pos small" style={{ marginTop: 4 }}>
                Every mapped activity that disappears has a successor selected — no BOQ links will be lost.
              </div>
            ) : diff.removed.length > 0 ? (
              <div className="muted small" style={{ marginTop: 4 }}>{diff.removed.length} activity(ies) removed — none carry BOQ mappings.</div>
            ) : null}
            {isNoOp(diff) && <div className="muted small">Applying this import would change nothing.</div>}
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
          <button className="btn" onClick={apply} disabled={busy || count === 0}
            title={diff?.orphaned.length ? 'This import removes mapped activities' : ''}>
            {diff && !diff.isFirstImport ? 'Apply changes' : 'Apply baseline'}
          </button>
        </div>
      </div>
    </div>
  );
}

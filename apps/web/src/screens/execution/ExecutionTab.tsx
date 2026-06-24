import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { SCurveChart } from '../../components/SCurveChart';
import { GanttChart } from '../../components/GanttChart';
import { lookahead, type LookaheadStatus } from '../../domain/lookahead';
import { ProductionTab } from './ProductionTab';
import { BaselineImport } from '../../components/BaselineImport';
import { ScheduleWorkflowStrip } from '../../components/ScheduleWorkflowStrip';
import { PeriodMappingTab } from './PeriodMappingTab';
import { OverheadsTab } from './OverheadsTab';
import { ProgressTab } from './ProgressTab';
import { scheduleProgress, type ActivityActual } from '../../domain/scheduleProgress';
import { criticalPath } from '../../domain/criticalPath';
import type { MonthlySeriesPoint, ScheduleActivity, Resource, ResourceClass, BoqItem, BoqWbsLink, ProgressUpdate } from '../../data/types';

const SUB = ['schedule', 'lookahead', 'scurve', 'progress', 'periodmap', 'overheads', 'production', 'resources'] as const;
type Sub = (typeof SUB)[number];
const LABEL: Record<Sub, string> = { schedule: 'Schedule / WBS', lookahead: 'Lookahead', scurve: 'S-curve & progress', progress: 'Progress updates', periodmap: 'Period mapping', overheads: 'Overheads', production: 'Production & materials', resources: 'Resources' };

export function ExecutionTab({ projectId }: { projectId: string }) {
  const [sub, setSub] = useState<Sub>('scurve');
  return (
    <div>
      <div className="subtabs" role="tablist">
        {SUB.map((s) => (
          <button key={s} role="tab" aria-selected={sub === s} className={`subtab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>
            {LABEL[s]}
          </button>
        ))}
      </div>
      {sub === 'schedule' && <Schedule projectId={projectId} />}
      {sub === 'lookahead' && <Lookahead projectId={projectId} />}
      {sub === 'scurve' && <SCurve projectId={projectId} />}
      {sub === 'periodmap' && <PeriodMappingTab projectId={projectId} />}
      {sub === 'progress' && <ProgressTab projectId={projectId} />}
      {sub === 'overheads' && <OverheadsTab projectId={projectId} />}
      {sub === 'production' && <ProductionTab projectId={projectId} />}
      {sub === 'resources' && <Resources projectId={projectId} />}
    </div>
  );
}

const LA_LABEL: Record<LookaheadStatus, string> = { in_progress: 'In progress', upcoming: 'Upcoming', overdue: 'Overdue' };
const LA_CLASS: Record<LookaheadStatus, string> = { in_progress: 'st-verified', upcoming: 'st-draft', overdue: 'st-marked_payment' };

function Lookahead({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [weeks, setWeeks] = useState<4 | 8 | 12>(8);
  useEffect(() => {
    let a = true;
    provider.listSchedule(projectId).then((x) => a && setActs(x));
    return () => { a = false; };
  }, [provider, projectId]);

  // "As of" is anchored to the project's current month (Jun-2026 demo timeline).
  const asOf = new Date('2026-06-01');
  const rows = lookahead(acts, asOf, weeks);

  return (
    <div>
      <div className="section-head">
        <h3>Rolling lookahead</h3>
        <div className="head-tools">
          <span className="muted small">as of {asOf.toISOString().slice(0, 10)} · window</span>
          {[4, 8, 12].map((w) => (
            <button key={w} className={`subtab${weeks === w ? ' active' : ''}`} onClick={() => setWeeks(w as 4 | 8 | 12)}>{w} wk</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Nothing scheduled in the next {weeks} weeks.</p>
      ) : (
        <table className="data-table" aria-label="Lookahead">
          <thead><tr><th>Activity</th><th>Name</th><th>WBS</th><th>Window</th><th className="num">Starts in</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(({ activity, status, daysToStart }) => (
              <tr key={activity.id}>
                <td>{activity.activityId}</td>
                <td>{activity.name}</td>
                <td>{activity.wbs}</td>
                <td className="small">{activity.plannedStart} → {activity.plannedFinish}</td>
                <td className="num">{daysToStart <= 0 ? 'started' : `${daysToStart}d`}</td>
                <td><span className={`status-pill ${LA_CLASS[status]}`}>{LA_LABEL[status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Schedule({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [items, setItems] = useState<BoqItem[]>([]);
  const [links, setLinks] = useState<BoqWbsLink[]>([]);
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [importing, setImporting] = useState(false);
  const [locked, setLocked] = useState(false);
  function load() {
    Promise.all([
      provider.listSchedule(projectId),
      provider.listBoq(projectId),
      provider.listBoqWbs(projectId),
      provider.listProgress(projectId),
    ]).then(([s, b, l, p]) => { setActs(s); setItems(b); setLinks(l); setUpdates(p); });
  }
  useEffect(() => {
    let alive = true;
    Promise.all([
      provider.listSchedule(projectId),
      provider.listBoq(projectId),
      provider.listBoqWbs(projectId),
      provider.listProgress(projectId),
    ]).then(([s, b, l, p]) => { if (alive) { setActs(s); setItems(b); setLinks(l); setUpdates(p); } });
    return () => { alive = false; };
  }, [provider, projectId]);

  // "As of" anchored to the demo's current month so planned % is meaningful.
  const asOf = new Date('2026-06-01');
  const sp = scheduleProgress(acts, items, links, updates, asOf);
  const actualByActivity = new Map<string, ActivityActual>(sp.rows.map((r) => [r.activity.id, r]));
  const hasActuals = sp.mappedActivities > 0;
  const cp = criticalPath(acts);

  return (
    <div>
      {importing && <BaselineImport projectId={projectId} kind="schedule" onClose={() => setImporting(false)} onDone={load} />}
      <ScheduleWorkflowStrip projectId={projectId} onChange={setLocked} />
      <div className="section-head"><h3>Schedule / WBS</h3>
        <div className="head-tools">
          <span className="muted">{acts.length} activities</span>
          <button className="btn-ghost" disabled={locked} title={locked ? 'Baseline locked — amend to edit' : ''} onClick={() => setImporting(true)}>Import baseline</button>
        </div>
      </div>
      {acts.length === 0 ? (
        <p className="muted">No schedule baseline yet. Use <strong>Import baseline</strong> to upload a Primavera <strong>.xer</strong>, an .xlsx, or paste activities.</p>
      ) : (
        <>
          {hasActuals && (
            <div className="kpi-grid" aria-label="Schedule progress from Commercial">
              <div className="kpi"><div className="kpi-label">Actual (from Commercial)</div><div className="kpi-value">{sp.overallActualPct}%</div></div>
              <div className="kpi"><div className="kpi-label">Planned to date</div><div className="kpi-value">{sp.overallPlannedPct}%</div></div>
              <div className="kpi"><div className="kpi-label">Schedule variance</div><div className={`kpi-value ${sp.overallActualPct - sp.overallPlannedPct < 0 ? 'neg' : 'pos'}`}>{sp.overallActualPct - sp.overallPlannedPct >= 0 ? '+' : ''}{(sp.overallActualPct - sp.overallPlannedPct).toFixed(1)}%</div></div>
              <div className="kpi"><div className="kpi-label">Mapped activities</div><div className="kpi-value">{sp.mappedActivities}/{acts.length}</div></div>
            </div>
          )}
          <p className="muted small">
            {hasActuals
              ? 'Actual % is translated from validated Commercial progress through the BOQ → WBS mapping (value-weighted). Unmapped activities show “—”.'
              : 'Map BOQ items to activities (Mapping → BOQ → WBS) to translate Commercial executed progress into schedule actuals here.'}
          </p>
          {cp.hasNetwork && (
            <div className="kpi-grid" aria-label="Critical path">
              <div className="kpi"><div className="kpi-label">Critical path</div><div className="kpi-value">{cp.criticalIds.size} activities</div></div>
              <div className="kpi"><div className="kpi-label">Project duration</div><div className="kpi-value">{cp.projectDuration} d</div></div>
            </div>
          )}
          <GanttChart activities={acts} criticalIds={cp.criticalIds} />
          <table className="data-table" aria-label="Schedule">
          <thead><tr><th>WBS</th><th>Activity</th><th>Name</th><th className="num">Days</th><th>Start</th><th>Finish</th><th>Type</th><th className="num">Float</th><th className="num">Actual %</th><th className="num">Planned %</th><th className="num">Var</th></tr></thead>
          <tbody>
            {acts.map((a) => {
              const r = actualByActivity.get(a.id);
              const mapped = r && r.mappedItems > 0;
              return (
                <tr key={a.id}>
                  <td>{a.wbs}</td><td>{a.activityId}</td><td>{a.name}</td>
                  <td className="num">{a.durationDays}</td><td>{a.plannedStart}</td><td>{a.plannedFinish}</td>
                  <td>{a.isMilestone ? <span className="status-pill">Milestone</span> : 'Task'}</td>
                  <td className="num">{cp.hasNetwork ? (cp.nodes.get(a.activityId)?.critical ? <span className="status-pill st-marked_payment">Critical</span> : `${cp.nodes.get(a.activityId)?.totalFloat ?? 0}d`) : <span className="muted small">—</span>}</td>
                  <td className="num">{mapped ? `${r!.actualPct}%` : <span className="muted small">—</span>}</td>
                  <td className="num">{mapped ? `${r!.plannedPct}%` : <span className="muted small">—</span>}</td>
                  <td className={`num ${mapped ? (r!.variancePct < 0 ? 'neg' : 'pos') : ''}`}>{mapped ? `${r!.variancePct >= 0 ? '+' : ''}${r!.variancePct}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}

function SCurve({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [series, setSeries] = useState<MonthlySeriesPoint[]>([]);
  const [importing, setImporting] = useState(false);
  function load() { provider.listMonthlySeries(projectId).then(setSeries); }
  useEffect(() => {
    let a = true;
    provider.listMonthlySeries(projectId).then((s) => a && setSeries(s));
    return () => { a = false; };
  }, [provider, projectId]);

  async function setActual(month: string, value: string) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    const next = await provider.setMonthlyActual(projectId, month, Math.max(0, Math.min(100, v)));
    setSeries(next);
  }

  return (
    <div>
      {importing && <BaselineImport projectId={projectId} kind="scurve" onClose={() => setImporting(false)} onDone={load} />}
      <div className="section-head"><h3>Progress S-curve</h3>
        <button className="btn-ghost" onClick={() => setImporting(true)}>Import baseline</button>
      </div>
      <SCurveChart points={series} />
      <div className="card">
        <h3>Monthly actuals (cumulative %)</h3>
        <p className="muted small">Edit an actual to reshape the curve above.</p>
        <table className="data-table" aria-label="Monthly progress">
          <thead><tr><th>Month</th><th className="num">Planned %</th><th className="num">Actual %</th></tr></thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.month}>
                <td>{p.month}</td>
                <td className="num">{p.planned}</td>
                <td className="num">
                  {p.actual == null ? (
                    <span className="muted small">future</span>
                  ) : (
                    <input
                      className="qty-input"
                      aria-label={`Actual for ${p.month}`}
                      defaultValue={p.actual}
                      onBlur={(e) => setActual(p.month, e.target.value)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Resources({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [rows, setRows] = useState<Resource[]>([]);
  const [cls, setCls] = useState<ResourceClass>('plant');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');

  useEffect(() => {
    let a = true;
    provider.listResources(projectId).then((r) => a && setRows(r));
    return () => { a = false; };
  }, [provider, projectId]);

  async function add() {
    const q = Number(qty);
    if (!name.trim() || !Number.isFinite(q)) return;
    const r = await provider.addResource(projectId, { resourceClass: cls, name: name.trim(), unit: unit.trim(), qty: q });
    setRows((prev) => [...prev, r]);
    setName(''); setUnit(''); setQty('');
  }

  return (
    <div>
      <div className="section-head"><h3>Resources (store / plant / equipment)</h3><span className="muted">{rows.length} entries</span></div>
      <div className="card create-row">
        <select aria-label="Resource class" value={cls} onChange={(e) => setCls(e.target.value as ResourceClass)}>
          <option value="store">Store</option><option value="plant">Plant</option><option value="equipment">Equipment</option>
        </select>
        <input aria-label="Resource name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Resource unit" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <input aria-label="Resource qty" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <button className="btn" onClick={add}>Add resource</button>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No resources logged.</p>
      ) : (
        <table className="data-table" aria-label="Resources">
          <thead><tr><th>Class</th><th>Name</th><th>Unit</th><th className="num">Qty</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td style={{ textTransform: 'capitalize' }}>{r.resourceClass}</td><td>{r.name}</td><td>{r.unit}</td><td className="num">{r.qty.toLocaleString('en-PK')}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

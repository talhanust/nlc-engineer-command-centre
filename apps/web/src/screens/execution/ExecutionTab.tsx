import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { SCurveChart } from '../../components/SCurveChart';
import { GanttChart } from '../../components/GanttChart';
import { ActivityTable } from '../../components/ActivityTable';
import { BaselineSelector, baselineLabel } from '../../components/BaselineSelector';
import { VarianceReport } from './VarianceReport';
import { lookahead, type LookaheadStatus } from '../../domain/lookahead';
import { ProductionTab } from './ProductionTab';
import { BaselineImport } from '../../components/BaselineImport';
import { ScheduleWorkflowStrip } from '../../components/ScheduleWorkflowStrip';
import { BaselineLockBanner } from '../../components/BaselineLockBanner';
import { PeriodMappingTab } from './PeriodMappingTab';
import { OverheadsTab } from './OverheadsTab';
import { ProgressTab } from './ProgressTab';
import type { MonthlySeriesPoint, ScheduleActivity, ScheduleWbsNode, ScheduleMeta, ScheduleBaseline, Resource, ResourceClass } from '../../data/types';
import { activityDerivedProgress, type ActivityDerivedRow } from '../../domain/derivedProgress';
import { DEFAULT_COMMERCIAL_CONFIG } from '../../domain/ipc';
import { predecessorLabel } from '../../domain/xer';
import type { ActivityStatus } from '../../data/types';

const ACT_STATUS_LABEL: Record<ActivityStatus, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
const ACT_STATUS_CLASS: Record<ActivityStatus, string> = { not_started: 'st-draft', in_progress: 'st-verified', completed: 'st-paid' };

const SUB = ['schedule', 'gantt', 'variance', 'lookahead', 'scurve', 'progress', 'periodmap', 'overheads', 'production', 'resources'] as const;
type Sub = (typeof SUB)[number];
const LABEL: Record<Sub, string> = { schedule: 'Activities', gantt: 'Gantt chart', variance: 'Variance & claim', lookahead: 'Lookahead', scurve: 'S-curve & progress', progress: 'Progress updates', periodmap: 'Period mapping', overheads: 'Overheads', production: 'Production & materials', resources: 'Resources' };

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
      {sub === 'schedule' && <><BaselineLockBanner projectId={projectId} kind="schedule" /><Schedule projectId={projectId} /></>}
      {sub === 'gantt' && <Gantt projectId={projectId} />}
      {sub === 'variance' && <VarianceReport projectId={projectId} />}
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

/** Re-baselining changes the yardstick the team reads slip against, so it asks
 *  first. Earlier baselines are kept. Guarded for non-browser (test) environments. */
function confirmReBaseline(): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm('Freeze the current programme as a new baseline? Earlier baselines, including the original, are kept for comparison.');
}

/** At-a-glance read of the imported programme: window, critical path, logic depth. */
function ProgrammeSummary({ acts }: { acts: ScheduleActivity[] }) {
  const starts = acts.map((a) => a.plannedStart).filter(Boolean).sort();
  const finishes = acts.map((a) => a.plannedFinish).filter(Boolean).sort();
  const critical = acts.filter((a) => a.isCritical).length;
  const milestones = acts.filter((a) => a.isMilestone).length;
  const linked = acts.filter((a) => a.predecessors && a.predecessors.length > 0).length;
  const wbsCount = new Set(acts.map((a) => a.wbs)).size;
  const complete = acts.filter((a) => a.status === 'completed').length;
  const inProgress = acts.filter((a) => a.status === 'in_progress').length;
  const hasP6 = acts.some((a) => a.totalFloatDays != null);

  return (
    <div className="kpi-grid" aria-label="Programme summary">
      <div className="kpi">
        <div className="kpi-label">Programme window</div>
        <div className="kpi-value" style={{ fontSize: 15 }}>{starts[0] || '—'} → {finishes[finishes.length - 1] || '—'}</div>
        <div className="kpi-sub muted">{acts.length} activities · {wbsCount} WBS</div>
      </div>
      {hasP6 && (
        <div className="kpi">
          <div className="kpi-label">Critical path</div>
          <div className="kpi-value">{critical}</div>
          <div className="kpi-sub muted">activities with zero or negative float</div>
        </div>
      )}
      <div className="kpi">
        <div className="kpi-label">Status</div>
        <div className="kpi-value" style={{ fontSize: 15 }}>{complete} done · {inProgress} active</div>
        <div className="kpi-sub muted">{acts.length - complete - inProgress} not started</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Logic &amp; milestones</div>
        <div className="kpi-value" style={{ fontSize: 15 }}>{linked} linked · {milestones} milestones</div>
        <div className="kpi-sub muted">{linked === 0 ? 'no predecessor logic imported' : 'driving relationships from the programme'}</div>
      </div>
    </div>
  );
}

function Schedule({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [wbs, setWbs] = useState<ScheduleWbsNode[]>([]);
  const [meta, setMeta] = useState<ScheduleMeta | null>(null);
  const [baselines, setBaselines] = useState<ScheduleBaseline[]>([]);
  const [compareId, setCompareId] = useState('');
  const [importing, setImporting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [derived, setDerived] = useState<ActivityDerivedRow[]>([]);
  const [tol, setTol] = useState<number>(DEFAULT_COMMERCIAL_CONFIG.divergenceTolerancePct ?? 10);

  function load() {
    void Promise.all([provider.listSchedule(projectId), provider.listScheduleWbs(projectId), provider.getScheduleMeta(projectId), provider.listScheduleBaselines(projectId)])
      .then(([sched, nodes, m, bs]) => { setActs(sched); setWbs(nodes); setMeta(m); setBaselines(bs); });
  }
  useEffect(() => {
    let a = true;
    void Promise.all([
      provider.listSchedule(projectId), provider.listScheduleWbs(projectId), provider.getScheduleMeta(projectId), provider.listScheduleBaselines(projectId),
      provider.listBoq(projectId), provider.listBoqWbs(projectId), provider.listProgress(projectId), provider.getCommercialConfig(projectId),
    ]).then(([sched, nodes, m, bs, items, links, progress, cfg]) => {
      if (!a) return;
      setActs(sched); setWbs(nodes); setMeta(m); setBaselines(bs);
      setTol(cfg.divergenceTolerancePct ?? 10);
      setDerived(activityDerivedProgress(sched, items, links, progress, new Date().toISOString().slice(0, 10)));
    });
    return () => { a = false; };
  }, [provider, projectId]);
  const derivedOf = Object.fromEntries(derived.map((d) => [d.activityId, d]));
  // Default comparison is the ORIGINAL contract baseline.
  const baseline = baselines.find((b) => b.id === compareId) ?? baselines[0] ?? null;

  return (
    <div>
      {importing && <BaselineImport projectId={projectId} kind="schedule" onClose={() => setImporting(false)} onDone={load} />}
      {/* Approving the programme captures a baseline, so reload the set on lock changes. */}
      <ScheduleWorkflowStrip projectId={projectId} onChange={(l) => { setLocked(l); void provider.listScheduleBaselines(projectId).then(setBaselines); }} />
      <div className="section-head"><h3>Activities</h3>
        <div className="head-tools">
          <span className="muted">{acts.length} activities</span>
          {baseline ? (
            <span className="status-pill st-paid" aria-label="Schedule baseline" title={`Frozen ${baseline.capturedAt} · ${baseline.source ?? 'approval'}`}>
              {baselineLabel(baseline)}
            </span>
          ) : (
            <span className="muted small" title="A baseline is captured when the programme is approved and locked, not when a file is imported.">
              No baseline — approve the programme to freeze it
            </span>
          )}
          <BaselineSelector baselines={baselines} selectedId={baseline?.id ?? ''} onSelect={setCompareId} />
          {acts.length > 0 && baselines.length > 0 && (
            <button className="btn-ghost" title="Freeze the current programme as an additional baseline. Earlier baselines — including the original the contract was signed against — are kept."
              onClick={() => { if (confirmReBaseline()) void provider.setScheduleBaseline(projectId).then(() => provider.listScheduleBaselines(projectId).then(setBaselines)); }}>
              Re-baseline
            </button>
          )}
          <button className="btn-ghost" disabled={locked} title={locked ? 'Baseline locked — amend to edit' : ''} onClick={() => setImporting(true)}>Import baseline</button>
        </div>
      </div>
      {acts.length > 0 && <ProgrammeSummary acts={acts} />}
      {acts.length === 0 ? (
        <p className="muted">No schedule baseline yet. Use <strong>Import baseline</strong> to upload a Primavera P6 .xer, an .xlsx, or paste activities.</p>
      ) : (
        <>
          <ActivityTable activities={acts} wbs={wbs} meta={meta} baseline={baseline} />

          {/* Commercial read of the same programme: how physical progress derived
              from validated BOQ quantities compares with the schedule. */}
          <div className="section-head" style={{ marginTop: 22 }}><h3>Progress analysis</h3>
            <span className="muted small">derived from executed BOQ quantities via the BOQ↔WBS mapping</span>
          </div>
          <table className="data-table" aria-label="Schedule analysis">
            <thead><tr><th>WBS</th><th>Activity</th><th>Name</th><th>Status</th><th className="num" title="Total float from the imported programme — 0 or less means the activity is on the critical path">Float</th><th title="Driving logic from the imported P6 programme">Predecessors</th><th className="num">Physical % (derived)</th><th className="num">Expected %</th><th className="num">&#916;</th></tr></thead>
            <tbody>
              {acts.map((a) => {
                const d = derivedOf[a.activityId];
                const flag = d?.mapped && Math.abs(d.divergence) > tol;
                return (
                  <tr key={a.id} className={flag ? 'row-flag' : ''}>
                    <td title={a.wbsPath}>{a.wbs}</td><td>{a.activityId}</td><td>{a.name}</td>
                    <td>{a.status ? <span className={`status-pill ${ACT_STATUS_CLASS[a.status]}`}>{ACT_STATUS_LABEL[a.status]}</span> : (a.isMilestone ? <span className="status-pill">Milestone</span> : 'Task')}</td>
                    <td className={`num${a.isCritical ? ' neg' : ''}`} title={a.isCritical ? 'On the critical path' : ''}>
                      {a.totalFloatDays == null ? '\u2014' : `${a.totalFloatDays}d${a.isCritical ? ' \u26a0' : ''}`}
                    </td>
                    <td className="small muted">{predecessorLabel(a.predecessors) || '\u2014'}</td>
                    <td className="num">{a.isMilestone ? '\u2014' : d?.mapped ? `${d.derivedPct}%` : <span className="muted small" title="No confirmed BOQ-to-WBS mapping — map it in the Mapping tab">unmapped</span>}</td>
                    <td className="num">{a.isMilestone ? '\u2014' : `${d?.expectedPct ?? 0}%`}</td>
                    <td className={`num${flag ? ' neg' : ''}`}>{a.isMilestone || !d?.mapped ? '\u2014' : `${d.divergence > 0 ? '+' : ''}${d.divergence}%${flag ? ' \u26a0' : ''}`}</td>
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

/** The Gantt lives in its own tab so the timeline gets the full width. */
function Gantt({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [wbs, setWbs] = useState<ScheduleWbsNode[]>([]);
  const [meta, setMeta] = useState<ScheduleMeta | null>(null);
  const [baselines, setBaselines] = useState<ScheduleBaseline[]>([]);
  const [compareId, setCompareId] = useState('');
  useEffect(() => {
    let a = true;
    void Promise.all([provider.listSchedule(projectId), provider.listScheduleWbs(projectId), provider.getScheduleMeta(projectId), provider.listScheduleBaselines(projectId)])
      .then(([sched, nodes, m, bs]) => { if (a) { setActs(sched); setWbs(nodes); setMeta(m); setBaselines(bs); } });
    return () => { a = false; };
  }, [provider, projectId]);

  if (acts.length === 0) {
    return <p className="muted">No schedule baseline yet. Import one under <strong>Activities</strong> to see the Gantt chart.</p>;
  }
  const baseline = baselines.find((b) => b.id === compareId) ?? baselines[0] ?? null;
  return (
    <>
      {baselines.length > 1 && (
        <div className="create-row" style={{ marginBottom: 8 }}>
          <BaselineSelector baselines={baselines} selectedId={baseline?.id ?? ''} onSelect={setCompareId} />
        </div>
      )}
      <GanttChart activities={acts} wbs={wbs} meta={meta} baseline={baseline} />
    </>
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

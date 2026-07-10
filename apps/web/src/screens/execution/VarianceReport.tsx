import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { varianceReport, type VarianceRow } from '../../domain/varianceReport';
import { formatP6Date } from '../../domain/scheduleTree';
import { baselineLabel } from '../../components/BaselineSelector';
import type { ScheduleActivity, ScheduleBaseline } from '../../data/types';

type Filter = 'all' | 'slipped' | 'critical' | 'new';

const day = (n: number | null): string => (n === null ? '—' : n === 0 ? '0' : `${n > 0 ? '+' : ''}${n}d`);
const cls = (n: number | null): string => (n === null ? 'muted' : n > 0 ? 'neg' : n < 0 ? 'pos' : '');

/**
 * The variance report: current programme measured against the original approval
 * (the contract yardstick a delay claim is argued from) and against the latest
 * approved revision (what the team is judged on today). The gap between them is
 * the slip that approved amendments have already absorbed.
 */
export function VarianceReport({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [baselines, setBaselines] = useState<ScheduleBaseline[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let alive = true;
    void Promise.all([provider.listSchedule(projectId), provider.listScheduleBaselines(projectId)])
      .then(([s, b]) => { if (alive) { setActs(s); setBaselines(b); } });
    return () => { alive = false; };
  }, [provider, projectId]);

  const { rows, summary } = useMemo(() => varianceReport(acts, baselines), [acts, baselines]);

  if (acts.length === 0) return <p className="muted">No schedule yet. Import a programme under <strong>Activities</strong>.</p>;
  if (baselines.length === 0) {
    return (
      <p className="muted">
        No baseline to measure against. Variance is only meaningful once a programme has been
        approved and locked — approve it under <strong>Activities</strong>.
      </p>
    );
  }

  const shown = rows.filter((r) => {
    if (filter === 'slipped') return (r.varVsRevision ?? 0) > 0;
    if (filter === 'critical') return r.isCritical;
    if (filter === 'new') return r.varVsOriginal === null;
    return true;
  });

  const original = baselines[0];
  const revision = baselines.length > 1 ? baselines[baselines.length - 1] : null;

  return (
    <div>
      <div className="section-head">
        <h3>Variance &amp; claim</h3>
        <span className="muted small">
          measured against {baselineLabel(original)}
          {revision ? ` and ${baselineLabel(revision)}` : ''}
        </span>
      </div>

      <div className="kpi-grid" aria-label="Variance summary">
        <div className="kpi">
          <div className="kpi-label">Finish vs contract baseline</div>
          <div className={`kpi-value ${cls(summary.finishVsOriginal)}`}>{day(summary.finishVsOriginal)}</div>
          <div className="kpi-sub muted">{formatP6Date(summary.originalFinish)} → {formatP6Date(summary.currentFinish)}</div>
        </div>
        {!summary.singleBaseline && (
          <>
            <div className="kpi">
              <div className="kpi-label">Finish vs latest revision</div>
              <div className={`kpi-value ${cls(summary.finishVsRevision)}`}>{day(summary.finishVsRevision)}</div>
              <div className="kpi-sub muted">what the team is judged on today</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Absorbed by amendments</div>
              <div className="kpi-value">{day(summary.absorbedByRevision)}</div>
              <div className="kpi-sub muted">time already granted by approved revisions</div>
            </div>
          </>
        )}
        <div className="kpi">
          <div className="kpi-label">Slipped activities</div>
          <div className={`kpi-value ${summary.slippedVsRevision > 0 ? 'neg' : ''}`}>{summary.slippedVsRevision}</div>
          <div className="kpi-sub muted">{summary.criticalSlipped} on the critical path · {summary.aheadVsRevision} ahead</div>
        </div>
        {summary.newActivities > 0 && (
          <div className="kpi">
            <div className="kpi-label">New scope</div>
            <div className="kpi-value">{summary.newActivities}</div>
            <div className="kpi-sub muted">activities absent from the contract baseline</div>
          </div>
        )}
      </div>

      {summary.finishVsOriginal > 0 && summary.finishVsRevision <= 0 && (
        <p className="muted small" style={{ marginTop: 6 }}>
          The programme is {summary.finishVsOriginal} day(s) behind the contract baseline while sitting on
          its latest approved revision — the difference is time already granted, not time lost.
        </p>
      )}

      <div className="filter-bar" role="group" aria-label="Variance filters" style={{ margin: '10px 0' }}>
        {([['all', 'All'], ['slipped', 'Slipped'], ['critical', 'Critical'], ['new', 'New scope']] as const).map(([k, label]) => (
          <button key={k} className="btn-ghost btn-mini" aria-pressed={filter === k} onClick={() => setFilter(k)}
            style={filter === k ? { borderColor: 'var(--primary)', fontWeight: 600 } : undefined}>{label}</button>
        ))}
        <span className="muted small">{shown.length} of {rows.length} activities</span>
      </div>

      <table className="data-table" aria-label="Variance report">
        <thead>
          <tr>
            <th>Activity</th><th>Name</th>
            <th>Contract finish</th>
            {!summary.singleBaseline && <th>Revision finish</th>}
            <th>Current finish</th>
            <th className="num" title="Positive means later than the programme the contract was signed against">vs Contract</th>
            {!summary.singleBaseline && <th className="num" title="Positive means later than the latest approved revision">vs Revision</th>}
            {!summary.singleBaseline && <th className="num" title="Time the approved revision granted against the original">Absorbed</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => <Row key={r.activityId} row={r} single={summary.singleBaseline} />)}
        </tbody>
      </table>
      {shown.length === 0 && <p className="muted">Nothing matches that filter.</p>}
    </div>
  );
}

function Row({ row, single }: { row: VarianceRow; single: boolean }) {
  return (
    <tr className={(row.varVsRevision ?? 0) > 0 && row.isCritical ? 'row-flag' : ''}>
      <td>{row.activityId}{row.isCritical && <span className="neg" title="On the critical path"> ⚠</span>}</td>
      <td>{row.name}</td>
      <td>{row.originalFinish ? formatP6Date(row.originalFinish) : <span className="muted small">new</span>}</td>
      {!single && <td>{row.revisionFinish ? formatP6Date(row.revisionFinish) : <span className="muted small">new</span>}</td>}
      <td>{formatP6Date(row.currentFinish)}</td>
      <td className={`num ${cls(row.varVsOriginal)}`}>{day(row.varVsOriginal)}</td>
      {!single && <td className={`num ${cls(row.varVsRevision)}`}>{day(row.varVsRevision)}</td>}
      {!single && <td className="num muted">{day(row.absorbedByRevision)}</td>}
    </tr>
  );
}

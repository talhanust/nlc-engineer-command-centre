import { useMemo, useState } from 'react';
import type { ScheduleActivity, ScheduleWbsNode, ScheduleMeta, ScheduleBaseline } from '../data/types';
import { buildScheduleRows, formatP6Date, type ScheduleRow } from '../domain/scheduleTree';
import { baselineIndex, varianceOf } from '../domain/scheduleDiff';

/** The P6 activity table: WBS summary rows (bold, collapsible) with their
 *  activities beneath, showing the columns a planner expects. */
export function ActivityTable({
  activities, wbs, meta, baseline = null,
}: { activities: ScheduleActivity[]; wbs: ScheduleWbsNode[]; meta: ScheduleMeta | null; baseline?: ScheduleBaseline | null }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');

  const rows = useMemo(() => buildScheduleRows(activities, wbs, meta, collapsed), [activities, wbs, meta, collapsed]);
  const baseIdx = useMemo(() => baselineIndex(baseline), [baseline]);
  const hasBaseline = baseIdx.size > 0;

  // Filtering searches activities; matching rows keep their WBS ancestry visible
  // by simply showing the flat matches, which is what P6's find does.
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => r.kind === 'activity' && (r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)))
    : rows;

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const wbsIds = wbs.map((n) => n.id);
  const allCollapsed = wbsIds.length > 0 && wbsIds.every((id) => collapsed.has(id));

  return (
    <div>
      <div className="create-row" style={{ marginBottom: 8 }}>
        <input
          aria-label="Find activity"
          placeholder="Find activity by ID or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 260 }}
        />
        {wbsIds.length > 0 && (
          <button className="btn-ghost" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(wbsIds))}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        <span className="muted small">{shown.filter((r) => r.kind === 'activity').length} activities</span>
      </div>

      <table className="data-table" aria-label="Schedule">
        <thead>
          <tr>
            <th style={{ minWidth: 150 }}>Activity ID</th>
            <th style={{ minWidth: 260 }}>Activity Name</th>
            <th className="num" title="Original duration in working days">Original Duration</th>
            <th className="num" title="Remaining duration in working days">Remaining Duration</th>
            <th className="num" title="Duration-based schedule % complete">Schedule % Complete</th>
            <th>Start</th>
            <th>Finish</th>
            {hasBaseline && <th className="num" title="Finish variance against the frozen baseline — positive is slip">Var</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (r.kind === 'wbs'
            ? <WbsRow key={r.key} row={r} onToggle={toggle} showVar={hasBaseline} />
            : <ActivityRow key={r.key} row={r} variance={hasBaseline ? varianceOf({ activityId: r.code, plannedStart: r.start, plannedFinish: r.finish }, baseIdx) : null} showVar={hasBaseline} />))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="muted">No activity matches “{query}”.</p>}
    </div>
  );
}

function WbsRow({ row, onToggle, showVar }: { row: ScheduleRow; onToggle: (id: string) => void; showVar: boolean }) {
  return (
    <tr className="wbs-row">
      <td colSpan={2} style={{ paddingLeft: 8 + row.depth * 16 }}>
        <button
          className="wbs-toggle"
          aria-expanded={!row.collapsed}
          aria-label={`${row.collapsed ? 'Expand' : 'Collapse'} ${row.name}`}
          onClick={() => onToggle(row.key)}
        >
          {row.collapsed ? '▸' : '▾'}
        </button>
        <strong>{row.name}</strong>
      </td>
      <td className="num"><strong>{row.originalDuration}</strong></td>
      <td className="num"><strong>{row.remainingDuration}</strong></td>
      <td className="num"><strong>{row.schedulePct}%</strong></td>
      <td><strong>{formatP6Date(row.start)}</strong></td>
      <td><strong>{formatP6Date(row.finish)}</strong></td>
      {showVar && <td className="num" />}
    </tr>
  );
}

function ActivityRow({ row, variance, showVar }: { row: ScheduleRow; variance: { finishVarDays: number; baselineFinish: string } | null; showVar: boolean }) {
  const v = variance?.finishVarDays ?? 0;
  return (
    <tr className={row.isCritical ? 'row-critical' : ''}>
      <td style={{ paddingLeft: 8 + row.depth * 16 }} title={row.activity?.wbsPath}>
        {row.code}
        {row.isCritical && <span className="neg" title="On the critical path"> ⚠</span>}
      </td>
      <td>{row.isMilestone ? <>◆ {row.name}</> : row.name}</td>
      <td className="num">{row.originalDuration}</td>
      <td className="num">{row.remainingDuration}</td>
      <td className="num">{row.schedulePct}%</td>
      <td>{formatP6Date(row.start)}</td>
      <td>{formatP6Date(row.finish)}</td>
      {showVar && (
        <td className={`num${v > 0 ? ' neg' : v < 0 ? ' pos' : ''}`}
          title={variance ? `Baseline finish ${formatP6Date(variance.baselineFinish)}` : 'Not in the baseline'}>
          {!variance ? 'new' : v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}d`}
        </td>
      )}
    </tr>
  );
}

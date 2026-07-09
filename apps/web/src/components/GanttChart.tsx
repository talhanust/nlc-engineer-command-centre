import { useMemo, useState } from 'react';
import type { ScheduleActivity, ScheduleWbsNode, ScheduleMeta } from '../data/types';
import { buildScheduleRows, formatP6Date, type ScheduleRow } from '../domain/scheduleTree';
import { chartPalette } from './chartUtils';

const DAY = 86400000;
const ROW_H = 24;
const HEADER_H = 40;
const LABEL_W = 300;
const BAR_H = 10;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ZOOMS = [
  { key: 'year', label: 'Year', dayW: 1.1 },
  { key: 'quarter', label: 'Quarter', dayW: 3 },
  { key: 'month', label: 'Month', dayW: 8 },
  { key: 'week', label: 'Week', dayW: 22 },
] as const;
type ZoomKey = (typeof ZOOMS)[number]['key'];

const parse = (ymd: string): number => Date.parse(`${ymd}T00:00:00Z`);
const addMonths = (t: number, n: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};

/**
 * A time-scaled Gantt in the shape planners expect: a fixed activity column on
 * the left, a scrollable timeline on the right with year + month header bands,
 * WBS summary bars, activity bars (critical in red), milestone diamonds, a
 * progress overlay and the P6 data-date line.
 */
export function GanttChart({
  activities, wbs = [], meta = null,
}: { activities: ScheduleActivity[]; wbs?: ScheduleWbsNode[]; meta?: ScheduleMeta | null }) {
  const c = chartPalette();
  const [zoom, setZoom] = useState<ZoomKey>('quarter');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const rows = useMemo(() => buildScheduleRows(activities, wbs, meta, collapsed), [activities, wbs, meta, collapsed]);

  const bounds = useMemo(() => {
    const starts = activities.map((a) => parse(a.plannedStart)).filter(Number.isFinite);
    const finishes = activities.map((a) => parse(a.plannedFinish)).filter(Number.isFinite);
    if (starts.length === 0) return null;
    // Pad to whole months so the header bands line up.
    const t0 = addMonths(Math.min(...starts), 0);
    const t1 = addMonths(Math.max(...finishes), 1);
    return { t0, t1 };
  }, [activities]);

  if (activities.length === 0 || !bounds) return null;

  const dayW = ZOOMS.find((z) => z.key === zoom)!.dayW;
  const totalDays = Math.max(1, Math.round((bounds.t1 - bounds.t0) / DAY));
  const chartW = Math.max(320, Math.round(totalDays * dayW));
  const bodyH = rows.length * ROW_H;
  const x = (t: number): number => ((t - bounds.t0) / DAY) * dayW;

  // Header bands: one tick per month, grouped by year.
  const months: Array<{ t: number; w: number; label: string; year: number }> = [];
  for (let t = bounds.t0; t < bounds.t1; t = addMonths(t, 1)) {
    const next = addMonths(t, 1);
    months.push({ t, w: x(Math.min(next, bounds.t1)) - x(t), label: MONTHS[new Date(t).getUTCMonth()], year: new Date(t).getUTCFullYear() });
  }
  const years: Array<{ x: number; w: number; year: number }> = [];
  for (const m of months) {
    const last = years[years.length - 1];
    if (last && last.year === m.year) last.w += m.w;
    else years.push({ x: x(m.t), w: m.w, year: m.year });
  }

  const dataDateX = meta?.dataDate && Number.isFinite(parse(meta.dataDate)) ? x(parse(meta.dataDate)) : null;

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
    <div className="card">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h3>Gantt chart</h3>
        <div className="head-tools">
          {wbsIds.length > 0 && (
            <button className="btn-ghost" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(wbsIds))}>
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
          {ZOOMS.map((z) => (
            <button key={z.key} className={`subtab${zoom === z.key ? ' active' : ''}`} onClick={() => setZoom(z.key)}>{z.label}</button>
          ))}
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Bars show planned windows · <span style={{ color: c.danger }}>red = critical path</span> · ◆ milestone
        {dataDateX != null && meta?.dataDate ? ` · data date ${formatP6Date(meta.dataDate)}` : ''}
      </p>

      <div className="gantt-wrap" role="img" aria-label="Gantt chart">
        <div className="gantt-panes">
          {/* Fixed activity column */}
          <div className="gantt-left" style={{ width: LABEL_W }}>
            <div className="gantt-head" style={{ height: HEADER_H }}>Activity</div>
            {rows.map((r) => (
              <div
                key={r.key}
                className={`gantt-label${r.kind === 'wbs' ? ' is-wbs' : ''}`}
                style={{ height: ROW_H, paddingLeft: 6 + r.depth * 14 }}
                title={r.kind === 'activity' ? `${r.code} · ${r.name}` : r.name}
              >
                {r.kind === 'wbs' && (
                  <button className="wbs-toggle" aria-expanded={!r.collapsed} aria-label={`${r.collapsed ? 'Expand' : 'Collapse'} ${r.name}`} onClick={() => toggle(r.key)}>
                    {r.collapsed ? '▸' : '▾'}
                  </button>
                )}
                <span className="gantt-label-text">{r.kind === 'wbs' ? r.name : `${r.code}  ${r.name}`}</span>
              </div>
            ))}
          </div>

          {/* Scrollable timeline */}
          <div className="gantt-right">
            <div className="gantt-head-sticky" style={{ height: HEADER_H }}>
              <svg width={chartW} height={HEADER_H} role="presentation">
                {years.map((y) => (
                  <g key={y.year}>
                    <rect x={y.x} y={0} width={y.w} height={HEADER_H / 2} fill="transparent" />
                    <text x={y.x + 6} y={14} fontSize={11} fontWeight={700} fill={c.text}>{y.year}</text>
                    <line x1={y.x} y1={0} x2={y.x} y2={HEADER_H} stroke={c.grid} />
                  </g>
                ))}
                {months.map((m, i) => (
                  <g key={i}>
                    <line x1={x(m.t)} y1={HEADER_H / 2} x2={x(m.t)} y2={HEADER_H} stroke={c.grid} />
                    {m.w > 16 && <text x={x(m.t) + 3} y={HEADER_H - 6} fontSize={9.5} fill={c.muted}>{m.label}</text>}
                  </g>
                ))}
                <line x1={0} y1={HEADER_H - 0.5} x2={chartW} y2={HEADER_H - 0.5} stroke={c.grid} />
              </svg>
            </div>

            <svg width={chartW} height={Math.max(bodyH, 1)} role="presentation">
              {/* Month gridlines */}
              {months.map((m, i) => (<line key={i} x1={x(m.t)} y1={0} x2={x(m.t)} y2={bodyH} stroke={c.grid} />))}
              {rows.map((r, i) => (<GanttRow key={r.key} row={r} y={i * ROW_H} x={x} c={c} />))}
              {dataDateX != null && (
                <line x1={dataDateX} y1={0} x2={dataDateX} y2={bodyH} stroke={c.danger} strokeWidth={1.5} strokeDasharray="4 3" />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttRow({ row, y, x, c }: { row: ScheduleRow; y: number; x: (t: number) => number; c: ReturnType<typeof chartPalette> }) {
  const s = parse(row.start);
  const f = parse(row.finish);
  if (!Number.isFinite(s) || !Number.isFinite(f)) return null;
  const x0 = x(s);
  const x1 = Math.max(x(f), x0 + 2);
  const mid = y + ROW_H / 2;
  const title = `${row.code} · ${row.name}\n${formatP6Date(row.start)} → ${formatP6Date(row.finish)}\n${row.originalDuration}d${row.isCritical ? ' · critical' : ''}`;

  if (row.isMilestone) {
    const r = 5;
    return (
      <g><title>{title}</title>
        <polygon points={`${x0},${mid - r} ${x0 + r},${mid} ${x0},${mid + r} ${x0 - r},${mid}`} fill={row.isCritical ? c.danger : c.amber} />
      </g>
    );
  }
  if (row.kind === 'wbs') {
    // P6 draws WBS summaries as a flat bar with tapered end caps.
    const h = 6;
    const top = mid - h / 2;
    return (
      <g><title>{title}</title>
        <rect x={x0} y={top} width={x1 - x0} height={h} fill={c.text} opacity={0.75} />
        <polygon points={`${x0},${top + h} ${x0 + 6},${top + h} ${x0},${top + h + 5}`} fill={c.text} opacity={0.75} />
        <polygon points={`${x1},${top + h} ${x1 - 6},${top + h} ${x1},${top + h + 5}`} fill={c.text} opacity={0.75} />
      </g>
    );
  }
  const w = x1 - x0;
  const pct = Math.max(0, Math.min(100, row.schedulePct));
  return (
    <g><title>{title}</title>
      <rect x={x0} y={mid - BAR_H / 2} width={w} height={BAR_H} rx={2} fill={row.isCritical ? c.danger : c.primary} opacity={0.85} />
      {pct > 0 && <rect x={x0} y={mid - BAR_H / 2} width={(w * pct) / 100} height={BAR_H} rx={2} fill={c.text} opacity={0.35} />}
    </g>
  );
}

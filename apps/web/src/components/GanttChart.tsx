import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScheduleActivity, ScheduleWbsNode, ScheduleMeta, ScheduleBaseline } from '../data/types';
import { buildScheduleRows, formatP6Date, type ScheduleRow } from '../domain/scheduleTree';
import { chartPalette } from './chartUtils';
import { baselineIndex } from '../domain/scheduleDiff';
import { floatBand } from '../domain/varianceReport';
import { lookahead } from '../domain/lookahead';

const DAY = 86400000;
const HEADER_H = 40;
const LABEL_W = 300;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical only' },
  { key: 'near', label: 'Near-critical' },
  { key: 'lookahead', label: 'Next 8 weeks' },
  { key: 'inprogress', label: 'In progress' },
  { key: 'milestones', label: 'Milestones' },
] as const;
/** The chip reuses the Lookahead tab's own window, so one screen cannot hold two
 *  different definitions of "the next eight weeks". */
const LOOKAHEAD_WEEKS = 8;
type FilterKey = (typeof FILTERS)[number]['key'];

/**
 * Which rows must actually be rendered for a given scroll position. Overscan
 * keeps a few rows beyond each edge so a fast scroll never shows blank bands.
 * Pure, so the arithmetic is tested rather than inferred from a screenshot.
 */
export function rowWindow(scrollTop: number, viewportH: number, rowH: number, count: number, overscan = 6): { first: number; last: number; padTop: number; padBottom: number } {
  if (rowH <= 0 || count <= 0) return { first: 0, last: 0, padTop: 0, padBottom: 0 };
  const top = Math.max(0, scrollTop);
  const last = Math.min(count, Math.ceil((top + Math.max(0, viewportH)) / rowH) + overscan);
  // Clamp `first` to `last`: a scroll position past the end of the content (a
  // stale scrollTop after a collapse, say) would otherwise render nothing behind
  // a page-tall top spacer.
  const first = Math.min(Math.max(0, Math.floor(top / rowH) - overscan), last);
  return { first, last, padTop: first * rowH, padBottom: Math.max(0, (count - last) * rowH) };
}

const parse = (ymd: string): number => Date.parse(`${ymd}T00:00:00Z`);
const addMonths = (t: number, n: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};

/**
 * An interactive, time-scaled Gantt: a fixed activity column, a scrollable
 * timeline with year + month bands, WBS summary bars, milestone diamonds, the
 * P6 data-date line, and a progress overlay.
 *
 * Interaction: continuous zoom and row-height sliders, a pan slider that scrubs
 * the timeline, view filters, and click-to-select an activity — which traces its
 * driving predecessors with arrows so a planner can walk the logic chain.
 */
export function GanttChart({
  activities, wbs = [], meta = null, baseline = null, collapsed, setCollapsed,
}: {
  activities: ScheduleActivity[]; wbs?: ScheduleWbsNode[]; meta?: ScheduleMeta | null; baseline?: ScheduleBaseline | null;
  collapsed: ReadonlySet<string>;
  setCollapsed: (next: ReadonlySet<string>) => void;
}) {
  const c = chartPalette();
  const [dayW, setDayW] = useState(3);
  const [rowH, setRowH] = useState(24);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showDeps, setShowDeps] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [showBaseline, setShowBaseline] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState(0);
  // Virtualization: only the rows inside the viewport (plus a small overscan) are
  // rendered. A 5,000-activity programme is 120,000px of DOM otherwise, and the
  // zoom slider stutters on every frame.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  const baseIdx = useMemo(() => baselineIndex(baseline), [baseline]);
  const treeRows = useMemo(() => buildScheduleRows(activities, wbs, meta, collapsed), [activities, wbs, meta, collapsed]);

  // Filtering drops the WBS scaffolding and shows the matching activities flat —
  // when you ask for "critical only" you want the chain, not the outline.
  const lookaheadIds = useMemo(
    () => new Set(lookahead(activities, meta?.dataDate ? new Date(meta.dataDate) : new Date(), LOOKAHEAD_WEEKS).map((r) => r.activity.activityId)),
    [activities, meta?.dataDate],
  );
  const rows = useMemo(() => {
    if (filter === 'all') return treeRows;
    const keep = (r: ScheduleRow) =>
      r.kind === 'activity' && (
        filter === 'critical' ? r.isCritical :
        // Near-critical: not yet driving the finish date, but one bad week away.
        filter === 'near' ? (r.activity ? floatBand(r.activity) === 'near_critical' : false) :
        filter === 'lookahead' ? lookaheadIds.has(r.code) :
        filter === 'milestones' ? r.isMilestone :
        r.activity?.status === 'in_progress');
    return treeRows.filter(keep);
  }, [treeRows, filter, lookaheadIds]);

  const bounds = useMemo(() => {
    const starts = activities.map((a) => parse(a.plannedStart)).filter(Number.isFinite);
    const finishes = activities.map((a) => parse(a.plannedFinish)).filter(Number.isFinite);
    if (starts.length === 0) return null;
    return { t0: addMonths(Math.min(...starts), 0), t1: addMonths(Math.max(...finishes), 1) };
  }, [activities]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the pan slider and the actual scroll position in step.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = max > 0 ? (pan / 100) * max : 0;
  }, [pan, dayW]);

  if (activities.length === 0 || !bounds) return null;

  const totalDays = Math.max(1, Math.round((bounds.t1 - bounds.t0) / DAY));
  const chartW = Math.max(320, Math.round(totalDays * dayW));
  const bodyH = Math.max(rows.length * rowH, 1);
  const x = (t: number): number => ((t - bounds.t0) / DAY) * dayW;

  function fitToWidth() {
    const w = scrollRef.current?.clientWidth ?? 900;
    setDayW(Math.max(0.3, Math.min(30, w / totalDays)));
    setPan(0);
  }

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
  const monthStep = Math.max(1, Math.ceil(28 / Math.max(months[0]?.w ?? 28, 1)));

  const dataDateX = meta?.dataDate && Number.isFinite(parse(meta.dataDate)) ? x(parse(meta.dataDate)) : null;

  // jsdom and the first paint report a height of 0; fall back to the CSS max so
  // the chart is never blank.
  const { first: firstRow, last: lastRow, padTop, padBottom } = rowWindow(scrollTop, viewportH || 560, rowH, rows.length);
  const visible = rows.slice(firstRow, lastRow);

  // Selection: the chosen activity and the predecessors that drive it.
  const rowAt = new Map<string, number>();
  rows.forEach((r, i) => { if (r.kind === 'activity') rowAt.set(r.code, i); });
  const selectedRow = selected ? rows.find((r) => r.kind === 'activity' && r.code === selected) : undefined;
  const preds = selectedRow?.activity?.predecessors ?? [];
  const predIds = new Set(preds.map((p) => p.activityId));

  const arrows = showDeps && selectedRow
    ? preds.flatMap((p) => {
        const pi = rowAt.get(p.activityId);
        const si = rowAt.get(selectedRow.code);
        if (pi === undefined || si === undefined) return [];
        const pr = rows[pi];
        const x1 = x(parse(pr.finish));
        const y1 = pi * rowH + rowH / 2;
        const x2 = x(parse(selectedRow.start));
        const y2 = si * rowH + rowH / 2;
        return [{ key: p.activityId, x1, y1, x2, y2 }];
      })
    : [];

  function toggle(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsed(next);
  }
  const wbsIds = wbs.map((n) => n.id);
  const allCollapsed = wbsIds.length > 0 && wbsIds.every((id) => collapsed.has(id));

  return (
    <div className="card">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h3>Gantt chart</h3>
        <div className="head-tools">
          {FILTERS.map((f) => (
            <button key={f.key} className={`subtab${filter === f.key ? ' active' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="gantt-controls">
        <label className="gantt-control">Zoom
          <input type="range" aria-label="Zoom timeline" min={0.3} max={30} step={0.1} value={dayW}
            onChange={(e) => setDayW(Number(e.target.value))} />
          <span className="mono small">{dayW < 1 ? `${dayW.toFixed(1)}` : Math.round(dayW)} px/day</span>
        </label>
        <button className="btn-ghost btn-mini" onClick={fitToWidth}>Fit</button>

        <label className="gantt-control">Scroll
          <input type="range" aria-label="Scroll timeline" min={0} max={100} step={1} value={pan}
            onChange={(e) => setPan(Number(e.target.value))} />
        </label>

        <label className="gantt-control">Row height
          <input type="range" aria-label="Row height" min={16} max={36} step={2} value={rowH}
            onChange={(e) => setRowH(Number(e.target.value))} />
        </label>

        <label className="gantt-control">
          <input type="checkbox" aria-label="Show dependencies" checked={showDeps} onChange={(e) => setShowDeps(e.target.checked)} />
          Dependencies
        </label>

        {baseline && (
          <label className="gantt-control">
            <input type="checkbox" aria-label="Show baseline" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} />
            Baseline
          </label>
        )}

        {wbsIds.length > 0 && filter === 'all' && (
          <button className="btn-ghost btn-mini" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(wbsIds))}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {selected && <button className="btn-ghost btn-mini" onClick={() => setSelected(null)}>Clear selection</button>}
      </div>

      <p className="muted small" style={{ marginTop: 0 }}>
        {rows.filter((r) => r.kind === 'activity').length} activities · <span style={{ color: c.danger }}>red = critical</span> · <span style={{ color: c.amber }}>amber = near-critical</span> · ◆ milestone
        {dataDateX != null && meta?.dataDate ? ` · data date ${formatP6Date(meta.dataDate)}` : ''}
        {baseline && showBaseline ? ' · grey ghost = baseline' : ''}
        {selectedRow ? ` · selected ${selectedRow.code}${preds.length ? `, driven by ${preds.length} predecessor(s)` : ''}` : ' · click a bar to trace its logic'}
      </p>

      <div className="gantt-wrap" role="img" aria-label="Gantt chart" ref={wrapRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
        <div className="gantt-panes">
          <div className="gantt-left" style={{ width: LABEL_W }}>
            <div className="gantt-head" style={{ height: HEADER_H }}>Activity</div>
            <div style={{ height: padTop }} aria-hidden />
            {visible.map((r) => (
              <div
                key={r.key}
                className={`gantt-label${r.kind === 'wbs' ? ' is-wbs' : ''}${selected === r.code ? ' is-selected' : ''}`}
                style={{ height: rowH, paddingLeft: 6 + r.depth * 14 }}
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
            <div style={{ height: padBottom }} aria-hidden />
          </div>

          <div className="gantt-right" ref={scrollRef}>
            <div className="gantt-head-sticky" style={{ height: HEADER_H }}>
              <svg width={chartW} height={HEADER_H} role="presentation">
                {years.map((y) => (
                  <g key={y.year}>
                    <text x={y.x + 6} y={14} fontSize={11} fontWeight={700} fill={c.text}>{y.year}</text>
                    <line x1={y.x} y1={0} x2={y.x} y2={HEADER_H} stroke={c.grid} />
                  </g>
                ))}
                {months.map((m, i) => (
                  <g key={i}>
                    <line x1={x(m.t)} y1={HEADER_H / 2} x2={x(m.t)} y2={HEADER_H} stroke={c.grid} />
                    {i % monthStep === 0 && m.w > 14 && <text x={x(m.t) + 3} y={HEADER_H - 6} fontSize={9.5} fill={c.muted}>{m.label}</text>}
                  </g>
                ))}
                <line x1={0} y1={HEADER_H - 0.5} x2={chartW} y2={HEADER_H - 0.5} stroke={c.grid} />
              </svg>
            </div>

            <svg width={chartW} height={bodyH} role="presentation">
              <defs>
                <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill={c.signal} />
                </marker>
              </defs>
              {months.map((m, i) => (<line key={i} x1={x(m.t)} y1={0} x2={x(m.t)} y2={bodyH} stroke={c.grid} />))}

              {visible.map((r, i) => (
                <GanttRow
                  key={r.key} row={r} y={(firstRow + i) * rowH} rowH={rowH} x={x} c={c}
                  band={r.activity ? floatBand(r.activity) : 'unknown'}
                  base={showBaseline ? baseIdx.get(r.code) : undefined}
                  selected={selected === r.code}
                  dimmed={!!selected && r.kind === 'activity' && r.code !== selected && !predIds.has(r.code)}
                  onSelect={() => setSelected(r.kind === 'activity' ? (selected === r.code ? null : r.code) : selected)}
                />
              ))}

              {arrows.map((a) => {
                const midX = Math.max(a.x1 + 6, a.x2 - 6);
                return (
                  <polyline key={a.key} fill="none" stroke={c.signal} strokeWidth={1.4} markerEnd="url(#gantt-arrow)"
                    points={`${a.x1},${a.y1} ${midX},${a.y1} ${midX},${a.y2} ${a.x2},${a.y2}`} />
                );
              })}

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

function GanttRow({ row, y, rowH, x, c, base, band = 'unknown', selected, dimmed, onSelect }: {
  row: ScheduleRow; y: number; rowH: number; x: (t: number) => number;
  c: ReturnType<typeof chartPalette>; base?: { plannedStart: string; plannedFinish: string };
  band?: ReturnType<typeof floatBand>;
  selected: boolean; dimmed: boolean; onSelect: () => void;
}) {
  const s = parse(row.start);
  const f = parse(row.finish);
  if (!Number.isFinite(s) || !Number.isFinite(f)) return null;
  const x0 = x(s);
  const x1 = Math.max(x(f), x0 + 2);
  const mid = y + rowH / 2;
  const barH = Math.max(6, Math.min(14, rowH - 12));
  const opacity = dimmed ? 0.25 : 1;
  const bandNote = row.isCritical ? ' · critical' : band === 'near_critical' ? ` · near-critical (${row.activity?.totalFloatDays}d float)` : '';
  const title = `${row.code} · ${row.name}\n${formatP6Date(row.start)} → ${formatP6Date(row.finish)}\n${row.originalDuration}d${bandNote}`;
  const barFill = row.isCritical ? c.danger : band === 'near_critical' ? c.amber : c.primary;

  if (row.isMilestone) {
    const r = Math.max(4, barH / 2);
    return (
      <g className="gantt-row-hit" onClick={onSelect} opacity={opacity}><title>{title}</title>
        <polygon points={`${x0},${mid - r} ${x0 + r},${mid} ${x0},${mid + r} ${x0 - r},${mid}`}
          fill={row.isCritical ? c.danger : c.amber} stroke={selected ? c.text : 'none'} strokeWidth={selected ? 1.5 : 0} />
      </g>
    );
  }
  if (row.kind === 'wbs') {
    const h = Math.max(4, barH - 4);
    const top = mid - h / 2;
    return (
      <g opacity={opacity}><title>{title}</title>
        <rect x={x0} y={top} width={x1 - x0} height={h} fill={c.text} opacity={0.75} />
        <polygon points={`${x0},${top + h} ${x0 + 6},${top + h} ${x0},${top + h + 4}`} fill={c.text} opacity={0.75} />
        <polygon points={`${x1},${top + h} ${x1 - 6},${top + h} ${x1},${top + h + 4}`} fill={c.text} opacity={0.75} />
      </g>
    );
  }
  const w = x1 - x0;
  const pct = Math.max(0, Math.min(100, row.schedulePct));
  // The baseline ghost sits under the live bar, so slip reads as an overhang.
  let ghost: { x: number; w: number } | null = null;
  if (base && row.kind === 'activity') {
    const bs = parse(base.plannedStart);
    const bf = parse(base.plannedFinish);
    if (Number.isFinite(bs) && Number.isFinite(bf)) {
      const gx = x(bs);
      ghost = { x: gx, w: Math.max(x(bf) - gx, 2) };
    }
  }
  return (
    <g className="gantt-row-hit" onClick={onSelect} opacity={opacity}><title>{title}</title>
      {ghost && <rect x={ghost.x} y={mid + barH / 2 + 1} width={ghost.w} height={3} rx={1.5} fill={c.muted} opacity={0.55} />}
      <rect x={x0} y={mid - barH / 2} width={w} height={barH} rx={2}
        fill={barFill} opacity={0.85}
        stroke={selected ? c.text : 'none'} strokeWidth={selected ? 1.5 : 0} />
      {pct > 0 && <rect x={x0} y={mid - barH / 2} width={(w * pct) / 100} height={barH} rx={2} fill={c.text} opacity={0.35} />}
    </g>
  );
}

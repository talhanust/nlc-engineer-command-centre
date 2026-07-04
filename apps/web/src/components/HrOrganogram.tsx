import { createContext, useContext, useMemo, useState } from 'react';
import type { HrUnit, HrPerson } from '../data/types';
import {
  buildOrganogram, commandSpine, rolledStrength, establishmentTotals,
  fillStatus, fillPct, type OrgoNode,
} from '../domain/organogram';
import type { Occupancy } from '../domain/roster';
import { HrAvatar } from './HrAvatar';

interface OrgoCtx {
  occupancy?: Map<string, Occupancy>;
  peopleByUnit?: Map<string, HrPerson[]>;
  onSelectUnit?: (unitId: string) => void;
  selectedUnitId?: string;
  // editing
  editable?: boolean;
  onAdd?: (parentId: string | null) => void;
  onEdit?: (unit: HrUnit) => void;
  onDelete?: (unit: HrUnit) => void;
  onReparent?: (unitId: string, newParentId: string | null) => void;
  // outline collapse + search
  collapsedIds?: Set<string>;
  toggleCollapse?: (id: string) => void;
  searchActive?: boolean;
  visibleIds?: Set<string> | null;
}
const Ctx = createContext<OrgoCtx>({});

/** Named occupants of a unit (and empty seats), shown inline under a box. */
function Occupants({ node }: { node: OrgoNode }) {
  const { peopleByUnit } = useContext(Ctx);
  const list = peopleByUnit?.get(node.id) ?? [];
  const isLeaf = node.children.length === 0;
  if (!peopleByUnit || (!isLeaf && list.length === 0)) return null;
  const empty = Math.max(0, node.held - list.length);
  if (list.length === 0 && empty === 0) return null;
  return (
    <div className="orgo-occupants">
      {list.map((p) => (
        <span className="orgo-occ" key={p.id} title={`${p.name}${p.rank ? ' · ' + p.rank : ''} · ${p.status}`}>
          <HrAvatar person={p} size={16} />
          <span className="occ-name">{p.name}</span>
        </span>
      ))}
      {isLeaf && Array.from({ length: empty }).map((_, i) => (
        <span className="orgo-occ vacant" key={`v${i}`}>vacant</span>
      ))}
    </div>
  );
}

function leafIds(node: OrgoNode): string[] {
  if (node.children.length === 0) return [node.id];
  return node.children.flatMap(leafIds);
}

function FillBar({ held, auth }: { held: number; auth: number }) {
  const pct = fillPct(held, auth);
  const status = fillStatus(held, auth);
  return (
    <div className="orgo-fill" title={`${held} held of ${auth} authorised`}>
      <div className={`orgo-fill-track status-${status}`}>
        <div className="orgo-fill-bar" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="orgo-fill-num">{held}/{auth}</span>
    </div>
  );
}

function StatusDot({ held, auth }: { held: number; auth: number }) {
  return <span className={`orgo-dot status-${fillStatus(held, auth)}`} aria-hidden />;
}

function SeatChip({ node }: { node: OrgoNode }) {
  const { occupancy } = useContext(Ctx);
  if (!occupancy) return null;
  const ids = leafIds(node);
  let named = 0, present = 0;
  for (const id of ids) { const o = occupancy.get(id); if (o) { named += o.named; present += o.present; } }
  const held = rolledStrength(node).held;
  const empty = Math.max(0, held - named);
  if (named === 0 && empty === 0) return null;
  return (
    <span className="orgo-seatchip" title={`${present} present · ${named} named · ${empty} empty seats`}>
      <span className="seat-present">{present}</span>
      <span className="seat-sep">/</span>
      <span className="seat-named">{named}</span>
      {empty > 0 && <span className="seat-empty">+{empty}</span>}
    </span>
  );
}

/** Add / edit / delete affordances shown on each box in edit mode. */
function EditTools({ node, allowAdd = true }: { node: OrgoNode; allowAdd?: boolean }) {
  const { editable, onAdd, onEdit, onDelete } = useContext(Ctx);
  if (!editable) return null;
  const bare: HrUnit = {
    id: node.id, nodeId: node.nodeId, parentId: node.parentId, title: node.title,
    scale: node.scale, category: node.category, auth: node.auth, held: node.held, order: node.order,
  };
  return (
    <span className="orgo-edit-tools no-print" onClick={(e) => e.stopPropagation()}>
      {allowAdd && <button className="orgo-edit-btn" title="Add post under this" aria-label={`Add post under ${node.title}`} onClick={() => onAdd?.(node.id)}>＋</button>}
      <button className="orgo-edit-btn" title="Edit" aria-label={`Edit ${node.title}`} onClick={() => onEdit?.(bare)}>✎</button>
      <button className="orgo-edit-btn danger" title="Delete" aria-label={`Delete ${node.title}`} onClick={() => onDelete?.(bare)}>✕</button>
    </span>
  );
}

function useDnd(node: OrgoNode) {
  const { editable, onReparent } = useContext(Ctx);
  if (!editable || !onReparent) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/hru', node.id); e.stopPropagation(); },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/hru')) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      const id = e.dataTransfer.getData('text/hru');
      if (id && id !== node.id) onReparent(id, node.id);
    },
  };
}

function PostRow({ node, depth }: { node: OrgoNode; depth: number }) {
  const { onSelectUnit, selectedUnitId, editable } = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const s = rolledStrength(node);
  const hasKids = node.children.length > 0;
  const selected = selectedUnitId === node.id;
  const dnd = useDnd(node);
  return (
    <>
      <div
        className={`orgo-post${hasKids ? ' has-kids' : ''}${selected ? ' selected' : ''}${editable ? ' editable' : ''}`}
        style={{ paddingLeft: 8 + Math.min(depth, 4) * 10 }}
        onClick={() => { onSelectUnit?.(node.id); if (hasKids) setOpen((o) => !o); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectUnit?.(node.id); if (hasKids) setOpen((o) => !o); } }}
        aria-expanded={hasKids ? open : undefined}
        {...dnd}
      >
        <span className="orgo-post-main">
          {hasKids && <span className={`orgo-caret${open ? ' open' : ''}`}>▸</span>}
          <StatusDot held={s.held} auth={s.auth} />
          <span className="orgo-post-title">{node.title}</span>
          {node.scale && <span className="orgo-scale">{node.scale}</span>}
        </span>
        <span className="orgo-post-right">
          <SeatChip node={node} />
          <span className="orgo-post-num">{s.held}/{s.auth}</span>
          <EditTools node={node} />
        </span>
        <Occupants node={node} />
      </div>
      {hasKids && open && node.children.map((c) => <PostRow key={c.id} node={c} depth={depth + 1} />)}
    </>
  );
}

/** A row in the indented-tree (outline) layout — better for deep hierarchies. */
function OutlineNode({ node, depth }: { node: OrgoNode; depth: number }) {
  const { onSelectUnit, selectedUnitId, editable, collapsedIds, toggleCollapse, searchActive, visibleIds } = useContext(Ctx);
  const s = rolledStrength(node);
  const hasKids = node.children.length > 0;
  const selected = selectedUnitId === node.id;
  const dnd = useDnd(node);
  if (visibleIds && !visibleIds.has(node.id)) return null;
  const open = searchActive ? true : !collapsedIds?.has(node.id);
  return (
    <div className="orgo-ol-branch">
      <div
        className={`orgo-ol-row${selected ? ' selected' : ''}${editable ? ' editable' : ''}`}
        style={{ paddingLeft: 6 + depth * 18 }}
        onClick={() => onSelectUnit?.(node.id)}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectUnit?.(node.id); } }}
        {...dnd}
      >
        <button
          className="orgo-ol-caret"
          onClick={(e) => { e.stopPropagation(); if (hasKids) toggleCollapse?.(node.id); }}
          aria-label={hasKids ? `${open ? 'Collapse' : 'Expand'} ${node.title}` : node.title}
          style={{ visibility: hasKids ? 'visible' : 'hidden' }}
        >
          <span className={`orgo-caret${open ? ' open' : ''}`}>▸</span>
        </button>
        <StatusDot held={s.held} auth={s.auth} />
        <span className="orgo-ol-title">{node.title}</span>
        {node.scale && <span className="orgo-scale">{node.scale}</span>}
        <span className="orgo-ol-spacer" />
        <div className="orgo-ol-bar"><div className={`orgo-fill-track status-${fillStatus(s.held, s.auth)}`}><div className="orgo-fill-bar" style={{ width: `${Math.min(100, fillPct(s.held, s.auth))}%` }} /></div></div>
        <SeatChip node={node} />
        <span className="orgo-post-num">{s.held}/{s.auth}</span>
        <EditTools node={node} />
      </div>
      <Occupants node={node} />
      {hasKids && open && node.children.map((c) => <OutlineNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

function SectionCard({ node }: { node: OrgoNode }) {
  const { onSelectUnit, selectedUnitId, editable } = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const s = rolledStrength(node);
  const hasKids = node.children.length > 0;
  const vacancy = s.auth - s.held;
  const selected = selectedUnitId === node.id;
  const dnd = useDnd(node);
  return (
    <div
      className={`orgo-section status-${fillStatus(s.held, s.auth)}${selected ? ' selected' : ''}${editable ? ' editable' : ''}`}
      onClick={() => onSelectUnit?.(node.id)}
      {...dnd}
    >
      <div className="orgo-section-top">
        <button
          className="orgo-section-head"
          onClick={(e) => { if (hasKids) { e.stopPropagation(); setOpen((o) => !o); } }}
          aria-expanded={hasKids ? open : undefined}
          aria-label={hasKids ? `${open ? 'Collapse' : 'Expand'} ${node.title}` : node.title}
          style={{ cursor: hasKids ? 'pointer' : 'default' }}
        >
          <span className="orgo-section-title">
            {node.title}
            {node.scale && <span className="orgo-scale">{node.scale}</span>}
          </span>
          {hasKids && <span className={`orgo-caret${open ? ' open' : ''}`}>▸</span>}
        </button>
        <EditTools node={node} />
      </div>
      <FillBar held={s.held} auth={s.auth} />
      <div className="orgo-section-foot">
        <span className="orgo-foot-pct">{fillPct(s.held, s.auth)}% filled</span>
        <span className="orgo-foot-right">
          <SeatChip node={node} />
          <span className={`orgo-foot-vac ${vacancy > 0 ? 'neg' : 'pos'}`}>{vacancy > 0 ? `${vacancy} vacant` : 'full'}</span>
        </span>
      </div>
      {hasKids && open && (
        <div className="orgo-posts">
          {node.children.map((c) => <PostRow key={c.id} node={c} depth={0} />)}
        </div>
      )}
      {!hasKids && <Occupants node={node} />}
    </div>
  );
}

export function HrOrganogram({
  units, synthesised = false, occupancy, people, onSelectUnit, selectedUnitId,
  editable = false, layout = 'chart', onAdd, onEdit, onDelete, onReparent,
}: {
  units: HrUnit[]; synthesised?: boolean;
  occupancy?: Map<string, Occupancy>;
  people?: HrPerson[];
  onSelectUnit?: (unitId: string) => void;
  selectedUnitId?: string;
  editable?: boolean;
  layout?: 'chart' | 'outline';
  onAdd?: (parentId: string | null) => void;
  onEdit?: (unit: HrUnit) => void;
  onDelete?: (unit: HrUnit) => void;
  onReparent?: (unitId: string, newParentId: string | null) => void;
}) {
  const roots = useMemo(() => buildOrganogram(units), [units]);
  const totals = useMemo(() => establishmentTotals(roots), [roots]);
  const { spine, fanout } = useMemo(() => commandSpine(roots), [roots]);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const toggleCollapse = (id: string) => setCollapsedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allNodes = useMemo(() => { const out: OrgoNode[] = []; const w = (n: OrgoNode) => { out.push(n); n.children.forEach(w); }; roots.forEach(w); return out; }, [roots]);
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const parentOf = new Map(units.map((u) => [u.id, u.parentId] as const));
    const keep = new Set<string>();
    for (const n of allNodes) {
      if (n.title.toLowerCase().includes(q) || (n.scale ?? '').toLowerCase().includes(q)) {
        keep.add(n.id);
        let pid = parentOf.get(n.id) ?? null;
        while (pid) { keep.add(pid); pid = parentOf.get(pid) ?? null; }
        const desc = (m: OrgoNode) => m.children.forEach((c) => { keep.add(c.id); desc(c); });
        desc(n);
      }
    }
    return keep;
  }, [query, allNodes, units]);
  const peopleByUnit = useMemo(() => {
    if (!people) return undefined;
    const m = new Map<string, HrPerson[]>();
    for (const p of people) { if (!p.unitId) continue; const l = m.get(p.unitId) ?? []; l.push(p); m.set(p.unitId, l); }
    return m;
  }, [people]);

  if (units.length === 0) {
    return (
      <div className="orgo-empty-edit">
        <p className="muted">No establishment defined for this tier yet.</p>
        {editable && <button className="btn" onClick={() => onAdd?.(null)}>Add head post</button>}
      </div>
    );
  }

  const sections = fanout ? fanout.children : roots;
  const pct = fillPct(totals.held, totals.auth);
  const status = fillStatus(totals.held, totals.auth);
  const present = occupancy ? [...occupancy.values()].reduce((a, o) => a + o.present, 0) : null;

  return (
    <Ctx.Provider value={{ occupancy, peopleByUnit, onSelectUnit, selectedUnitId, editable, onAdd, onEdit, onDelete, onReparent, collapsedIds, toggleCollapse, searchActive: !!visibleIds, visibleIds }}>
      <div className={`orgo${editable ? ' orgo-editing' : ''}`}>
        <div className="orgo-summary">
          <div className="orgo-summary-cell"><span className="orgo-summary-label">AUTH</span><span className="orgo-summary-val">{totals.auth}</span></div>
          <div className="orgo-summary-cell"><span className="orgo-summary-label">HELD</span><span className="orgo-summary-val">{totals.held}</span></div>
          {present != null && <div className="orgo-summary-cell"><span className="orgo-summary-label">PRESENT</span><span className="orgo-summary-val">{present}</span></div>}
          <div className={`orgo-summary-cell orgo-summary-pct status-${status}`}><span className="orgo-summary-label">FILLED</span><span className="orgo-summary-val">{pct}%</span></div>
          <div className="orgo-summary-cell"><span className="orgo-summary-label">VACANT</span><span className="orgo-summary-val">{totals.auth - totals.held}</span></div>
          {synthesised && <span className="orgo-synth-tag">derived from category strengths</span>}
        </div>

        {editable && <p className="orgo-edit-hint small muted no-print">Editing — use ＋ to add, ✎ to edit, ✕ to remove. Drag a box onto another to re-assign its parent.</p>}

        {layout === 'outline' ? (
          <div className="orgo-outline">
            <div className="orgo-outline-bar no-print">
              <input className="orgo-search" aria-label="Search posts" placeholder="Search posts / scales…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <span className="seg">
                <button className="seg-btn" onClick={() => setCollapsedIds(new Set())}>Expand all</button>
                <button className="seg-btn" onClick={() => setCollapsedIds(new Set(allNodes.filter((n) => n.children.length > 0).map((n) => n.id)))}>Collapse all</button>
              </span>
            </div>
            {roots.map((r) => <OutlineNode key={r.id} node={r} depth={0} />)}
            {editable && <button className="orgo-ol-add no-print" onClick={() => onAdd?.(fanout ? fanout.id : (roots[0]?.id ?? null))}>＋ Add section</button>}
          </div>
        ) : (
        <>
        {spine.length > 0 && (
          <div className="orgo-spine">
            {spine.map((u, i) => {
              const s = rolledStrength(u);
              const selected = selectedUnitId === u.id;
              return (
                <div className="orgo-spine-wrap" key={u.id}>
                  <div
                    className={`orgo-command status-${fillStatus(s.held, s.auth)}${selected ? ' selected' : ''}`}
                    onClick={() => onSelectUnit?.(u.id)}
                    style={{ cursor: onSelectUnit ? 'pointer' : 'default' }}
                  >
                    <span className="orgo-command-title">{u.title}</span>
                    {u.scale && <span className="orgo-scale light">{u.scale}</span>}
                    <span className="orgo-command-num">{s.held}/{s.auth}</span>
                    <EditTools node={u} />
                  </div>
                  {(i < spine.length - 1 || sections.length > 0) && <div className="orgo-connector" />}
                </div>
              );
            })}
          </div>
        )}

        {sections.length > 0 && (
          <>
            <div className="orgo-branch-bar" />
            <div className="orgo-grid">
              {sections.map((c) => <SectionCard key={c.id} node={c} />)}
              {editable && (
                <button className="orgo-add-section no-print" onClick={() => onAdd?.(fanout ? fanout.id : (roots[0]?.id ?? null))} aria-label="Add section">
                  <span className="orgo-add-plus">＋</span><span className="small">Add section</span>
                </button>
              )}
            </div>
          </>
        )}
        </>
        )}
      </div>
    </Ctx.Provider>
  );
}

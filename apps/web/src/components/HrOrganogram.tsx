import { createContext, useContext, useMemo, useState } from 'react';
import type { HrUnit } from '../data/types';
import {
  buildOrganogram, commandSpine, rolledStrength, establishmentTotals,
  fillStatus, fillPct, type OrgoNode,
} from '../domain/organogram';
import type { Occupancy } from '../domain/roster';

interface OrgoCtx {
  occupancy?: Map<string, Occupancy>;
  onSelectUnit?: (unitId: string) => void;
  selectedUnitId?: string;
  // editing
  editable?: boolean;
  onAdd?: (parentId: string | null) => void;
  onEdit?: (unit: HrUnit) => void;
  onDelete?: (unit: HrUnit) => void;
  onReparent?: (unitId: string, newParentId: string | null) => void;
}
const Ctx = createContext<OrgoCtx>({});

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
        style={{ paddingLeft: 10 + depth * 14 }}
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
      </div>
      {hasKids && open && node.children.map((c) => <PostRow key={c.id} node={c} depth={depth + 1} />)}
    </>
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
    </div>
  );
}

export function HrOrganogram({
  units, synthesised = false, occupancy, onSelectUnit, selectedUnitId,
  editable = false, onAdd, onEdit, onDelete, onReparent,
}: {
  units: HrUnit[]; synthesised?: boolean;
  occupancy?: Map<string, Occupancy>;
  onSelectUnit?: (unitId: string) => void;
  selectedUnitId?: string;
  editable?: boolean;
  onAdd?: (parentId: string | null) => void;
  onEdit?: (unit: HrUnit) => void;
  onDelete?: (unit: HrUnit) => void;
  onReparent?: (unitId: string, newParentId: string | null) => void;
}) {
  const roots = useMemo(() => buildOrganogram(units), [units]);
  const totals = useMemo(() => establishmentTotals(roots), [roots]);
  const { spine, fanout } = useMemo(() => commandSpine(roots), [roots]);

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
    <Ctx.Provider value={{ occupancy, onSelectUnit, selectedUnitId, editable, onAdd, onEdit, onDelete, onReparent }}>
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
      </div>
    </Ctx.Provider>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../data/DataContext';
import { nodeById, isBranch } from '../domain/org';
import {
  buildOrganogram, establishmentTotals, fillPct, fillStatus, organogramFromPostings,
} from '../domain/organogram';
import { occupancyByUnit, presentStrength } from '../domain/roster';
import type { HrUnit, HrPosting, HrPerson, HrRequisition, OrgNode } from '../data/types';
import { HrOrganogram } from './HrOrganogram';
import { EditableCell } from './EditableCell';
import { useToast } from './Toast';
import { RosterView, RecruitmentBoard, CostView, OrgBoard } from './HrViews';
import { SkillsView, PostingsView, VersionsView, EstablishmentIO, OrganogramExport } from './HrAdminViews';
import { Focusable } from './Focusable';
import { Dockable } from './Dock';
import { KpiCard } from './KpiCard';

const BASE_VIEWS = ['organogram', 'roster', 'postings', 'skills', 'recruitment', 'cost', 'establishment', 'versions'] as const;
type View = (typeof BASE_VIEWS)[number] | 'board';
const VIEW_LABEL: Record<View, string> = {
  organogram: 'Organogram', roster: 'Roster', postings: 'Postings', skills: 'Skills',
  recruitment: 'Recruitment', cost: 'Cost', establishment: 'Establishment', versions: 'Versions', board: 'Org board',
};

export function HrCockpit({ nodeId, nodes }: { nodeId: string; nodes: OrgNode[] }) {
  const { provider } = useData();
  const [view, setView] = useState<View>('organogram');
  const [units, setUnits] = useState<HrUnit[]>([]);
  const [postings, setPostings] = useState<HrPosting[]>([]);
  const [people, setPeople] = useState<HrPerson[]>([]);
  const [reqs, setReqs] = useState<HrRequisition[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | undefined>();
  // Org-board data (branch only).
  const [allUnits, setAllUnits] = useState<HrUnit[]>([]);
  const [allPostings, setAllPostings] = useState<HrPosting[]>([]);
  const [allPeople, setAllPeople] = useState<HrPerson[]>([]);

  const node = nodeById(nodes, nodeId);
  const branch = node ? isBranch(node) : false;

  async function load() {
    const [u, p, ppl, rq] = await Promise.all([
      provider.listHrUnits(nodeId), provider.listHr(nodeId),
      provider.listPeople(nodeId), provider.listRequisitions(nodeId),
    ]);
    setUnits(u); setPostings(p); setPeople(ppl); setReqs(rq);
  }
  useEffect(() => { void load(); setSelectedUnitId(undefined); /* eslint-disable-next-line */ }, [provider, nodeId]);

  useEffect(() => {
    if (view !== 'board' || !branch) return;
    void Promise.all([provider.listAllHrUnits(), provider.listAllHr(), provider.listAllPeople()])
      .then(([u, p, ppl]) => { setAllUnits(u); setAllPostings(p); setAllPeople(ppl); });
  }, [view, branch, provider, nodeId]);

  const authored = units.length > 0;
  const effectiveUnits = useMemo(
    () => (authored ? units : (node ? organogramFromPostings(node, postings) : [])),
    [authored, units, node, postings],
  );
  const occupancy = useMemo(() => occupancyByUnit(people), [people]);
  const roots = useMemo(() => buildOrganogram(effectiveUnits), [effectiveUnits]);
  const totals = useMemo(() => establishmentTotals(roots), [roots]);
  const present = presentStrength(people);

  const views: View[] = branch ? [...BASE_VIEWS, 'board'] : [...BASE_VIEWS];

  function selectUnit(uid: string) {
    setSelectedUnitId(uid);
    setView('roster');
  }

  // ---- organogram editing ----
  const [editing, setEditing] = useState(false);
  const [editorUnit, setEditorUnit] = useState<HrUnit | null>(null);
  const [orgoLayout, setOrgoLayout] = useState<'chart' | 'outline'>('chart');

  async function enterEdit() {
    if (!authored && node) { await seedFromCategories(); }
    setEditing(true);
  }
  function handleAdd(parentId: string | null) {
    setEditorUnit({ id: '', nodeId, parentId, title: '', auth: 1, held: 0, order: units.length } as HrUnit);
  }
  function handleEdit(u: HrUnit) { setEditorUnit(u); }
  async function handleDelete(u: HrUnit) {
    if (typeof window !== 'undefined' && !window.confirm(`Remove “${u.title}” from the establishment?`)) return;
    await provider.deleteHrUnit(nodeId, u.id);
    await load();
  }
  function isDescendant(units2: HrUnit[], ancestorId: string, candidateId: string): boolean {
    let cur = units2.find((x) => x.id === candidateId);
    const byId = new Map(units2.map((x) => [x.id, x]));
    while (cur && cur.parentId) {
      if (cur.parentId === ancestorId) return true;
      cur = byId.get(cur.parentId);
    }
    return false;
  }
  async function handleReparent(unitId: string, newParentId: string | null) {
    if (unitId === newParentId) return;
    if (newParentId && isDescendant(units, unitId, newParentId)) return; // no cycles
    const u = units.find((x) => x.id === unitId);
    if (!u || u.parentId === newParentId) return;
    await provider.upsertHrUnit(nodeId, { ...u, parentId: newParentId });
    await load();
  }
  async function saveEditor(patch: Omit<HrUnit, 'nodeId'>) {
    await provider.upsertHrUnit(nodeId, {
      id: patch.id || undefined, parentId: patch.parentId, title: patch.title, scale: patch.scale,
      category: patch.category, auth: patch.auth, held: patch.held, order: patch.order,
    });
    setEditorUnit(null);
    await load();
  }

  async function seedFromCategories() {
    if (!node) return;
    const synth = organogramFromPostings(node, postings);
    for (const u of synth) {
      await provider.upsertHrUnit(nodeId, {
        parentId: u.parentId, title: u.title, scale: u.scale, category: u.category,
        auth: u.auth, held: u.held, order: u.order,
      });
    }
    await load();
  }

  return (
    <div className="hr-cockpit">
      <div className="section-head">
        <h3>HR command — {node?.name}</h3>
        <span className="muted">
          AUTH {totals.auth} · HELD {totals.held} · PRESENT {present} · {fillPct(totals.held, totals.auth)}% filled
          {!authored && ' · derived from categories'}
        </span>
      </div>

      <div className="subtabs" role="tablist">
        {views.map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={`subtab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {view === 'organogram' && (
        <>
          <div className="orgo-toolbar">
            <p className="muted small" style={{ margin: 0 }}>
              {editing ? 'Editing establishment — changes save immediately.' : 'Tip: click any box to see who fills it.'}
            </p>
            <div className="orgo-toolbar-actions">
              <span className="seg" role="group" aria-label="Organogram layout">
                <button className={`seg-btn${orgoLayout === 'chart' ? ' active' : ''}`} onClick={() => setOrgoLayout('chart')}>Chart</button>
                <button className={`seg-btn${orgoLayout === 'outline' ? ' active' : ''}`} onClick={() => setOrgoLayout('outline')}>Outline</button>
              </span>
              <OrganogramExport units={editing ? units : effectiveUnits} title={`${node?.name ?? 'Establishment'}`} />
              {editing
                ? <button className="btn" onClick={() => { setEditing(false); setEditorUnit(null); }}>Done editing</button>
                : <button className="btn-ghost" onClick={enterEdit} aria-label="Edit organogram">✎ Edit organogram</button>}
            </div>
          </div>

          {editorUnit && (
            <UnitEditorPanel unit={editorUnit} units={units} onSave={saveEditor} onCancel={() => setEditorUnit(null)} />
          )}

          <Dockable title="Establishment organogram">
            {() => (
              <Focusable title="Establishment organogram">
                {() => (
                  <div className="card">
                    <HrOrganogram
                      units={editing ? units : effectiveUnits} synthesised={!editing && !authored}
                      occupancy={people.length ? occupancy : undefined} people={people.length ? people : undefined}
                      onSelectUnit={editing ? undefined : selectUnit} selectedUnitId={selectedUnitId}
                      editable={editing} layout={orgoLayout}
                      onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} onReparent={handleReparent}
                    />
                  </div>
                )}
              </Focusable>
            )}
          </Dockable>
          <div className="kpi-grid" style={{ marginTop: 14 }}>
            <KpiCard label="Authorised" value={String(totals.auth)} />
            <KpiCard label="Held" value={String(totals.held)} />
            <KpiCard label="Present today" value={String(present)} />
            <KpiCard label="Fill rate" value={`${fillPct(totals.held, totals.auth)}%`} sub={<span className={`tag-${fillStatus(totals.held, totals.auth)}`}>{fillStatus(totals.held, totals.auth) === 'ok' ? 'healthy' : fillStatus(totals.held, totals.auth) === 'warn' ? 'watch' : 'critical'}</span>} />
          </div>
        </>
      )}

      {view === 'roster' && (
        <RosterView nodeId={nodeId} units={effectiveUnits} people={people} selectedUnitId={selectedUnitId} onChange={load} />
      )}

      {view === 'postings' && (
        <PostingsView nodeId={nodeId} nodeName={node?.name ?? nodeId} nodes={nodes} units={effectiveUnits} people={people} onChanged={load} />
      )}

      {view === 'skills' && <SkillsView nodeId={nodeId} people={people} />}

      {view === 'recruitment' && (
        <RecruitmentBoard nodeId={nodeId} units={effectiveUnits} people={people} requisitions={reqs} onChange={load} />
      )}

      {view === 'cost' && <CostView units={effectiveUnits} people={people} />}

      {view === 'establishment' && (
        <>
          <EstablishmentIO nodeId={nodeId} units={units} onImported={load} />
          <EstablishmentBuilder nodeId={nodeId} units={units} authored={authored} onChange={load} onSeed={seedFromCategories} />
        </>
      )}

      {view === 'versions' && <VersionsView nodeId={nodeId} units={units} />}

      {view === 'board' && branch && (
        <OrgBoard nodeId={nodeId} nodes={nodes} allUnits={allUnits} allPostings={allPostings} allPeople={allPeople} />
      )}
    </div>
  );
}

function EstablishmentBuilder({
  nodeId, units, authored, onChange, onSeed,
}: { nodeId: string; units: HrUnit[]; authored: boolean; onChange: () => void; onSeed: () => void }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [scale, setScale] = useState('');
  const [category, setCategory] = useState('');
  const [auth, setAuth] = useState('');
  const [held, setHeld] = useState('');

  async function add() {
    if (!title.trim()) return;
    await provider.upsertHrUnit(nodeId, {
      parentId: parentId || null, title: title.trim(), scale: scale.trim() || undefined,
      category: category.trim() || undefined, auth: Number(auth) || 0, held: Number(held) || 0,
      order: units.length,
    });
    setTitle(''); setScale(''); setCategory(''); setAuth(''); setHeld('');
    onChange();
  }
  async function patch(u: HrUnit, p: Partial<HrUnit>) {
    await provider.upsertHrUnit(nodeId, { ...u, ...p }); onChange();
    toast({ message: `Updated ${u.title}`, kind: 'success', duration: 2200 });
  }
  async function remove(id: string) { await provider.deleteHrUnit(nodeId, id); onChange(); }

  const gridRef = useRef<HTMLDivElement>(null);
  function onGridKey(e: React.KeyboardEvent) {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el.dataset.r === undefined || el.dataset.c === undefined) return;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    let tr = r, tc = c;
    if (e.key === 'ArrowDown') tr = r + 1;
    else if (e.key === 'ArrowUp') tr = r - 1;
    else if (e.key === 'ArrowRight') tc = c + 1;
    else if (e.key === 'ArrowLeft') tc = c - 1;
    else return;
    const target = gridRef.current?.querySelector<HTMLElement>(`[data-r="${tr}"][data-c="${tc}"]`);
    if (target) { e.preventDefault(); target.focus(); }
  }

  const byId = new Map(units.map((u) => [u.id, u]));
  const labelFor = (u: HrUnit) => (u.parentId && byId.has(u.parentId) ? `${byId.get(u.parentId)!.title} › ${u.title}` : u.title);

  return (
    <div>
      {!authored && (
        <div className="card create-row" style={{ alignItems: 'center' }}>
          <span className="muted small">No establishment authored yet — the organogram is derived from category strengths.</span>
          <button className="btn" onClick={onSeed}>Seed from categories</button>
        </div>
      )}

      <div className="card create-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <input aria-label="Post title" placeholder="Post / section title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 2, minWidth: 180 }} />
        <select aria-label="Reports to" value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
          <option value="">— Head (no parent) —</option>
          {units.map((u) => <option key={u.id} value={u.id}>{labelFor(u)}</option>)}
        </select>
        <input aria-label="Scale" placeholder="Scale" value={scale} onChange={(e) => setScale(e.target.value)} style={{ width: 110 }} />
        <input aria-label="Category" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 130 }} />
        <input aria-label="Authorised" placeholder="Auth" value={auth} onChange={(e) => setAuth(e.target.value)} style={{ width: 70 }} />
        <input aria-label="Held" placeholder="Held" value={held} onChange={(e) => setHeld(e.target.value)} style={{ width: 70 }} />
        <button className="btn" onClick={add}>Add post</button>
      </div>

      <div ref={gridRef} onKeyDown={onGridKey}>
      <table className="data-table" aria-label="Establishment posts" style={{ marginTop: 12 }}>
        <thead><tr><th>Post</th><th>Reports to</th><th>Scale</th><th>Category</th><th className="num">Auth</th><th className="num">Held</th><th></th></tr></thead>
        <tbody>
          {units.length === 0 ? <tr><td colSpan={7} className="muted">No posts yet.</td></tr> :
            units.map((u, r) => (
              <tr key={u.id}>
                <td><EditableCell coords={{ r, c: 0 }} value={u.title} ariaLabel={`Title ${u.id}`} onCommit={(v) => v.trim() && patch(u, { title: v.trim() })} /></td>
                <td className="muted small">{u.parentId && byId.has(u.parentId) ? byId.get(u.parentId)!.title : '— head —'}</td>
                <td className="small"><EditableCell coords={{ r, c: 1 }} value={u.scale ?? ''} ariaLabel={`Scale ${u.id}`} onCommit={(v) => patch(u, { scale: v.trim() || undefined })} /></td>
                <td className="small"><EditableCell coords={{ r, c: 2 }} value={u.category ?? ''} ariaLabel={`Category ${u.id}`} onCommit={(v) => patch(u, { category: v.trim() || undefined })} /></td>
                <td className="num"><EditableCell coords={{ r, c: 3 }} type="number" align="right" value={String(u.auth)} ariaLabel={`Auth ${u.id}`} onCommit={(v) => patch(u, { auth: Number(v) || 0 })} /></td>
                <td className="num"><EditableCell coords={{ r, c: 4 }} type="number" align="right" value={String(u.held)} ariaLabel={`Held ${u.id}`} onCommit={(v) => patch(u, { held: Number(v) || 0 })} /></td>
                <td><button className="btn-ghost" aria-label={`Delete ${u.title}`} onClick={() => remove(u.id)}>✕</button></td>
              </tr>
            ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function UnitEditorPanel({
  unit, units, onSave, onCancel,
}: {
  unit: HrUnit;
  units: HrUnit[];
  onSave: (patch: Omit<HrUnit, 'nodeId'>) => void;
  onCancel: () => void;
}) {
  const isNew = !unit.id;
  const [title, setTitle] = useState(unit.title);
  const [scale, setScale] = useState(unit.scale ?? '');
  const [category, setCategory] = useState(unit.category ?? '');
  const [parentId, setParentId] = useState<string>(unit.parentId ?? '');
  const [auth, setAuth] = useState(String(unit.auth ?? 0));
  const [held, setHeld] = useState(String(unit.held ?? 0));

  const byId = new Map(units.map((u) => [u.id, u]));
  // A unit cannot become its own descendant's child.
  const descendants = new Set<string>();
  if (!isNew) {
    const collect = (pid: string) => units.filter((u) => u.parentId === pid).forEach((c) => { descendants.add(c.id); collect(c.id); });
    collect(unit.id);
  }
  const parentOptions = units.filter((u) => u.id !== unit.id && !descendants.has(u.id));
  const label = (u: HrUnit) => (u.parentId && byId.has(u.parentId) ? `${byId.get(u.parentId)!.title} › ${u.title}` : u.title);

  function save() {
    if (!title.trim()) return;
    onSave({
      id: unit.id, parentId: parentId || null, title: title.trim(),
      scale: scale.trim() || undefined, category: category.trim() || undefined,
      auth: Number(auth) || 0, held: Number(held) || 0, order: unit.order,
    });
  }

  return (
    <div className="card unit-editor" role="dialog" aria-label={isNew ? 'Add post' : `Edit ${unit.title}`}>
      <div className="section-head"><h3>{isNew ? 'Add post' : `Edit “${unit.title}”`}</h3></div>
      <div className="create-row" style={{ flexWrap: 'wrap' }}>
        <input aria-label="Post title" placeholder="Post / section title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 2, minWidth: 180 }} autoFocus />
        <select aria-label="Reports to" value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          <option value="">— Head (no parent) —</option>
          {parentOptions.map((u) => <option key={u.id} value={u.id}>{label(u)}</option>)}
        </select>
        <input aria-label="Scale" placeholder="Scale" value={scale} onChange={(e) => setScale(e.target.value)} style={{ width: 120 }} />
        <input aria-label="Category" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 130 }} />
        <label className="field-inline">Auth <input aria-label="Authorised" value={auth} onChange={(e) => setAuth(e.target.value)} style={{ width: 56 }} /></label>
        <label className="field-inline">Held <input aria-label="Held" value={held} onChange={(e) => setHeld(e.target.value)} style={{ width: 56 }} /></label>
        <button className="btn" onClick={save}>{isNew ? 'Add' : 'Save'}</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

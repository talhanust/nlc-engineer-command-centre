import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { nodeById, isBranch } from '../domain/org';
import {
  buildOrganogram, establishmentTotals, fillPct, fillStatus, organogramFromPostings,
} from '../domain/organogram';
import { occupancyByUnit, presentStrength } from '../domain/roster';
import type { HrUnit, HrPosting, HrPerson, HrRequisition, OrgNode } from '../data/types';
import { HrOrganogram } from './HrOrganogram';
import { RosterView, RecruitmentBoard, CostView, OrgBoard } from './HrViews';
import { Focusable } from './Focusable';
import { Dockable } from './Dock';
import { KpiCard } from './KpiCard';

const BASE_VIEWS = ['organogram', 'roster', 'recruitment', 'cost', 'establishment'] as const;
type View = (typeof BASE_VIEWS)[number] | 'board';
const VIEW_LABEL: Record<View, string> = {
  organogram: 'Organogram', roster: 'Roster', recruitment: 'Recruitment',
  cost: 'Cost', establishment: 'Establishment', board: 'Org board',
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
          <p className="muted small" style={{ marginTop: 0 }}>Tip: click any box to see who fills it.</p>
          <Dockable title="Establishment organogram">
            {() => (
              <Focusable title="Establishment organogram">
                {() => (
                  <div className="card">
                    <HrOrganogram
                      units={effectiveUnits} synthesised={!authored}
                      occupancy={people.length ? occupancy : undefined} onSelectUnit={selectUnit} selectedUnitId={selectedUnitId}
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

      {view === 'recruitment' && (
        <RecruitmentBoard nodeId={nodeId} units={effectiveUnits} people={people} requisitions={reqs} onChange={load} />
      )}

      {view === 'cost' && <CostView units={effectiveUnits} people={people} />}

      {view === 'establishment' && (
        <EstablishmentBuilder nodeId={nodeId} units={units} authored={authored} onChange={load} onSeed={seedFromCategories} />
      )}

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
  }
  async function remove(id: string) { await provider.deleteHrUnit(nodeId, id); onChange(); }

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

      <table className="data-table" aria-label="Establishment posts" style={{ marginTop: 12 }}>
        <thead><tr><th>Post</th><th>Reports to</th><th>Scale</th><th>Category</th><th className="num">Auth</th><th className="num">Held</th><th></th></tr></thead>
        <tbody>
          {units.length === 0 ? <tr><td colSpan={7} className="muted">No posts yet.</td></tr> :
            units.map((u) => (
              <tr key={u.id}>
                <td>{u.title}</td>
                <td className="muted small">{u.parentId && byId.has(u.parentId) ? byId.get(u.parentId)!.title : '— head —'}</td>
                <td className="small">{u.scale ?? ''}</td>
                <td className="small">{u.category ?? ''}</td>
                <td className="num"><input className="qty-input" aria-label={`Auth ${u.id}`} defaultValue={u.auth} onBlur={(e) => patch(u, { auth: Number(e.target.value) || 0 })} /></td>
                <td className="num"><input className="qty-input" aria-label={`Held ${u.id}`} defaultValue={u.held} onBlur={(e) => patch(u, { held: Number(e.target.value) || 0 })} /></td>
                <td><button className="btn-ghost" aria-label={`Delete ${u.title}`} onClick={() => remove(u.id)}>✕</button></td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

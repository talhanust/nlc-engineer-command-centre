import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { nodeById, descendantNodes } from '../domain/org';
import { formatMoney } from '../domain/money';
import type { HrUnit, HrPerson, HrRequisition, HrPersonStatus, HrPosting, OrgNode, ReqStage } from '../data/types';
import {
  buildOrganogram, establishmentTotals, fillPct, fillStatus, organogramFromPostings,
} from '../domain/organogram';
import { occupancyByUnit, peopleInUnit, benchPeople, STATUS_LABEL } from '../domain/roster';
import { costBySection, totalMonthlyCost, type CostBasis } from '../domain/hrcost';
import { PersonCard, EmptySeat } from './HrAvatar';

const STATUSES: HrPersonStatus[] = ['present', 'leave', 'detached', 'training'];

function leafUnits(units: HrUnit[]): HrUnit[] {
  const parents = new Set(units.map((u) => u.parentId).filter(Boolean) as string[]);
  return units.filter((u) => !parents.has(u.id));
}

// ---------------------------------------------------------------- Roster ----
export function RosterView({
  nodeId, units, people, selectedUnitId, onChange,
}: { nodeId: string; units: HrUnit[]; people: HrPerson[]; selectedUnitId?: string; onChange: () => void }) {
  const { provider } = useData();
  const [editing, setEditing] = useState<HrPerson | null>(null);
  const [showForm, setShowForm] = useState(false);
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const occupiedUnitIds = useMemo(() => {
    const ids = new Set(people.map((p) => p.unitId).filter(Boolean) as string[]);
    if (selectedUnitId) ids.add(selectedUnitId);
    return [...ids];
  }, [people, selectedUnitId]);

  const bench = benchPeople(people);
  const occ = occupancyByUnit(people);
  const vacantSeats = leafUnits(units).reduce((acc, u) => acc + Math.max(0, u.held - (occ.get(u.id)?.named ?? 0)), 0);

  async function remove(p: HrPerson) { await provider.deletePerson(nodeId, p.id); onChange(); }

  // Selected unit first, then other occupied units.
  const orderedUnitIds = selectedUnitId
    ? [selectedUnitId, ...occupiedUnitIds.filter((id) => id !== selectedUnitId)]
    : occupiedUnitIds;

  return (
    <div>
      <div className="section-head">
        <h3>Roster · {people.length} posted</h3>
        <button className="btn no-print" onClick={() => { setEditing(null); setShowForm((s) => !s); }}>
          {showForm ? 'Close' : 'Add person'}
        </button>
      </div>

      {(showForm || editing) && (
        <PersonForm
          nodeId={nodeId} units={units} person={editing} defaultUnitId={selectedUnitId}
          onDone={() => { setEditing(null); setShowForm(false); onChange(); }}
          onCancel={() => { setEditing(null); setShowForm(false); }}
        />
      )}

      {orderedUnitIds.length === 0 && bench.length === 0 && (
        <p className="muted">No personnel posted yet. Use “Add person”, or fill seats from the organogram.</p>
      )}

      {orderedUnitIds.map((uid) => {
        const unit = byId.get(uid);
        const members = peopleInUnit(people, uid);
        const held = unit?.held ?? members.length;
        const empty = Math.max(0, held - members.length);
        return (
          <div className={`card roster-group${uid === selectedUnitId ? ' selected' : ''}`} key={uid} style={{ marginBottom: 12 }}>
            <div className="section-head">
              <h3>{unit?.title ?? 'Unknown post'} {unit?.scale && <span className="orgo-scale">{unit.scale}</span>}</h3>
              <span className="muted small">{members.length} named · {empty} vacant</span>
            </div>
            <div className="person-grid">
              {members.map((p) => (
                <PersonCard key={p.id} person={p} onEdit={() => { setShowForm(false); setEditing(p); }} onRemove={() => remove(p)} />
              ))}
              {Array.from({ length: empty }).map((_, i) => (
                <EmptySeat key={`empty-${uid}-${i}`} label={unit?.title ?? ''} onFill={() => { setEditing({ id: '', nodeId, unitId: uid, name: '', status: 'present' } as HrPerson); }} />
              ))}
            </div>
          </div>
        );
      })}

      {bench.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-head"><h3>Bench · unassigned</h3><span className="muted small">{bench.length}</span></div>
          <div className="person-grid">
            {bench.map((p) => <PersonCard key={p.id} person={p} onEdit={() => { setShowForm(false); setEditing(p); }} onRemove={() => remove(p)} />)}
          </div>
        </div>
      )}

      {vacantSeats > 0 && <p className="muted small">{vacantSeats} vacant seat(s) across the establishment — manage hiring in the Recruitment tab.</p>}
    </div>
  );
}

function PersonForm({
  nodeId, units, person, defaultUnitId, onDone, onCancel,
}: { nodeId: string; units: HrUnit[]; person: HrPerson | null; defaultUnitId?: string; onDone: () => void; onCancel: () => void }) {
  const { provider } = useData();
  const editing = !!person?.id;
  const [name, setName] = useState(person?.name ?? '');
  const [rank, setRank] = useState(person?.rank ?? '');
  const [unitId, setUnitId] = useState(person?.unitId ?? defaultUnitId ?? '');
  const [status, setStatus] = useState<HrPersonStatus>(person?.status ?? 'present');
  const [cnic, setCnic] = useState(person?.cnic ?? '');
  const [contact, setContact] = useState(person?.contact ?? '');
  const [posted, setPosted] = useState(person?.postingDate ?? '');

  const byId = new Map(units.map((u) => [u.id, u]));
  const label = (u: HrUnit) => (u.parentId && byId.has(u.parentId) ? `${byId.get(u.parentId)!.title} › ${u.title}` : u.title);

  async function save() {
    if (!name.trim()) return;
    await provider.upsertPerson(nodeId, {
      id: person?.id || undefined, unitId: unitId || null, name: name.trim(), rank: rank.trim() || undefined,
      status, cnic: cnic.trim() || undefined, contact: contact.trim() || undefined,
      postingDate: posted || undefined, category: unitId ? byId.get(unitId)?.category : undefined,
    });
    onDone();
  }

  return (
    <div className="card create-row" style={{ flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      <input aria-label="Person name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2, minWidth: 170 }} />
      <input aria-label="Person rank" placeholder="Rank / scale" value={rank} onChange={(e) => setRank(e.target.value)} style={{ width: 130 }} />
      <select aria-label="Assigned post" value={unitId} onChange={(e) => setUnitId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
        <option value="">— Bench (unassigned) —</option>
        {units.map((u) => <option key={u.id} value={u.id}>{label(u)}</option>)}
      </select>
      <select aria-label="Attendance status" value={status} onChange={(e) => setStatus(e.target.value as HrPersonStatus)} style={{ width: 130 }}>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <input aria-label="Person CNIC" placeholder="CNIC" value={cnic} onChange={(e) => setCnic(e.target.value)} style={{ width: 150 }} />
      <input aria-label="Person contact" placeholder="Contact" value={contact} onChange={(e) => setContact(e.target.value)} style={{ width: 130 }} />
      <input aria-label="Posting date" type="date" value={posted} onChange={(e) => setPosted(e.target.value)} style={{ width: 150 }} />
      <button className="btn" onClick={save}>{editing ? 'Update' : 'Add'}</button>
      <button className="btn-ghost" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ----------------------------------------------------------- Recruitment ----
const STAGES: ReqStage[] = ['raised', 'advertised', 'interview', 'offer', 'joined'];
const STAGE_LABEL: Record<ReqStage, string> = {
  raised: 'Raised', advertised: 'Advertised', interview: 'Interview', offer: 'Offer', joined: 'Joined',
};

export function RecruitmentBoard({
  nodeId, units, people, requisitions, onChange,
}: { nodeId: string; units: HrUnit[]; people: HrPerson[]; requisitions: HrRequisition[]; onChange: () => void }) {
  const { provider } = useData();
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const occ = occupancyByUnit(people);

  const vacancies = useMemo(() => leafUnits(units)
    .map((u) => ({ unit: u, gap: u.auth - u.held, named: occ.get(u.id)?.named ?? 0 }))
    .filter((v) => v.gap > 0)
    .sort((a, b) => b.gap - a.gap), [units, occ]);

  const openReqUnitIds = new Set(requisitions.filter((r) => r.stage !== 'joined').map((r) => r.unitId));

  async function raise(unitId: string, title: string, count: number) {
    await provider.upsertRequisition(nodeId, { unitId, title, count, stage: 'raised' });
    onChange();
  }
  async function advance(r: HrRequisition) { await provider.advanceRequisition(nodeId, r.id); onChange(); }
  async function drop(r: HrRequisition) { await provider.deleteRequisition(nodeId, r.id); onChange(); }
  async function hire(r: HrRequisition) {
    await provider.upsertPerson(nodeId, { unitId: r.unitId, name: `New hire — ${r.title}`, status: 'present', postingDate: new Date().toISOString().slice(0, 10), category: byId.get(r.unitId)?.category });
    await provider.deleteRequisition(nodeId, r.id);
    onChange();
  }

  return (
    <div>
      <div className="section-head">
        <h3>Recruitment</h3>
        <span className="muted small">{vacancies.reduce((a, v) => a + v.gap, 0)} vacant · {requisitions.filter((r) => r.stage !== 'joined').length} in pipeline</span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-head"><h3>Open vacancies</h3><span className="muted small">AUTH − HELD by post</span></div>
        {vacancies.length === 0 ? <p className="muted small">No vacancies — establishment fully manned.</p> : (
          <table className="data-table" aria-label="Vacancies">
            <thead><tr><th>Post</th><th>Scale</th><th className="num">Gap</th><th className="num">Named</th><th></th></tr></thead>
            <tbody>
              {vacancies.map((v) => (
                <tr key={v.unit.id}>
                  <td>{v.unit.title}</td>
                  <td className="small">{v.unit.scale ?? ''}</td>
                  <td className="num neg">{v.gap}</td>
                  <td className="num">{v.named}</td>
                  <td><button className="btn-ghost" disabled={openReqUnitIds.has(v.unit.id)} onClick={() => raise(v.unit.id, v.unit.title, v.gap)} aria-label={`Raise requisition for ${v.unit.title}`}>{openReqUnitIds.has(v.unit.id) ? 'In pipeline' : 'Raise'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="kanban" role="list" aria-label="Recruitment pipeline">
        {STAGES.map((stage) => {
          const cards = requisitions.filter((r) => r.stage === stage);
          return (
            <div className="kanban-col" role="listitem" key={stage}>
              <div className="kanban-col-head"><span>{STAGE_LABEL[stage]}</span><span className="kanban-count">{cards.length}</span></div>
              {cards.map((r) => (
                <div className="kanban-card" key={r.id}>
                  <div className="kanban-card-title">{r.title}</div>
                  <div className="muted small">{r.count} seat{r.count > 1 ? 's' : ''} · raised {r.raisedAt.slice(0, 10)}</div>
                  <div className="kanban-card-actions no-print">
                    {stage !== 'joined'
                      ? <button className="btn-ghost btn-mini" onClick={() => advance(r)} aria-label={`Advance ${r.title}`}>Advance →</button>
                      : <button className="btn-ghost btn-mini" onClick={() => hire(r)} aria-label={`Add ${r.title} to roster`}>Add to roster</button>}
                    <button className="icon-mini" onClick={() => drop(r)} aria-label={`Delete requisition ${r.title}`}>✕</button>
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div className="kanban-empty muted small">—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Cost ----
export function CostView({ units, people }: { units: HrUnit[]; people: HrPerson[] }) {
  const [basis, setBasis] = useState<CostBasis>('held');
  const named = useMemo(() => {
    const m = new Map<string, number>();
    occupancyByUnit(people).forEach((o, id) => m.set(id, o.named));
    return m;
  }, [people]);

  const rows = useMemo(() => costBySection(units, basis, named), [units, basis, named]);
  const total = useMemo(() => totalMonthlyCost(units, basis, named), [units, basis, named]);

  return (
    <div>
      <div className="section-head">
        <h3>Cost of establishment</h3>
        <div className="seg no-print" role="group" aria-label="Cost basis">
          <button className={`seg-btn${basis === 'held' ? ' active' : ''}`} onClick={() => setBasis('held')}>Held</button>
          <button className={`seg-btn${basis === 'named' ? ' active' : ''}`} onClick={() => setBasis('named')}>Named</button>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Monthly burn ({basis})</div><div className="kpi-value">{formatMoney(total)}</div></div>
        <div className="kpi"><div className="kpi-label">Annualised</div><div className="kpi-value">{formatMoney(total * 12)}</div></div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-head"><h3>By section</h3><span className="muted small">representative pay-bands · monthly</span></div>
        <table className="data-table" aria-label="Cost by section">
          <thead><tr><th>Section</th><th className="num">Monthly (PKR)</th><th className="num">Share</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td className="num">{formatMoney(r.monthly)}</td>
                <td className="num">{total > 0 ? Math.round((r.monthly / total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num">{formatMoney(total)}</td><td className="num">100%</td></tr></tfoot>
        </table>
        <p className="muted small">Planning figures by NLC scale band; feed these into the project’s overheads for a fully-loaded cost.</p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- Org board ----
export function OrgBoard({
  nodeId, nodes, allUnits, allPostings, allPeople,
}: { nodeId: string; nodes: OrgNode[]; allUnits: HrUnit[]; allPostings: HrPosting[]; allPeople: HrPerson[] }) {
  const self = nodeById(nodes, nodeId);
  const scope = useMemo(() => {
    const list = self ? [self, ...descendantNodes(nodes, nodeId)] : [];
    return list;
  }, [self, nodes, nodeId]);

  const rows = useMemo(() => scope.map((n) => {
    const units = allUnits.filter((u) => u.nodeId === n.id);
    const effective = units.length > 0 ? units : organogramFromPostings(n, allPostings.filter((p) => p.nodeId === n.id));
    const totals = establishmentTotals(buildOrganogram(effective));
    const present = allPeople.filter((p) => p.nodeId === n.id && p.status === 'present').length;
    return { node: n, ...totals, present, pct: fillPct(totals.held, totals.auth), status: fillStatus(totals.held, totals.auth) };
  }).filter((r) => r.auth > 0).sort((a, b) => a.pct - b.pct), [scope, allUnits, allPostings, allPeople]);

  const tot = rows.reduce((a, r) => ({ auth: a.auth + r.auth, held: a.held + r.held }), { auth: 0, held: 0 });

  return (
    <div>
      <div className="section-head">
        <h3>Org-wide HR board</h3>
        <span className="muted small">{rows.length} units · {fillPct(tot.held, tot.auth)}% filled overall · worst fill first</span>
      </div>
      <table className="data-table" aria-label="Org-wide HR board">
        <thead><tr><th>Unit</th><th>Tier</th><th className="num">Auth</th><th className="num">Held</th><th className="num">Present</th><th className="num">Vacant</th><th style={{ width: 150 }}>Fill</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.node.id}>
              <td>{r.node.name}</td>
              <td className="small muted">{r.node.type.replace('_', ' ')}</td>
              <td className="num">{r.auth}</td>
              <td className="num">{r.held}</td>
              <td className="num">{r.present}</td>
              <td className={`num ${r.auth - r.held > 0 ? 'neg' : 'pos'}`}>{r.auth - r.held}</td>
              <td>
                <div className="orgo-fill compact">
                  <div className={`orgo-fill-track status-${r.status}`}><div className="orgo-fill-bar" style={{ width: `${Math.min(100, r.pct)}%` }} /></div>
                  <span className="orgo-fill-num">{r.pct}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

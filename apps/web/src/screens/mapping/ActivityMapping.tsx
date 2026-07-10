import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import {
  linksByItem, linksByActivity, itemAllocation, effectiveWeight, activityMappedValue, allocationIssues,
} from '../../domain/mapping';
import type { BoqItem, ScheduleActivity, BoqWbsLink } from '../../data/types';

/**
 * The activity-centric half of the mapping: pick an activity, attach as many
 * BOQ items as it consumes, and say HOW MUCH of each item is executed under it.
 *
 * Quantity allocation is the honest unit. Two activities can share one BOQ item
 * (e.g. "Earthwork Zone 1" takes 6,000 m³ of the 10,000 m³ excavation item and
 * "Earthwork Zone 2" the rest) and each then carries exactly the value of the
 * quantity it will execute. Over-allocation is blocked before the mapping locks,
 * because it would bill the same quantity twice.
 */
export function ActivityMapping({ projectId, locked }: { projectId: string; locked?: boolean }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [links, setLinks] = useState<BoqWbsLink[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [actSearch, setActSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => {
    let alive = true;
    void Promise.all([provider.listBoq(projectId), provider.listSchedule(projectId), provider.listBoqWbs(projectId)])
      .then(([b, s, l]) => {
        if (!alive) return;
        setItems(b); setActs(s); setLinks(l);
        setSelected((cur) => cur || s.find((a) => !a.isMilestone)?.activityId || '');
      });
    return () => { alive = false; };
  }, [provider, projectId]);

  const byItem = useMemo(() => linksByItem(links), [links]);
  const byAct = useMemo(() => linksByActivity(links), [links]);
  const itemOf = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const issues = useMemo(() => allocationIssues(items, links), [items, links]);

  const activity = acts.find((a) => a.activityId === selected);
  const actLinks = byAct.get(selected) ?? [];
  const mappedValue = activityMappedValue(actLinks, itemOf, byItem);

  async function reload() { setLinks(await provider.listBoqWbs(projectId)); }

  async function addItem(itemId: string) {
    if (locked || !itemId || !selected) return;
    const item = itemOf.get(itemId);
    if (!item) return;
    // Default the allocation to whatever quantity of the item is still free.
    const alloc = itemAllocation(item, byItem.get(itemId) ?? []);
    const qty = alloc.usesQty ? alloc.remainingQty : item.qty;
    await provider.setBoqWbs(projectId, { boqItemId: itemId, projectId, activityId: selected, confidence: 'confirmed', qty });
    await reload();
  }
  async function setQty(l: BoqWbsLink, value: number) {
    if (locked) return;
    await provider.setBoqWbs(projectId, { ...l, qty: Math.max(0, value) });
    await reload();
  }
  async function unlink(l: BoqWbsLink) {
    if (locked) return;
    setLinks(await provider.removeBoqWbs(projectId, l.boqItemId, l.activityId));
  }

  const shownActs = acts.filter((a) => {
    const q = actSearch.trim().toLowerCase();
    return !q || `${a.activityId} ${a.name}`.toLowerCase().includes(q);
  });
  const attachable = items.filter((i) => {
    if (actLinks.some((l) => l.boqItemId === i.id)) return false;
    const q = itemSearch.trim().toLowerCase();
    return !q || `${i.code} ${i.description}`.toLowerCase().includes(q);
  });

  if (acts.length === 0) return <p className="muted">Import a schedule baseline first.</p>;
  if (items.length === 0) return <p className="muted">Import a BOQ first.</p>;

  return (
    <div>
      <div className="section-head">
        <h3>Activity → BOQ allocation</h3>
        <span className="muted small">one activity consumes many BOQ items · allocate the quantity each activity executes</span>
      </div>

      {issues.blocking && (
        <div className="card" style={{ borderColor: 'var(--danger)' }} aria-label="Allocation errors">
          <strong className="neg">{issues.overAllocated.length} BOQ item(s) over-allocated.</strong>
          <div className="muted small">
            More quantity is assigned to activities than the BOQ carries — the same work would be billed twice.
            Resolve before the mapping is approved: {issues.overAllocated.map((a) => itemOf.get(a.itemId)?.code ?? a.itemId).join(', ')}
          </div>
        </div>
      )}

      <div className="map-panes">
        <div className="map-activities">
          <input aria-label="Search activities" placeholder="Search activities…" value={actSearch} onChange={(e) => setActSearch(e.target.value)} />
          <ul className="map-act-list">
            {shownActs.map((a) => {
              const n = (byAct.get(a.activityId) ?? []).length;
              return (
                <li key={a.id}>
                  <button
                    className={`map-act${a.activityId === selected ? ' active' : ''}`}
                    aria-pressed={a.activityId === selected}
                    aria-label={`Select activity ${a.activityId}`}
                    onClick={() => setSelected(a.activityId)}
                  >
                    <span className="map-act-id">{a.activityId}</span>
                    <span className="map-act-name">{a.name}</span>
                    <span className={`chip small${n === 0 ? ' muted' : ''}`}>{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="map-detail">
          {!activity ? <p className="muted">Select an activity.</p> : (
            <>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h4>{activity.activityId} — {activity.name}</h4>
                <span className="muted small">{actLinks.length} item(s) · {formatMoney(mappedValue)} mapped</span>
              </div>

              {actLinks.length === 0 ? (
                <p className="muted">No BOQ items mapped to this activity yet.</p>
              ) : (
                <table className="data-table" aria-label="Activity BOQ allocation">
                  <thead>
                    <tr>
                      <th>Code</th><th>Description</th>
                      <th className="num">BOQ qty</th>
                      <th style={{ minWidth: 210 }}>Allocated to this activity</th>
                      <th className="num">Share</th>
                      <th className="num">Value</th>
                      <th className="num">Item remaining</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {actLinks.map((l) => {
                      const item = itemOf.get(l.boqItemId);
                      if (!item) return null;
                      const itemLinks = byItem.get(item.id) ?? [];
                      const alloc = itemAllocation(item, itemLinks);
                      const share = effectiveWeight(l, itemLinks, item);
                      const qty = l.qty ?? 0;
                      // Head-room for this link = item qty minus everything allocated elsewhere.
                      const others = alloc.allocatedQty - qty;
                      const maxForThis = Math.max(0, item.qty - others);
                      return (
                        <tr key={`${l.boqItemId}-${l.activityId}`} className={alloc.overAllocated ? 'row-flag' : ''}>
                          <td>{item.code}</td>
                          <td>{item.description}</td>
                          <td className="num">{item.qty.toLocaleString('en-PK')} {item.unit}</td>
                          <td>
                            <div className="alloc-cell">
                              <input
                                type="range" className="alloc-slider"
                                aria-label={`Allocate ${item.code} to ${l.activityId}`}
                                min={0} max={Math.max(maxForThis, qty)} step={Math.max(item.qty / 200, 0.01)}
                                value={qty} disabled={locked}
                                onChange={(e) => void setQty(l, Number(e.target.value))}
                              />
                              <input
                                className="qty-input" style={{ width: 84 }}
                                aria-label={`Allocated qty ${item.code} ${l.activityId}`}
                                defaultValue={qty} disabled={locked}
                                key={qty}
                                onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== qty) void setQty(l, v); }}
                              />
                              {!locked && maxForThis > qty && (
                                <button className="link-btn small" aria-label={`Allocate remaining ${item.code}`} onClick={() => void setQty(l, maxForThis)}>all</button>
                              )}
                            </div>
                          </td>
                          <td className="num">{Math.round(share * 100)}%</td>
                          <td className="num">{formatMoney(item.amount * share)}</td>
                          <td className={`num${alloc.overAllocated ? ' neg' : alloc.fullyAllocated ? ' pos' : ''}`}>
                            {alloc.overAllocated
                              ? `over by ${(alloc.allocatedQty - item.qty).toLocaleString('en-PK')} ⚠`
                              : `${alloc.remainingQty.toLocaleString('en-PK')} ${item.unit}`}
                          </td>
                          <td>{!locked && <button className="link-btn" aria-label={`Unlink ${item.code} from ${l.activityId}`} onClick={() => void unlink(l)}>×</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {locked ? <p className="muted small">Mapping is locked — amend it to change allocations.</p> : (
                <div className="create-row" style={{ marginTop: 10 }}>
                  <input aria-label="Search BOQ items to add" placeholder="Search BOQ items…" value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)} style={{ minWidth: 220 }} />
                  <select aria-label={`Add BOQ item to ${activity.activityId}`} value="" onChange={(e) => void addItem(e.target.value)}>
                    <option value="">+ add BOQ item…</option>
                    {attachable.slice(0, 200).map((i) => {
                      const alloc = itemAllocation(i, byItem.get(i.id) ?? []);
                      const free = alloc.usesQty ? alloc.remainingQty : i.qty;
                      return <option key={i.id} value={i.id}>{i.code} — {i.description} ({free.toLocaleString('en-PK')} {i.unit} free)</option>;
                    })}
                  </select>
                  <span className="muted small">quantity defaults to whatever is still unallocated</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

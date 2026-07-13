import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { materialCoverage, valueCoverage, activityCoverage, linksByItem, effectiveWeight, allocationIssues, type Coverage } from '../../domain/mapping';
import { suggestAllocations, proposalsToLinks } from '../../domain/mappingSuggest';
import { rateAnalysis } from '../../domain/rateanalysis';
import { BaselineLockBanner } from '../../components/BaselineLockBanner';
import { formatMoney } from '../../domain/money';
import { materialRecovery, issueValue, totalBalanceToRecover } from '../../domain/materialrecovery';
import { MappingWorkflowStrip } from '../../components/MappingWorkflowStrip';
import { ActivityMapping } from './ActivityMapping';
import { AllocationBar } from '../../components/AllocationBar';
import type { BoqItem, ScheduleActivity, BoqWbsLink, BoqMaterialLink, MaterialIssue, Subcontractor, MaterialMaster } from '../../data/types';

const SUB = ['wbs', 'activity', 'material', 'recovery'] as const;
type Sub = (typeof SUB)[number];

export function MappingTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [sub, setSub] = useState<Sub>('wbs');
  const [mapLocked, setMapLocked] = useState(false);
  // Over-allocated BOQ quantities must not survive into a locked mapping, so the
  // approval strip is blocked until they are resolved.
  const [blocked, setBlocked] = useState<string>('');
  useEffect(() => {
    let alive = true;
    void Promise.all([provider.listBoq(projectId), provider.listBoqWbs(projectId)]).then(([items, links]) => {
      if (!alive) return;
      const issues = allocationIssues(items, links);
      setBlocked(issues.blocking
        ? `${issues.overAllocated.length} BOQ item(s) allocate more quantity than the BOQ carries — resolve under Activity → BOQ before approval.`
        : '');
    });
    return () => { alive = false; };
  }, [provider, projectId, sub]);

  return (
    <div>
      <BaselineLockBanner projectId={projectId} kind="mapping" onChange={setMapLocked} />
      <MappingWorkflowStrip projectId={projectId} blockedReason={blocked} />
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={sub === 'wbs'} className={`subtab${sub === 'wbs' ? ' active' : ''}`} onClick={() => setSub('wbs')}>BOQ → WBS</button>
        <button role="tab" aria-selected={sub === 'activity'} className={`subtab${sub === 'activity' ? ' active' : ''}`} onClick={() => setSub('activity')}>Activity → BOQ</button>
        <button role="tab" aria-selected={sub === 'material'} className={`subtab${sub === 'material' ? ' active' : ''}`} onClick={() => setSub('material')}>BOQ → Material</button>
        <button role="tab" aria-selected={sub === 'recovery'} className={`subtab${sub === 'recovery' ? ' active' : ''}`} onClick={() => setSub('recovery')}>Material recovery</button>
      </div>
      {sub === 'wbs' && <WbsMapping projectId={projectId} locked={mapLocked} />}
      {sub === 'activity' && <ActivityMapping projectId={projectId} locked={mapLocked} />}
      {sub === 'material' && <MaterialMapping projectId={projectId} locked={mapLocked} />}
      {sub === 'recovery' && <MaterialRecovery projectId={projectId} />}
    </div>
  );
}

function MaterialRecovery({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);

  async function load() {
    const [i, s] = await Promise.all([provider.listMaterialIssues(projectId), provider.listSubcontractors(projectId)]);
    setIssues(i); setSubs(s);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = (id: string) => subs.find((s) => s.id === id)?.name ?? id;
  const rows = materialRecovery(issues);

  async function setRecovered(id: string, v: string) {
    setIssues([...(await provider.setMaterialRecovered(projectId, id, Number(v) || 0))]);
  }

  return (
    <div>
      <div className="section-head"><h3>Material recovery</h3><span className="muted">Balance to recover {formatMoney(totalBalanceToRecover(issues))}</span></div>
      <p className="muted small">Material issued to contractors is recovered from their RARs / final bills. Issued value = qty × issue rate.</p>

      <div className="section-head" style={{ marginTop: 8 }}><h3>By contractor</h3></div>
      <table className="data-table" aria-label="Material recovery by contractor">
        <thead><tr><th>Contractor</th><th className="num">Issued value</th><th className="num">Recovered</th><th className="num">Balance to recover</th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={4} className="muted">No material issued to contractors yet.</td></tr> :
            rows.map((r) => (
              <tr key={r.contractorId}>
                <td>{subName(r.contractorId)}</td>
                <td className="num">{formatMoney(r.issuedValue)}</td>
                <td className="num">{formatMoney(r.recovered)}</td>
                <td className={`num ${r.balance > 0 ? 'neg' : 'pos'}`}>{formatMoney(r.balance)}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="section-head" style={{ marginTop: 16 }}><h3>Issues</h3></div>
      <table className="data-table" aria-label="Material issues recovery">
        <thead><tr><th>Date</th><th>Material</th><th>Contractor</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Issued value</th><th className="num">Recovered</th></tr></thead>
        <tbody>
          {issues.filter((i) => i.contractorId).map((i) => (
            <tr key={i.id}>
              <td>{i.dated}</td>
              <td>{i.materialCode}</td>
              <td>{subName(i.contractorId!)}</td>
              <td className="num">{i.qty}</td>
              <td className="num">{formatMoney(i.rate ?? 0)}</td>
              <td className="num">{formatMoney(issueValue(i))}</td>
              <td className="num"><input className="qty-input" aria-label={`Recovered ${i.id}`} defaultValue={i.recovered ?? 0} onBlur={(e) => setRecovered(i.id, e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageBar({ c }: { c: Coverage }) {
  return (
    <div className="coverage">
      <div className="coverage-track">
        <div className="coverage-fill" style={{ width: `${c.coveragePct}%` }} />
      </div>
      <span className="muted small">
        {c.coveragePct}% mapped · {c.confirmed} confirmed · {c.auto} auto · {c.unmapped} unmapped
      </span>
    </div>
  );
}

function WbsMapping({ projectId, locked }: { projectId: string; locked?: boolean }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [links, setLinks] = useState<BoqWbsLink[]>([]);
  // Smart filtering (prototype parity): free-text search, bill filter, status pills.
  const [search, setSearch] = useState('');
  const [bill, setBill] = useState('all');
  const [statusPill, setStatusPill] = useState<'all' | 'unmapped' | 'auto' | 'confirmed'>('all');

  useEffect(() => {
    let a = true;
    Promise.all([provider.listBoq(projectId), provider.listSchedule(projectId), provider.listBoqWbs(projectId)]).then(
      ([b, s, l]) => {
        if (!a) return;
        setItems(b); setActs(s); setLinks(l);
      },
    );
    return () => { a = false; };
  }, [provider, projectId]);

  const byItem = useMemo(() => linksByItem(links), [links]);
  const vc = useMemo(() => valueCoverage(items, links), [items, links]);
  const actPct = useMemo(() => activityCoverage(acts, links), [acts, links]);
  const pending = useMemo(() => links.filter((l) => l.confidence === 'auto'), [links]);
  const actName = useMemo(() => Object.fromEntries(acts.map((a) => [a.activityId, a.name])), [acts]);
  const itemOf = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  async function addLink(item: BoqItem, activityId: string) {
    if (locked) return;
    if (!activityId || byItem.get(item.id)?.some((l) => l.activityId === activityId)) return;
    const link: BoqWbsLink = { boqItemId: item.id, projectId, activityId, confidence: 'confirmed' };
    await provider.setBoqWbs(projectId, link);
    setLinks(await provider.listBoqWbs(projectId));
  }
  async function removeLink(l: BoqWbsLink) {
    if (locked) return;
    setLinks(await provider.removeBoqWbs(projectId, l.boqItemId, l.activityId));
  }
  async function setWeight(l: BoqWbsLink, v: string) {
    if (locked) return;
    const w = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
    await provider.setBoqWbs(projectId, { ...l, weight: w });
    setLinks(await provider.listBoqWbs(projectId));
  }
  async function confirmLink(l: BoqWbsLink) {
    await provider.setBoqWbs(projectId, { ...l, confidence: 'confirmed' });
    setLinks(await provider.listBoqWbs(projectId));
  }
  const [suggesting, setSuggesting] = useState(false);
  async function runSuggest() {
    if (locked) return;
    setSuggesting(true);
    try {
      // Propose WHICH activities consume each unmapped item and HOW MUCH of it.
      // Everything lands as 'auto' and takes no part in derived progress until a
      // named user confirms it below.
      const proposed = proposalsToLinks(suggestAllocations(items, acts, links), projectId);
      for (const l of proposed) await provider.setBoqWbs(projectId, l);
      setLinks(await provider.listBoqWbs(projectId));
    } finally {
      setSuggesting(false);
    }
  }
  async function confirmAll() {
    for (const l of pending) await provider.setBoqWbs(projectId, { ...l, confidence: 'confirmed' });
    setLinks(await provider.listBoqWbs(projectId));
  }
  async function rejectAll() {
    for (const l of pending) await provider.removeBoqWbs(projectId, l.boqItemId, l.activityId);
    setLinks(await provider.listBoqWbs(projectId));
  }

  const bills = useMemo(() => [...new Set(items.map((i) => i.billNo))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [items]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (bill !== 'all' && it.billNo !== bill) return false;
      if (q && !`${it.code} ${it.description} ${it.billName} ${it.section}`.toLowerCase().includes(q)) return false;
      const ls = byItem.get(it.id) ?? [];
      if (statusPill === 'unmapped') return ls.length === 0;
      if (statusPill === 'auto') return ls.some((l) => l.confidence === 'auto');
      if (statusPill === 'confirmed') return ls.length > 0 && ls.every((l) => l.confidence === 'confirmed');
      return true;
    });
  }, [items, search, bill, statusPill, byItem]);

  return (
    <div>
      <div className="section-head">
        <h3>BOQ → WBS mapping</h3>
        <div>
          <button className="btn-ghost" onClick={runSuggest} disabled={locked || suggesting}
            title="Score unmapped BOQ items against activity names, WBS paths and assigned resources; propose a quantity split across the activities that execute them. Nothing takes effect until confirmed.">
            {suggesting ? 'Suggesting…' : '✨ Suggest mappings & quantities'}
          </button>
        </div>
      </div>
      <div className="coverage">
        <div className="coverage-track"><div className="coverage-fill" style={{ width: `${vc.pct}%` }} /></div>
        <span className="muted small" aria-label="Mapping coverage">
          {vc.pct}% of BOQ value mapped ({formatMoney(vc.mappedValue)} of {formatMoney(vc.totalValue)}) · {actPct}% of activities covered · {vc.unmappedItems.length} items unmapped
        </span>
      </div>

      {pending.length > 0 && (
        <div className="card" style={{ margin: '10px 0' }}>
          <div className="section-head"><h4>Suggested mappings — pending review</h4>
            <div className="head-tools">
              <span className="muted small">{pending.length} proposal(s); a named user must confirm before they take effect</span>
              <button className="btn btn-mini" onClick={confirmAll} disabled={locked}>Confirm all</button>
              <button className="btn-ghost btn-mini" onClick={rejectAll} disabled={locked}>Reject all</button>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Quantities are a proportional starting point — weighted by match strength and activity duration. Check them: a
            plausible name match is not proof that an activity executes that work.
          </p>
          <table className="data-table" aria-label="Mapping review queue">
            <thead><tr><th>BOQ item</th><th>→ Activity</th><th className="num">Proposed qty</th><th></th></tr></thead>
            <tbody>
              {pending.map((l) => {
                const it = itemOf[l.boqItemId];
                return (
                  <tr key={`${l.boqItemId}-${l.activityId}`}>
                    <td>{it?.code} — {it?.description}</td>
                    <td>{l.activityId} — {actName[l.activityId] ?? ''}</td>
                    <td className="num">{l.qty != null ? `${l.qty.toLocaleString('en-PK')} ${it?.unit ?? ''}` : '—'}</td>
                    <td>
                      <button className="btn btn-mini" aria-label={`Confirm ${it?.code} to ${l.activityId}`} onClick={() => confirmLink(l)}>Confirm</button>{' '}
                      <button className="btn-ghost btn-mini" aria-label={`Reject ${it?.code} to ${l.activityId}`} onClick={() => removeLink(l)}>Reject</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <>
          <div className="filter-bar" role="group" aria-label="Mapping filters" style={{ margin: '8px 0' }}>
            <input aria-label="Search BOQ items" placeholder="Search code / description…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
            <select aria-label="Filter by bill" value={bill} onChange={(e) => setBill(e.target.value)}>
              <option value="all">All bills</option>
              {bills.map((b) => <option key={b} value={b}>Bill {b}</option>)}
            </select>
            {(['all', 'unmapped', 'auto', 'confirmed'] as const).map((p) => (
              <button key={p} className={`btn-ghost btn-mini${statusPill === p ? ' active' : ''}`}
                aria-pressed={statusPill === p} aria-label={`Show ${p}`}
                onClick={() => setStatusPill(p)} style={statusPill === p ? { borderColor: 'var(--primary)', fontWeight: 600 } : undefined}>
                {p === 'all' ? 'All' : p === 'unmapped' ? 'Unmapped' : p === 'auto' ? 'Auto (pending)' : 'Confirmed'}
              </button>
            ))}
            <span className="muted small">{rows.length} of {items.length} items</span>
          </div>
          <table className="data-table" aria-label="WBS mapping">
            <thead><tr><th>Code</th><th>Description</th>
              <th style={{ minWidth: 110 }} title="Each activity's share of the item; grey is quantity not yet allocated">Allocation</th>
              <th>Mapped activities</th><th>Add activity</th></tr></thead>
            <tbody>
              {rows.map((it) => {
                const itemLinks = byItem.get(it.id) ?? [];
                return (
                  <tr key={it.id}>
                    <td>{it.code}</td>
                    <td>{it.description}</td>
                    <td><AllocationBar item={it} links={itemLinks} /></td>
                    <td>
                      {itemLinks.length === 0 ? <span className="muted small">Unmapped</span> : itemLinks.map((l) => (
                        <span key={l.activityId} className="chip" style={{ marginRight: 6 }}>
                          {l.activityId}{l.confidence === 'auto' ? ' (auto)' : ''}
                          {itemLinks.length > 1 && (
                            <> · <input className="qty-input" aria-label={`Weight ${it.code} ${l.activityId}`} style={{ width: 44 }}
                              defaultValue={Math.round(effectiveWeight(l, itemLinks) * 100)}
                              onBlur={(e) => setWeight(l, e.target.value)} />%</>
                          )}
                          <button className="link-btn" aria-label={`Unlink ${it.code} ${l.activityId}`} onClick={() => removeLink(l)} style={{ marginLeft: 4 }}>×</button>
                        </span>
                      ))}
                    </td>
                    <td>
                      <select aria-label={`WBS for ${it.code}`} value="" onChange={(e) => addLink(it, e.target.value)}>
                        <option value="">+ link activity…</option>
                        {acts.filter((a) => !itemLinks.some((l) => l.activityId === a.activityId))
                          .map((a) => (<option key={a.id} value={a.activityId}>{a.activityId} — {a.name}</option>))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function MaterialMapping({ projectId, locked }: { projectId: string; locked?: boolean }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [links, setLinks] = useState<BoqMaterialLink[]>([]);
  const [master, setMaster] = useState<MaterialMaster[]>([]);
  const [search, setSearch] = useState('');
  const [onlyComposed, setOnlyComposed] = useState<'all' | 'composed' | 'uncomposed'>('all');

  useEffect(() => {
    let a = true;
    Promise.all([provider.listBoq(projectId), provider.listBoqMaterial(projectId), provider.listMaterialMaster(projectId)]).then(([b, l, mm]) => {
      if (!a) return;
      setItems(b); setLinks(l); setMaster(mm);
    });
    return () => { a = false; };
  }, [provider, projectId]);

  const byItem = useMemo(() => {
    const m = new Map<string, BoqMaterialLink[]>();
    for (const l of links) { const arr = m.get(l.boqItemId) ?? []; arr.push(l); m.set(l.boqItemId, arr); }
    return m;
  }, [links]);

  async function upsert(item: BoqItem, materialRef: string, coeff: number, leadDays?: number) {
    if (locked) return;
    const ref = materialRef.trim().toUpperCase();
    if (!ref || coeff <= 0) return;
    await provider.setBoqMaterial(projectId, { boqItemId: item.id, projectId, materialRef: ref, coeff, confidence: 'confirmed', leadDays });
    setLinks(await provider.listBoqMaterial(projectId));
  }
  async function remove(item: BoqItem, materialRef: string) {
    if (locked) return;
    setLinks(await provider.removeBoqMaterial(projectId, item.id, materialRef));
  }

  const c = materialCoverage(items, links);
  const analysis = useMemo(() => rateAnalysis(items, links, master), [items, links, master]);
  const rows = items.filter((it) => {
    const q = search.trim().toLowerCase();
    if (q && !`${it.code} ${it.description}`.toLowerCase().includes(q)) return false;
    const has = (byItem.get(it.id)?.length ?? 0) > 0;
    if (onlyComposed === 'composed') return has;
    if (onlyComposed === 'uncomposed') return !has;
    return true;
  });

  return (
    <div>
      <div className="section-head"><h3>BOQ → Material composition</h3>
        <span className="muted small">a BOQ item consumes MANY materials (concrete = cement + sand + crush + admixture) — each with its consumption factor per unit of the item</span>
      </div>
      <CoverageBar c={c} />
      <div className="filter-bar" role="group" aria-label="Composition filters" style={{ margin: '8px 0' }}>
        <input aria-label="Search composition items" placeholder="Search code / description…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
        {(['all', 'composed', 'uncomposed'] as const).map((p) => (
          <button key={p} className="btn-ghost btn-mini" aria-pressed={onlyComposed === p} onClick={() => setOnlyComposed(p)}
            style={onlyComposed === p ? { borderColor: 'var(--primary)', fontWeight: 600 } : undefined}>
            {p === 'all' ? 'All' : p === 'composed' ? 'Composed' : 'No composition'}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <table className="data-table" aria-label="Material mapping">
          <thead><tr><th>Code</th><th>Description</th><th className="num">Item qty</th><th>Composition (material · coeff/unit → derived qty)</th><th>Add material</th></tr></thead>
          <tbody>
            {rows.map((it) => {
              const comp = byItem.get(it.id) ?? [];
              return (
                <tr key={it.id}>
                  <td>{it.code}</td>
                  <td>{it.description}</td>
                  <td className="num">{it.qty.toLocaleString('en-PK')} {it.unit}</td>
                  <td>
                    {comp.length === 0 ? <span className="muted small">No composition</span> : (
                      <table className="data-table" aria-label={`Composition for ${it.code}`} style={{ margin: 0 }}>
                        <tbody>
                          {comp.map((l) => (
                            <tr key={l.materialRef}>
                              <td className="mono small" style={{ width: 110 }}>{l.materialRef}</td>
                              <td className="num" style={{ width: 110 }}>
                                <input className="qty-input" aria-label={`Coeff ${it.code} ${l.materialRef}`} defaultValue={l.coeff} style={{ width: 80 }}
                                  onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== l.coeff) void upsert(it, l.materialRef, v, l.leadDays); }} />
                              </td>
                              <td className="num small muted" style={{ width: 150 }} title="Derived take-off = item qty × coeff">
                                → {(it.qty * l.coeff).toLocaleString('en-PK', { maximumFractionDigits: 1 })}
                              </td>
                              <td style={{ width: 30 }}>
                                <button className="link-btn" aria-label={`Remove ${l.materialRef} from ${it.code}`} onClick={() => remove(it, l.materialRef)}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {(() => { const ra = analysis.get(it.id); if (!ra) return null; return (
                      <div className={`small${ra.lossRate ? ' neg' : ' muted'}`} style={{ marginTop: 4 }} aria-label={`Rate analysis ${it.code}`}>
                        Material {formatMoney(ra.materialCostPerUnit)}/{it.unit}
                        {ra.materialSharePct !== null ? ` (${ra.materialSharePct}% of rate ${formatMoney(it.rate)})` : ''}
                        {' · '}balance for labour/plant/OH&P {formatMoney(ra.balancePerUnit)}
                        {ra.lossRate ? ' ⚠ material alone exceeds the BOQ rate' : ''}
                        {ra.missingRates.length > 0 ? ` · no master rate: ${ra.missingRates.join(', ')}` : ''}
                      </div>
                    ); })()}
                  </td>
                  <td>
                    {!locked && <AddMaterialRow itemCode={it.code} onAdd={(ref, coeff) => upsert(it, ref, coeff)} master={master} />}
                    {locked && <span className="muted small">locked</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AddMaterialRow({ itemCode, onAdd, master }: { itemCode: string; onAdd: (ref: string, coeff: number) => void; master?: MaterialMaster[] }) {
  const [ref, setRef] = useState('');
  const [coeff, setCoeff] = useState('');
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <input className="note-input" aria-label={`Material for ${itemCode}`} placeholder="e.g. CEM" value={ref} onChange={(e) => setRef(e.target.value)} style={{ width: 90 }} list="material-master-codes" />
      {master && (
        <datalist id="material-master-codes">
          {master.map((m) => <option key={m.code} value={m.code}>{m.name} · {m.standardRate}/{m.unit}</option>)}
        </datalist>
      )}
      <input className="qty-input" aria-label={`Coeff for ${itemCode}`} placeholder="coeff" value={coeff} onChange={(e) => setCoeff(e.target.value)} style={{ width: 64 }} />
      <button className="btn-ghost btn-mini" aria-label={`Add material to ${itemCode}`}
        onClick={() => { const c = Number(coeff); if (ref.trim() && c > 0) { onAdd(ref, c); setRef(''); setCoeff(''); } }}>＋</button>
    </span>
  );
}


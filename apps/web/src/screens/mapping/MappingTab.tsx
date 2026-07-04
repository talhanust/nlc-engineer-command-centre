import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { materialCoverage, valueCoverage, activityCoverage, linksByItem, effectiveWeight, type Coverage } from '../../domain/mapping';
import { suggestWbsLinks } from '../../domain/mappingSuggest';
import { formatMoney } from '../../domain/money';
import { materialRecovery, issueValue, totalBalanceToRecover } from '../../domain/materialrecovery';
import { MappingWorkflowStrip } from '../../components/MappingWorkflowStrip';
import type { BoqItem, ScheduleActivity, BoqWbsLink, BoqMaterialLink, MaterialIssue, Subcontractor } from '../../data/types';

const SUB = ['wbs', 'material', 'recovery'] as const;
type Sub = (typeof SUB)[number];

export function MappingTab({ projectId }: { projectId: string }) {
  const [sub, setSub] = useState<Sub>('wbs');
  return (
    <div>
      <MappingWorkflowStrip projectId={projectId} />
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={sub === 'wbs'} className={`subtab${sub === 'wbs' ? ' active' : ''}`} onClick={() => setSub('wbs')}>BOQ → WBS</button>
        <button role="tab" aria-selected={sub === 'material'} className={`subtab${sub === 'material' ? ' active' : ''}`} onClick={() => setSub('material')}>BOQ → Material</button>
        <button role="tab" aria-selected={sub === 'recovery'} className={`subtab${sub === 'recovery' ? ' active' : ''}`} onClick={() => setSub('recovery')}>Material recovery</button>
      </div>
      {sub === 'wbs' && <WbsMapping projectId={projectId} />}
      {sub === 'material' && <MaterialMapping projectId={projectId} />}
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

function WbsMapping({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [acts, setActs] = useState<ScheduleActivity[]>([]);
  const [links, setLinks] = useState<BoqWbsLink[]>([]);
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);

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
    if (!activityId || byItem.get(item.id)?.some((l) => l.activityId === activityId)) return;
    const link: BoqWbsLink = { boqItemId: item.id, projectId, activityId, confidence: 'confirmed' };
    await provider.setBoqWbs(projectId, link);
    setLinks(await provider.listBoqWbs(projectId));
  }
  async function removeLink(l: BoqWbsLink) {
    setLinks(await provider.removeBoqWbs(projectId, l.boqItemId, l.activityId));
  }
  async function setWeight(l: BoqWbsLink, v: string) {
    const w = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
    await provider.setBoqWbs(projectId, { ...l, weight: w });
    setLinks(await provider.listBoqWbs(projectId));
  }
  async function confirmLink(l: BoqWbsLink) {
    await provider.setBoqWbs(projectId, { ...l, confidence: 'confirmed' });
    setLinks(await provider.listBoqWbs(projectId));
  }
  async function runSuggest() {
    const sugg = suggestWbsLinks(items, acts, links);
    for (const s of sugg) await provider.setBoqWbs(projectId, s.link);
    setLinks(await provider.listBoqWbs(projectId));
  }

  const rows = onlyUnmapped ? vc.unmappedItems : items;

  return (
    <div>
      <div className="section-head">
        <h3>BOQ → WBS mapping</h3>
        <div>
          <button className="btn-ghost" onClick={runSuggest} title="Score unmapped items against activity names and queue candidates for review">✨ Suggest mappings</button>
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
            <span className="muted small">auto-suggested; a named user must confirm before they take effect</span>
          </div>
          <table className="data-table" aria-label="Mapping review queue">
            <thead><tr><th>BOQ item</th><th>→ Activity</th><th></th></tr></thead>
            <tbody>
              {pending.map((l) => (
                <tr key={`${l.boqItemId}-${l.activityId}`}>
                  <td>{itemOf[l.boqItemId]?.code} — {itemOf[l.boqItemId]?.description}</td>
                  <td>{l.activityId} — {actName[l.activityId] ?? ''}</td>
                  <td>
                    <button className="btn btn-mini" aria-label={`Confirm ${itemOf[l.boqItemId]?.code} to ${l.activityId}`} onClick={() => confirmLink(l)}>Confirm</button>{' '}
                    <button className="btn-ghost btn-mini" aria-label={`Reject ${itemOf[l.boqItemId]?.code} to ${l.activityId}`} onClick={() => removeLink(l)}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <>
          <label className="small" style={{ display: 'inline-block', margin: '6px 0' }}>
            <input type="checkbox" checked={onlyUnmapped} onChange={(e) => setOnlyUnmapped(e.target.checked)} /> Show unmapped only
          </label>
          <table className="data-table" aria-label="WBS mapping">
            <thead><tr><th>Code</th><th>Description</th><th>Mapped activities</th><th>Add activity</th></tr></thead>
            <tbody>
              {rows.map((it) => {
                const itemLinks = byItem.get(it.id) ?? [];
                return (
                  <tr key={it.id}>
                    <td>{it.code}</td>
                    <td>{it.description}</td>
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

function MaterialMapping({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [links, setLinks] = useState<Record<string, BoqMaterialLink>>({});

  useEffect(() => {
    let a = true;
    Promise.all([provider.listBoq(projectId), provider.listBoqMaterial(projectId)]).then(([b, l]) => {
      if (!a) return;
      setItems(b);
      setLinks(Object.fromEntries(l.map((x) => [x.boqItemId, x])));
    });
    return () => { a = false; };
  }, [provider, projectId]);

  async function setMaterial(item: BoqItem, materialRef: string, coeff: number) {
    if (!materialRef.trim()) return;
    const link: BoqMaterialLink = { boqItemId: item.id, projectId, materialRef: materialRef.trim(), coeff, confidence: 'confirmed' };
    setLinks((prev) => ({ ...prev, [item.id]: link }));
    await provider.setBoqMaterial(projectId, link);
  }

  const c = materialCoverage(items, Object.values(links));
  return (
    <div>
      <div className="section-head"><h3>BOQ → Material mapping</h3></div>
      <CoverageBar c={c} />
      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <table className="data-table" aria-label="Material mapping">
          <thead><tr><th>Code</th><th>Description</th><th>Material</th><th className="num">Coeff / unit</th></tr></thead>
          <tbody>
            {items.map((it) => {
              const l = links[it.id];
              return (
                <tr key={it.id}>
                  <td>{it.code}</td>
                  <td>{it.description}</td>
                  <td>
                    <input className="note-input" aria-label={`Material for ${it.code}`} defaultValue={l?.materialRef ?? ''} placeholder="e.g. Cement"
                      onBlur={(e) => setMaterial(it, e.target.value, l?.coeff ?? 0)} />
                  </td>
                  <td className="num">
                    <input className="qty-input" aria-label={`Coeff for ${it.code}`} defaultValue={l?.coeff || ''} placeholder="0"
                      onBlur={(e) => setMaterial(it, l?.materialRef ?? '', Number(e.target.value) || 0)} />
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

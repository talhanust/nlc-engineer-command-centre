import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { wbsCoverage, materialCoverage, type Coverage } from '../../domain/mapping';
import { suggestWbsLinks } from '../../domain/autoMap';
import { MapReviewModal } from '../../components/MapReviewModal';
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
  const [links, setLinks] = useState<Record<string, BoqWbsLink>>({});

  useEffect(() => {
    let a = true;
    Promise.all([provider.listBoq(projectId), provider.listSchedule(projectId), provider.listBoqWbs(projectId)]).then(
      ([b, s, l]) => {
        if (!a) return;
        setItems(b); setActs(s);
        setLinks(Object.fromEntries(l.map((x) => [x.boqItemId, x])));
      },
    );
    return () => { a = false; };
  }, [provider, projectId]);

  async function setActivity(item: BoqItem, activityId: string) {
    if (!activityId) return;
    const link: BoqWbsLink = { boqItemId: item.id, projectId, activityId, confidence: 'confirmed' };
    setLinks((prev) => ({ ...prev, [item.id]: link }));
    await provider.setBoqWbs(projectId, link);
  }

  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const suggestions = suggestWbsLinks(items, acts, Object.values(links));
  async function applyLinks(newLinks: BoqWbsLink[]) {
    if (newLinks.length === 0) return;
    setBusy(true);
    try {
      const next = { ...links };
      for (const link of newLinks) {
        next[link.boqItemId] = link;
        await provider.setBoqWbs(projectId, link);
      }
      setLinks(next);
    } finally { setBusy(false); }
  }

  const c = wbsCoverage(items, Object.values(links));
  return (
    <div>
      {review && (
        <MapReviewModal
          items={items}
          activities={acts}
          suggestions={suggestions}
          onConfirm={applyLinks}
          onClose={() => setReview(false)}
        />
      )}
      <div className="section-head"><h3>BOQ → WBS mapping</h3>
        <div className="head-tools">
          {acts.length === 0
            ? <span className="muted small">Import a schedule (Execution → Schedule) to enable mapping.</span>
            : <button className="btn-ghost" disabled={busy || suggestions.length === 0} onClick={() => setReview(true)}
                title="Review suggested activity links for unmapped BOQ items before applying">
                Auto-map{suggestions.length ? ` (${suggestions.length})` : ''}
              </button>}
        </div>
      </div>
      <CoverageBar c={c} />
      <p className="muted small">Auto-map proposes activity links for unmapped items by matching descriptions; review each before confirming. Commercial executed progress flows to these activities (Execution → Schedule) through this mapping.</p>
      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <table className="data-table" aria-label="WBS mapping">
          <thead><tr><th>Code</th><th>Description</th><th>Activity (WBS)</th><th>Link</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.code}</td>
                <td>{it.description}</td>
                <td>
                  <select aria-label={`WBS for ${it.code}`} value={links[it.id]?.activityId ?? ''} onChange={(e) => setActivity(it, e.target.value)}>
                    <option value="">Unmapped</option>
                    {acts.map((a) => (<option key={a.id} value={a.activityId}>{a.activityId} — {a.name}</option>))}
                  </select>
                </td>
                <td>
                  {links[it.id]?.confidence === 'auto'
                    ? <span className="status-pill st-draft">Auto</span>
                    : links[it.id]?.confidence === 'confirmed'
                      ? <span className="status-pill st-verified">Confirmed</span>
                      : <span className="muted small">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

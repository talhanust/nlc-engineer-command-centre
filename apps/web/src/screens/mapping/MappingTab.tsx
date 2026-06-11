import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { wbsCoverage, materialCoverage, type Coverage } from '../../domain/mapping';
import type { BoqItem, ScheduleActivity, BoqWbsLink, BoqMaterialLink } from '../../data/types';

const SUB = ['wbs', 'material'] as const;
type Sub = (typeof SUB)[number];

export function MappingTab({ projectId }: { projectId: string }) {
  const [sub, setSub] = useState<Sub>('wbs');
  return (
    <div>
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={sub === 'wbs'} className={`subtab${sub === 'wbs' ? ' active' : ''}`} onClick={() => setSub('wbs')}>BOQ → WBS</button>
        <button role="tab" aria-selected={sub === 'material'} className={`subtab${sub === 'material' ? ' active' : ''}`} onClick={() => setSub('material')}>BOQ → Material</button>
      </div>
      {sub === 'wbs' ? <WbsMapping projectId={projectId} /> : <MaterialMapping projectId={projectId} />}
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

  const c = wbsCoverage(items, Object.values(links));
  return (
    <div>
      <div className="section-head"><h3>BOQ → WBS mapping</h3></div>
      <CoverageBar c={c} />
      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <table className="data-table" aria-label="WBS mapping">
          <thead><tr><th>Code</th><th>Description</th><th>Activity (WBS)</th></tr></thead>
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

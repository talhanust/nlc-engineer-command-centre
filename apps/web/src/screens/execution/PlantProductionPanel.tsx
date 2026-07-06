import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { runConsumption, type MixDesign } from '../../domain/mixdesigns';
import type { MachineryAsset, ProductionRun, Subcontractor } from '../../data/types';

/**
 * Plant production (spec §6): a batching/asphalt plant booked to the project
 * produces concrete or asphalt of a chosen mix-design grade. The run consumes
 * the design's constituents (issued to the plant), records consumption and
 * balance, and is destined for self-execution or contractor recovery (RAR).
 */
export function PlantProductionPanel({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [plants, setPlants] = useState<MachineryAsset[]>([]);
  const [designs, setDesigns] = useState<MixDesign[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [balance, setBalance] = useState<Array<{ materialCode: string; consumed: number }>>([]);

  const [dated, setDated] = useState('2026-06-15');
  const [plantId, setPlantId] = useState('');
  const [designId, setDesignId] = useState('');
  const [outputQty, setOutputQty] = useState('');
  const [destination, setDestination] = useState<'self' | 'contractor'>('self');
  const [contractorId, setContractorId] = useState('');

  async function load() {
    const [assets, ds, sb, r] = await Promise.all([
      provider.listMachineryAssets(), provider.listMixDesigns(projectId),
      provider.listSubcontractors(projectId), provider.listProductionRuns(projectId),
    ]);
    setPlants(assets.filter((a) => (a.category === 'batching_plant' || a.category === 'asphalt_plant') && a.currentProjectId === projectId));
    setDesigns(ds); setSubs(sb); setRuns(r.filter((x) => x.mixDesignId));
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  useEffect(() => {
    if (!plantId) { setBalance([]); return; }
    let alive = true;
    void provider.plantMaterialBalance(projectId, plantId).then((b) => { if (alive) setBalance(b); });
    return () => { alive = false; };
  }, [provider, projectId, plantId, runs]);

  const design = designs.find((d) => d.id === designId);
  const preview = useMemo(() => {
    const q = Number(outputQty);
    if (!design || !Number.isFinite(q) || q <= 0) return [];
    return [...runConsumption(design, q).entries()].map(([materialCode, qty]) => ({ materialCode, qty }));
  }, [design, outputQty]);

  async function record() {
    const q = Number(outputQty);
    if (!plantId || !designId || !Number.isFinite(q) || q <= 0) return;
    if (destination === 'contractor' && !contractorId) { toast({ message: 'Select the contractor for recovery', kind: 'error' }); return; }
    await provider.recordPlantRun(projectId, { dated, mixDesignId: designId, plantAssetId: plantId, outputQty: q, destination, contractorId: contractorId || undefined });
    setOutputQty('');
    await load();
    toast({ message: `Recorded ${q} ${design?.outputUnit} of ${design?.name}`, kind: 'success' });
  }

  const subName = (id?: string) => subs.find((s) => s.id === id)?.name ?? id ?? '—';

  if (plants.length === 0) {
    return <p className="muted small">No batching or asphalt plant is booked to this project. Transfer one in via Procurement → Machinery transfer.</p>;
  }

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head"><h3>Record plant production</h3>
          <span className="muted small">consumes the mix-design constituents · output to self-execution or contractor recovery</span>
        </div>
        <div className="create-row" style={{ flexWrap: 'wrap' }}>
          <input aria-label="Run date" type="date" value={dated} onChange={(e) => setDated(e.target.value)} />
          <select aria-label="Plant" value={plantId} onChange={(e) => setPlantId(e.target.value)}>
            <option value="">Select plant…</option>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.description}</option>)}
          </select>
          <select aria-label="Mix design" value={designId} onChange={(e) => setDesignId(e.target.value)}>
            <option value="">Mix design…</option>
            {designs.map((d) => <option key={d.id} value={d.id}>{d.id} — {d.name}</option>)}
          </select>
          <input aria-label="Output quantity" placeholder={`Output ${design?.outputUnit ?? 'qty'}`} value={outputQty} onChange={(e) => setOutputQty(e.target.value)} style={{ width: 120 }} />
          <select aria-label="Destination" value={destination} onChange={(e) => setDestination(e.target.value as 'self' | 'contractor')}>
            <option value="self">Self-execution</option>
            <option value="contractor">Contractor (recover via RAR)</option>
          </select>
          {destination === 'contractor' && (
            <select aria-label="Recovery contractor" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">Contractor…</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button className="btn" aria-label="Record run" disabled={!plantId || !designId || !(Number(outputQty) > 0)} onClick={record}>Record run</button>
        </div>
        {preview.length > 0 && (
          <p className="muted small" style={{ marginTop: 6 }}>
            Will consume: {preview.map((c) => `${c.qty} ${c.materialCode}`).join(' · ')}
          </p>
        )}
      </section>

      {plantId && balance.length > 0 && (
        <section className="card">
          <div className="section-head"><h3>Plant material consumption</h3>
            <span className="muted small">{plants.find((p) => p.id === plantId)?.code}</span>
          </div>
          <table className="data-table" aria-label="Plant material balance">
            <thead><tr><th>Material</th><th className="num">Consumed</th></tr></thead>
            <tbody>
              {balance.map((b) => (
                <tr key={b.materialCode}><td className="mono small">{b.materialCode}</td><td className="num">{b.consumed.toLocaleString('en-PK')}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="section-head"><h3>Plant runs</h3></div>
        {runs.length === 0 ? (
          <p className="muted small">No plant runs recorded.</p>
        ) : (
          <table className="data-table" aria-label="Plant runs">
            <thead><tr><th>Date</th><th>Grade</th><th className="num">Output</th><th>Destination</th><th>Constituents</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small">{r.dated}</td>
                  <td className="small">{r.mixDesignId} — {r.product}</td>
                  <td className="num">{r.actualQty.toLocaleString('en-PK')} {r.unit}</td>
                  <td className="small">{r.destination === 'contractor' ? `Recover: ${subName(r.contractorId)}` : 'Self-execution'}</td>
                  <td className="small">{(r.consumption ?? []).map((c) => `${c.qty} ${c.materialCode}`).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

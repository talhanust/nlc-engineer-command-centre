import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { ROLE_LABEL } from '../../domain/chains';
import { MAINTENANCE_CHAIN, pendingMaintStage, isMaintComplete } from '../../domain/maintenance';
import type { InventoryItem, PolRecord, FixedAsset, MaintenanceRequest } from '../../data/types';

const KIND_LABEL = { plant: 'Plant', equipment: 'Equipment', vehicle: 'Vehicle' };

export function InventoryTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<InventoryItem[]>([]);
  useEffect(() => { provider.listInventory(projectId).then(setItems); }, [provider, projectId]);

  const avgUtil = items.length ? Math.round(items.reduce((s, i) => s + i.utilizationPct, 0) / items.length) : 0;
  async function setUtil(it: InventoryItem, v: string) {
    setItems([...(await provider.upsertInventory(projectId, { ...it, utilizationPct: Number(v) || 0 }))]);
  }

  return (
    <div>
      <div className="section-head"><h3>Inventory — plant, equipment & vehicles</h3><span className="muted">{items.length} units · avg utilisation {avgUtil}%</span></div>
      <table className="data-table" aria-label="Inventory">
        <thead><tr><th>Name</th><th>Kind</th><th>Ownership</th><th>Reg no.</th><th>Status</th><th className="num">Utilisation %</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td><td>{KIND_LABEL[i.kind]}</td>
              <td>{i.ownership === 'hired' ? <span className="status-pill st-vetted">Hired</span> : <span className="status-pill st-paid">Integral</span>}</td>
              <td>{i.regNo}</td>
              <td className={i.status === 'breakdown' ? 'neg' : ''}>{i.status}</td>
              <td className="num"><input className="qty-input" aria-label={`Utilisation ${i.id}`} defaultValue={i.utilizationPct} onBlur={(e) => setUtil(i, e.target.value)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PolTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [rows, setRows] = useState<PolRecord[]>([]);
  useEffect(() => { provider.listPol(projectId).then(setRows); }, [provider, projectId]);

  const inStore = rows.reduce((s, r) => s + (r.procured - r.issued), 0);
  return (
    <div>
      <div className="section-head"><h3>POL (fuel)</h3><span className="muted">In-store {inStore.toLocaleString()} L</span></div>
      <p className="muted small">Fuel procured vs issued to plant/vehicles, with ideal-vs-actual consumption by running.</p>
      <table className="data-table" aria-label="POL">
        <thead><tr><th>Month</th><th>Fuel</th><th className="num">Procured (L)</th><th className="num">Issued (L)</th><th className="num">In-store (L)</th><th className="num">Ideal</th><th className="num">Actual</th><th className="num">Variance</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const variance = r.actualConsumption - r.idealConsumption;
            return (
              <tr key={r.id}>
                <td>{r.month}</td><td>{r.fuel}</td>
                <td className="num">{r.procured.toLocaleString()}</td>
                <td className="num">{r.issued.toLocaleString()}</td>
                <td className="num">{(r.procured - r.issued).toLocaleString()}</td>
                <td className="num">{r.idealConsumption.toLocaleString()}</td>
                <td className="num">{r.actualConsumption.toLocaleString()}</td>
                <td className={`num ${variance > 0 ? 'neg' : 'pos'}`}>{variance > 0 ? '+' : ''}{variance.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FixedAssetsTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  useEffect(() => { provider.listFixedAssets(projectId).then(setAssets); }, [provider, projectId]);
  const total = assets.reduce((s, a) => s + a.value, 0);
  return (
    <div>
      <div className="section-head"><h3>Fixed assets</h3><span className="muted">{assets.length} assets · {formatMoney(total)}</span></div>
      <table className="data-table" aria-label="Fixed assets">
        <thead><tr><th>Category</th><th>Description</th><th>Acquired</th><th className="num">Value</th></tr></thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id}><td>{a.category}</td><td>{a.description}</td><td>{a.acquired}</td><td className="num">{formatMoney(a.value)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total</td><td className="num">{formatMoney(total)}</td></tr></tfoot>
      </table>
    </div>
  );
}

export function MaintenanceTab({ projectId, role }: { projectId: string; role: string }) {
  const { provider } = useData();
  const [reqs, setReqs] = useState<MaintenanceRequest[]>([]);
  const [asset, setAsset] = useState('');
  const [desc, setDesc] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');

  async function load() { setReqs(await provider.listMaintenance(projectId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  async function create() {
    if (!asset.trim()) return;
    await provider.createMaintenance(projectId, { asset: asset.trim(), description: desc.trim(), estCost: Number(cost) || 0 });
    setAsset(''); setDesc(''); setCost(''); await load();
  }
  async function advance(reqNo: string) {
    setError('');
    try { await provider.advanceMaintenance(projectId, reqNo, role); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div>
      <div className="section-head"><h3>Maintenance requests</h3><span className="muted">acting as {ROLE_LABEL[role] ?? role}</span></div>
      <div className="card create-row">
        <input aria-label="Maintenance asset" placeholder="Asset" value={asset} onChange={(e) => setAsset(e.target.value)} />
        <input aria-label="Maintenance description" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <input aria-label="Maintenance cost" placeholder="Est. cost (PKR)" value={cost} onChange={(e) => setCost(e.target.value)} />
        <button className="btn" onClick={create}>Raise request</button>
      </div>
      {error && <p className="neg small">{error}</p>}

      {reqs.length === 0 ? <p className="muted">No maintenance requests yet.</p> : reqs.map((r) => {
        const stage = pendingMaintStage(r.stageIndex);
        const done = isMaintComplete(r.stageIndex);
        return (
          <div className="card" key={r.id} style={{ marginTop: 10 }}>
            <div className="section-head"><strong>{r.reqNo} · {r.asset}</strong><span className="muted">{formatMoney(r.estCost)}</span></div>
            <p className="muted small">{r.description}</p>
            <ol className="wf-steps">
              {MAINTENANCE_CHAIN.map((s, i) => {
                const st = done || i < r.stageIndex ? 'done' : i === r.stageIndex ? 'current' : 'todo';
                return (<li key={s.action} className={`wf-step ${st}`}><span className="wf-dot" aria-hidden>{st === 'done' ? '✓' : i + 1}</span><span>{s.label}</span></li>);
              })}
            </ol>
            {done ? <span className="pos small">Completed & paid.</span> : (
              <button className="btn" disabled={!stage || stage.role !== role} aria-label={`Advance ${r.reqNo}`}
                title={stage && stage.role !== role ? `Awaiting ${ROLE_LABEL[stage.role] ?? stage.role}` : ''} onClick={() => advance(r.reqNo)}>
                {stage ? stage.label : '—'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

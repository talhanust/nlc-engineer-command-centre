import { useEffect, useMemo, useState } from 'react';
import { PoDetailModal } from '../../components/PoDetailModal';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { isFinal } from '../../domain/chains';
import type { Demand, PurchaseOrder, Crv, Supplier } from '../../data/types';

export function PoCrvTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [detailPo, setDetailPo] = useState<PurchaseOrder | null>(null);
  const [crvs, setCrvs] = useState<Crv[]>([]);
  const [demandId, setDemandId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [crvPoId, setCrvPoId] = useState('');
  const [crvCode, setCrvCode] = useState('');
  const [crvQty, setCrvQty] = useState('');

  async function reload() {
    const [d, s, p, c] = await Promise.all([
      provider.listDemands(projectId), provider.listSuppliers(projectId),
      provider.listPurchaseOrders(projectId), provider.listCrvs(projectId),
    ]);
    setDemands(d); setSuppliers(s); setPos(p); setCrvs(c);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  // Only fully-approved demands can become POs.
  const approvedDemands = demands.filter((d) => isFinal(d.chainType, d.currentStage));
  const supName = useMemo(() => {
    const m = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? id;
  }, [suppliers]);

  async function createPo() {
    if (!demandId || !supplierId) return;
    await provider.createPurchaseOrder(projectId, { demandId, supplierId });
    setDemandId(''); setSupplierId(''); await reload();
  }
  async function createCrv() {
    const q = Number(crvQty);
    if (!crvPoId || !crvCode.trim() || !Number.isFinite(q)) return;
    await provider.createCrv(projectId, { poId: crvPoId, received: [{ code: crvCode.trim(), qtyReceived: q }] });
    setCrvCode(''); setCrvQty(''); await reload();
  }

  return (
    <div>
      {detailPo && <PoDetailModal projectId={projectId} po={detailPo} onClose={() => setDetailPo(null)} />}
      <div className="section-head"><h3>Purchase orders</h3><span className="muted">{pos.length} POs</span></div>
      <div className="card create-row">
        <select aria-label="PO demand" value={demandId} onChange={(e) => setDemandId(e.target.value)}>
          <option value="">Approved demand…</option>
          {approvedDemands.map((d) => (<option key={d.id} value={d.id}>{d.demandNo} — {formatMoney(d.totalEstimated)}</option>))}
        </select>
        <select aria-label="PO supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Supplier…</option>
          {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
        <button className="btn" onClick={createPo} disabled={approvedDemands.length === 0}>Issue PO</button>
      </div>
      {approvedDemands.length === 0 && <p className="muted small">No fully-approved demands yet — approve a demand through its chain first.</p>}
      {pos.length > 0 && (
        <table className="data-table" aria-label="Purchase orders">
          <thead><tr><th>PO</th><th>Supplier</th><th className="num">Value</th><th>Status</th></tr></thead>
          <tbody>{pos.map((p) => (<tr key={p.id}><td>{p.poNo} <button className="btn-ghost" style={{ marginLeft: 6, padding: '1px 7px' }} aria-label={`Details for ${p.poNo}`} onClick={() => setDetailPo(p)}>Details</button></td><td>{supName(p.supplierId)}</td><td className="num">{formatMoney(p.totalValue)}</td><td>{p.status}</td></tr>))}</tbody>
        </table>
      )}

      <div className="section-head" style={{ marginTop: 20 }}><h3>CRVs (receipt vouchers)</h3><span className="muted">{crvs.length} CRVs</span></div>
      <div className="card create-row">
        <select aria-label="CRV PO" value={crvPoId} onChange={(e) => setCrvPoId(e.target.value)}>
          <option value="">PO…</option>
          {pos.map((p) => (<option key={p.id} value={p.id}>{p.poNo}</option>))}
        </select>
        <input aria-label="CRV item code" placeholder="Item code" value={crvCode} onChange={(e) => setCrvCode(e.target.value)} />
        <input aria-label="CRV qty received" placeholder="Qty received" value={crvQty} onChange={(e) => setCrvQty(e.target.value)} />
        <button className="btn" onClick={createCrv} disabled={pos.length === 0}>Record receipt</button>
      </div>
      {crvs.length > 0 && (
        <table className="data-table" aria-label="CRVs">
          <thead><tr><th>CRV</th><th>PO</th><th>Items</th><th>Flag</th></tr></thead>
          <tbody>
            {crvs.map((c) => (
              <tr key={c.id}>
                <td>{c.crvNo}</td>
                <td>{pos.find((p) => p.id === c.poId)?.poNo ?? c.poId}</td>
                <td>{c.received.map((r) => `${r.code}×${r.qtyReceived}`).join(', ')}</td>
                <td>{c.overReceipt ? <span className="status-pill st-draft" style={{ background: 'var(--rag-red)', color: '#fff' }}>Over-receipt</span> : <span className="pos small">ok</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { pendingStage, ROLE_LABEL } from '../../domain/chains';
import { ChainProgress } from './ProcurementTab';
import { DemandDetailModal } from '../../components/DemandDetailModal';
import type { BoqItem, Demand, DemandItem, DemandType } from '../../data/types';

const TYPE_LABEL: Record<DemandType, string> = {
  material: 'Material', machinery: 'Machinery (purchase)', machinery_hire: 'Machinery hire',
};

export function DemandsTab({ projectId, role }: { projectId: string; role: string }) {
  const { provider } = useData();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [detailDemand, setDetailDemand] = useState<Demand | null>(null);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [type, setType] = useState<DemandType>('material');
  const [justification, setJustification] = useState('');
  const [items, setItems] = useState<DemandItem[]>([]);
  // item builder fields
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');

  async function reload() {
    const [d, b] = await Promise.all([provider.listDemands(projectId), provider.listBoq(projectId)]);
    setDemands(d); setBoq(b);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  function pickBoq(id: string) {
    const it = boq.find((x) => x.id === id);
    if (!it) return;
    setCode(it.code); setDesc(it.description); setUnit(it.unit); setRate(String(it.rate));
  }
  function addItem() {
    const q = Number(qty), r = Number(rate);
    if (!desc.trim() || !Number.isFinite(q) || !Number.isFinite(r)) return;
    setItems((prev) => [...prev, { code: code || `I-${prev.length + 1}`, description: desc, unit, qty: q, estimatedRate: r }]);
    setCode(''); setDesc(''); setUnit(''); setQty(''); setRate('');
  }
  async function submit() {
    if (items.length === 0) return;
    await provider.createDemand(projectId, { type, justification: justification.trim(), items });
    setItems([]); setJustification('');
    await reload();
  }
  async function advance(d: Demand) {
    try {
      await provider.advanceDemand(projectId, d.demandNo, role);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const estTotal = items.reduce((a, i) => a + i.qty * i.estimatedRate, 0);

  return (
    <div>
      {detailDemand && <DemandDetailModal demand={detailDemand} onClose={() => setDetailDemand(null)} />}
      <div className="section-head"><h3>Demands</h3><span className="muted">{demands.length} demands</span></div>

      <div className="card">
        <h3>New demand</h3>
        <div className="create-row">
          <select aria-label="Demand type" value={type} onChange={(e) => setType(e.target.value as DemandType)}>
            {(['material', 'machinery', 'machinery_hire'] as DemandType[]).map((t) => (<option key={t} value={t}>{TYPE_LABEL[t]}</option>))}
          </select>
          <input aria-label="Demand justification" placeholder="Justification" value={justification} onChange={(e) => setJustification(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        </div>
        <div className="create-row" style={{ marginTop: 8 }}>
          <select aria-label="BOQ picker" value="" onChange={(e) => pickBoq(e.target.value)}>
            <option value="">Pick from BOQ…</option>
            {boq.map((b) => (<option key={b.id} value={b.id}>{b.code} — {b.description}</option>))}
          </select>
          <input aria-label="Item code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 90 }} />
          <input aria-label="Item description" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <input aria-label="Item unit" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 70 }} />
          <input aria-label="Item qty" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80 }} />
          <input aria-label="Item rate" placeholder="Rate" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 90 }} />
          <button className="btn-ghost" onClick={addItem}>Add item</button>
        </div>
        {items.length > 0 && (
          <table className="data-table" aria-label="Demand items">
            <thead><tr><th>Code</th><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {items.map((i, idx) => (<tr key={idx}><td>{i.code}</td><td>{i.description}</td><td className="num">{i.qty}</td><td className="num">{i.estimatedRate}</td><td className="num">{formatMoney(i.qty * i.estimatedRate)}</td></tr>))}
            </tbody>
            <tfoot><tr><td colSpan={4}>Estimated total</td><td className="num">{formatMoney(estTotal)}</td></tr></tfoot>
          </table>
        )}
        <div className="modal-actions"><button className="btn" onClick={submit} disabled={items.length === 0}>Raise demand</button></div>
      </div>

      {demands.length === 0 ? (
        <p className="muted">No demands yet.</p>
      ) : (
        demands.map((d) => {
          const ps = pendingStage(d.chainType, d.currentStage);
          const canAct = ps?.role === role;
          return (
            <div className="card" key={d.id}>
              <div className="section-head">
                <strong>{d.demandNo} · {TYPE_LABEL[d.type]}</strong>
                <div className="head-tools">
                  <span className="muted">{formatMoney(d.totalEstimated)}</span>
                  <button className="btn-ghost" aria-label={`Details for ${d.demandNo}`} onClick={() => setDetailDemand(d)}>Details</button>
                </div>
              </div>
              <p className="muted small">{d.justification}</p>
              <ChainProgress chainType={d.chainType} currentStage={d.currentStage} />
              <div className="modal-actions">
                {ps ? (
                  <button className="btn" onClick={() => advance(d)} disabled={!canAct} title={canAct ? '' : `Awaiting ${ROLE_LABEL[ps.role]}`}>
                    {ps.label} (as {ROLE_LABEL[ps.role]})
                  </button>
                ) : (
                  <span className="status-pill st-paid">Fully approved</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

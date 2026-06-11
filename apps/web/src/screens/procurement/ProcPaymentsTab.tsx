import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { pendingStage, ROLE_LABEL } from '../../domain/chains';
import { ChainProgress } from './ProcurementTab';
import type { ProcPayment, ProcChainType, PurchaseOrder } from '../../data/types';

const CHAINS: { value: ProcChainType; label: string }[] = [
  { value: 'proc_payment_material', label: 'Material payment (9-stage)' },
  { value: 'proc_payment_machinery', label: 'Machinery payment (6-stage)' },
  { value: 'machinery_payment', label: 'Machinery hire payment (5-stage)' },
];

export function ProcPaymentsTab({ projectId, role }: { projectId: string; role: string }) {
  const { provider } = useData();
  const [pays, setPays] = useState<ProcPayment[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [refId, setRefId] = useState('');
  const [amount, setAmount] = useState('');
  const [chainType, setChainType] = useState<ProcChainType>('proc_payment_material');

  async function reload() {
    const [p, o] = await Promise.all([provider.listProcPayments(projectId), provider.listPurchaseOrders(projectId)]);
    setPays(p); setPos(o);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  async function create() {
    const a = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(a) || a <= 0) return;
    await provider.createProcPayment(projectId, { refType: 'po', refId: refId || 'manual', amount: a, chainType });
    setAmount(''); setRefId(''); await reload();
  }
  async function advance(p: ProcPayment) {
    try { await provider.advanceProcPayment(projectId, p.paymentNo, role); await reload(); }
    catch (e) { alert((e as Error).message); }
  }

  return (
    <div>
      <div className="section-head"><h3>Procurement payments</h3><span className="muted">{pays.length} payments</span></div>
      <div className="card create-row">
        <select aria-label="Payment chain" value={chainType} onChange={(e) => setChainType(e.target.value as ProcChainType)}>
          {CHAINS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
        </select>
        <select aria-label="Payment PO" value={refId} onChange={(e) => setRefId(e.target.value)}>
          <option value="">PO (optional)…</option>
          {pos.map((p) => (<option key={p.id} value={p.id}>{p.poNo}</option>))}
        </select>
        <input aria-label="Payment amount" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={create}>Raise payment</button>
      </div>

      {pays.length === 0 ? (
        <p className="muted">No payments yet.</p>
      ) : (
        pays.map((p) => {
          const ps = pendingStage(p.chainType, p.currentStage);
          const canAct = ps?.role === role;
          return (
            <div className="card" key={p.id}>
              <div className="section-head"><strong>{p.paymentNo}</strong><span className="muted">{formatMoney(p.amount)}</span></div>
              <ChainProgress chainType={p.chainType} currentStage={p.currentStage} />
              <div className="modal-actions">
                {ps ? (
                  <button className="btn" onClick={() => advance(p)} disabled={!canAct} title={canAct ? '' : `Awaiting ${ROLE_LABEL[ps.role]}`}>
                    {ps.label} (as {ROLE_LABEL[ps.role]})
                  </button>
                ) : (
                  <span className="status-pill st-paid">Recorded</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { AuditTrail } from './AuditTrail';
import type { PurchaseOrder, Crv, Supplier, Demand } from '../data/types';

export function PoDetailModal({ projectId, po, onClose }: { projectId: string; po: PurchaseOrder; onClose: () => void }) {
  const { provider } = useData();
  const [crvs, setCrvs] = useState<Crv[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  useEffect(() => {
    let a = true;
    Promise.all([provider.listCrvs(projectId), provider.listSuppliers(projectId), provider.listDemands(projectId)]).then(([c, s, d]) => {
      if (a) { setCrvs(c.filter((x) => x.poId === po.id)); setSuppliers(s); setDemands(d); }
    });
    return () => { a = false; };
  }, [provider, projectId, po.id]);

  const supplier = suppliers.find((s) => s.id === po.supplierId)?.name ?? po.supplierId;
  const demand = demands.find((d) => d.id === po.demandId)?.demandNo ?? po.demandId;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`PO ${po.poNo} detail`} aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{po.poNo}</h3>
          <span className={`status-pill st-${po.status}`}>{po.status}</span>
        </div>
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">Supplier</div><div className="kpi-value" style={{ fontSize: 15 }}>{supplier}</div></div>
          <div className="kpi"><div className="kpi-label">From demand</div><div className="kpi-value" style={{ fontSize: 15 }}>{demand}</div></div>
          <div className="kpi"><div className="kpi-label">Total value</div><div className="kpi-value">{formatMoney(po.totalValue)}</div></div>
        </div>

        <h3>Receipt vouchers (CRVs)</h3>
        {crvs.length === 0 ? (
          <p className="muted small">No receipts recorded against this PO yet.</p>
        ) : (
          <table className="data-table" aria-label="PO receipt vouchers">
            <thead><tr><th>CRV</th><th>Received</th><th>Over-receipt</th></tr></thead>
            <tbody>
              {crvs.map((c) => (
                <tr key={c.id}>
                  <td>{c.crvNo}</td>
                  <td>{c.received.map((r) => `${r.code}×${r.qtyReceived}`).join(', ')}</td>
                  <td>{c.overReceipt ? <span className="neg">flagged</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14 }}><AuditTrail entity="PO" reference={po.poNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

import { formatMoney } from '../domain/money';
import { ROLE_LABEL } from '../domain/chains';
import { ChainProgress } from '../screens/procurement/ProcurementTab';
import { AuditTrail } from './AuditTrail';
import type { Demand } from '../data/types';

export function DemandDetailModal({ demand, onClose }: { demand: Demand; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`Demand ${demand.demandNo} detail`} aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{demand.demandNo} · {demand.type}</h3>
          <span className="muted">{formatMoney(demand.totalEstimated)}</span>
        </div>
        <p className="muted small">{demand.justification}</p>

        <h3>Approval chain</h3>
        <ChainProgress chainType={demand.chainType} currentStage={demand.currentStage} />

        <h3 style={{ marginTop: 14 }}>Items</h3>
        <table className="data-table" aria-label="Demand items">
          <thead><tr><th>Code</th><th>Description</th><th>Unit</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {demand.items.map((it, i) => (
              <tr key={i}>
                <td>{it.code}</td><td>{it.description}</td><td>{it.unit}</td>
                <td className="num">{it.qty}</td><td className="num">{formatMoney(it.estimatedRate)}</td>
                <td className="num">{formatMoney(it.qty * it.estimatedRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: 14 }}>Approval history</h3>
        {demand.history.length === 0 ? (
          <p className="muted small">Not yet actioned.</p>
        ) : (
          <table className="data-table" aria-label="Demand approval history">
            <thead><tr><th>Stage</th><th>Action</th><th>Role</th><th>When</th></tr></thead>
            <tbody>
              {demand.history.map((h, i) => (
                <tr key={i}>
                  <td>{h.stageIndex + 1}</td><td>{h.action}</td>
                  <td>{ROLE_LABEL[h.role] ?? h.role}</td>
                  <td className="small">{new Date(h.at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14 }}><AuditTrail entity="Demand" reference={demand.demandNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

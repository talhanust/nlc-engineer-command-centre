import { formatMoney } from '../domain/money';
import { ROLE_LABEL } from '../domain/chains';
import { ChainProgress } from '../screens/procurement/ProcurementTab';
import { AuditTrail } from './AuditTrail';
import type { ProcPayment } from '../data/types';

export function PaymentDetailModal({ payment, onClose }: { payment: ProcPayment; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`Payment ${payment.paymentNo} detail`} aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{payment.paymentNo}</h3>
          <span className="muted">{formatMoney(payment.amount)}</span>
        </div>
        <p className="muted small">Against {payment.refType === 'po' ? 'purchase order' : 'machinery hire'} · {payment.refId}</p>

        <h3>Approval chain</h3>
        <ChainProgress chainType={payment.chainType} currentStage={payment.currentStage} />

        <h3 style={{ marginTop: 14 }}>Approval history</h3>
        {payment.history.length === 0 ? (
          <p className="muted small">Not yet actioned.</p>
        ) : (
          <table className="data-table" aria-label="Payment approval history">
            <thead><tr><th>Stage</th><th>Action</th><th>Role</th><th>When</th></tr></thead>
            <tbody>
              {payment.history.map((h, i) => (
                <tr key={i}>
                  <td>{h.stageIndex + 1}</td><td>{h.action}</td>
                  <td>{ROLE_LABEL[h.role] ?? h.role}</td>
                  <td className="small">{new Date(h.at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14 }}><AuditTrail entity="Payment" reference={payment.paymentNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

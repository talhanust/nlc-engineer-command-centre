import { useState } from 'react';
import { currentStep, type ApptChainState } from '../domain/apptchain';
import { appointment } from '../domain/appointments';

/**
 * Shared appointment-chain UI: where the file sits, and act / return /
 * resubmit controls shown ONLY to the signed-in holder of the current
 * appointment (admin may act any step). Used by the contracts and RAR
 * registers — any future chain (HR ladder, supplier bills) reuses this.
 */

export function ChainStatus({ chain, refNo }: { chain?: ApptChainState; refNo: string }) {
  if (!chain) return null;
  if (chain.status === 'approved') return <div className="pos small">chain complete</div>;
  if (chain.status === 'returned') {
    const last = chain.history[chain.history.length - 1];
    return <div className="neg small">returned — {last?.remarks?.slice(0, 40) ?? 'for correction'}</div>;
  }
  const step = currentStep(chain);
  return (
    <div className="small muted" aria-label={`Chain ${refNo}`}>
      with {step ? appointment(step.appointmentId)?.title ?? step.appointmentId : '—'} · step {chain.currentIndex + 1}/{chain.steps.length}
    </div>
  );
}

export function ChainControls({ chain, refNo, me, isAdmin, canResubmit, onAct, onReturn, onResubmit }: {
  chain?: ApptChainState;
  refNo: string;
  me?: string;
  isAdmin: boolean;
  /** Appointments allowed to resubmit a returned file (originators). */
  canResubmit: string[];
  onAct: () => void | Promise<void>;
  onReturn: (remarks: string) => void | Promise<void>;
  onResubmit: () => void | Promise<void>;
}) {
  const [returning, setReturning] = useState(false);
  const [remarks, setRemarks] = useState('');
  if (!chain) return null;

  if (chain.status === 'returned') {
    const may = isAdmin || (me !== undefined && canResubmit.includes(me));
    return may ? (
      <button className="btn btn-mini" style={{ marginLeft: 6 }} aria-label={`Resubmit ${refNo}`} onClick={() => void onResubmit()}>Resubmit</button>
    ) : null;
  }
  const step = currentStep(chain);
  if (!step || !(isAdmin || me === step.appointmentId)) return null;

  return (
    <>
      <button className="btn btn-mini" style={{ marginLeft: 6 }} aria-label={`${step.action} ${refNo}`} onClick={() => void onAct()}>
        {step.action === 'approve' ? 'Approve ✓' : step.action === 'audit' ? 'Audit ✓' : step.label.split(' ').slice(-1)[0].replace(/s$/, '')}
      </button>
      <button className="btn-ghost btn-mini" style={{ marginLeft: 4 }} aria-label={`Return ${refNo}`} onClick={() => setReturning(true)}>Return…</button>
      {returning && (
        <div className="modal-backdrop" onClick={() => setReturning(false)}>
          <div className="modal" role="dialog" aria-label={`Return ${refNo} for correction`} onClick={(e) => e.stopPropagation()}>
            <h3>Return for correction — {refNo}</h3>
            <textarea aria-label="Return remarks" rows={3} style={{ width: '100%' }} placeholder="Remarks (required)…" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setReturning(false)}>Cancel</button>
              <button className="btn" disabled={remarks.trim().length < 3}
                onClick={() => { setReturning(false); void onReturn(remarks.trim()); setRemarks(''); }}>
                Return file
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { nextTransition, IPC_STATUS_LABEL } from '../../domain/ipc';
import { EscalationCalculator } from './EscalationCalculator';
import type { Epc } from '../../data/types';

export function EpcRegister({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [period, setPeriod] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    let alive = true;
    provider.listEpcs(projectId).then((e) => alive && setEpcs(e));
    return () => {
      alive = false;
    };
  }, [provider, projectId]);

  async function create() {
    const a = Number(amount.replace(/,/g, ''));
    if (!period.trim() || !Number.isFinite(a) || a <= 0) return;
    const e = await provider.createEpc(projectId, { period: period.trim(), amount: a });
    setEpcs((prev) => [...prev, e]);
    setPeriod('');
    setAmount('');
  }

  async function advance(epc: Epc) {
    const t = nextTransition(epc.status); // EPC shares the IPC pipeline
    if (!t) return;
    const updated = await provider.transitionEpc(projectId, epc.epcNo, t.action);
    setEpcs((prev) => prev.map((e) => (e.epcNo === updated.epcNo ? updated : e)));
  }

  return (
    <div>
      <EscalationCalculator onAmount={(amt) => setAmount(String(amt))} />
      <div className="section-head">
        <h3>Escalation (EPC)</h3>
        <span className="muted">{epcs.length} certificates</span>
      </div>
      <div className="card create-row">
        <input aria-label="EPC period" placeholder="Period" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <input aria-label="EPC amount" placeholder="Escalation amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={create}>New EPC</button>
      </div>
      {epcs.length === 0 ? (
        <p className="muted">No escalation certificates yet.</p>
      ) : (
        <table className="data-table" aria-label="EPC register">
          <thead><tr><th>EPC</th><th>Period</th><th>Status</th><th className="num">Amount</th><th>Action</th></tr></thead>
          <tbody>
            {epcs.map((epc) => {
              const t = nextTransition(epc.status);
              return (
                <tr key={epc.epcNo}>
                  <td>{epc.epcNo}</td>
                  <td>{epc.period}</td>
                  <td><span className={`status-pill st-${epc.status}`}>{IPC_STATUS_LABEL[epc.status]}</span></td>
                  <td className="num">{formatMoney(epc.amount)}</td>
                  <td>{t ? <button className="btn-ghost" onClick={() => advance(epc)}>{t.label}</button> : <span className="muted small">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

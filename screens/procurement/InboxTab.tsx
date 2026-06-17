import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { pendingStage, ROLE_LABEL, roleHasPower } from '../../domain/chains';
import type { Demand, ProcPayment } from '../../data/types';

export function InboxTab({ projectId, role }: { projectId: string; role: string }) {
  const { provider } = useData();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [payments, setPayments] = useState<ProcPayment[]>([]);

  async function reload() {
    const [d, p] = await Promise.all([provider.listDemands(projectId), provider.listProcPayments(projectId)]);
    setDemands(d); setPayments(p);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const myDemands = demands.filter((d) => pendingStage(d.chainType, d.currentStage)?.role === role);
  const myPayments = payments.filter((p) => pendingStage(p.chainType, p.currentStage)?.role === role);

  async function actDemand(d: Demand) {
    try { await provider.advanceDemand(projectId, d.demandNo, role); await reload(); }
    catch (e) { alert((e as Error).message); }
  }
  async function actPayment(p: ProcPayment) {
    try { await provider.advanceProcPayment(projectId, p.paymentNo, role); await reload(); }
    catch (e) { alert((e as Error).message); }
  }

  const empty = myDemands.length === 0 && myPayments.length === 0;

  return (
    <div>
      <div className="section-head">
        <h3>Approval inbox — {ROLE_LABEL[role]}</h3>
        <span className="muted">{myDemands.length + myPayments.length} awaiting you</span>
      </div>
      {empty ? (
        <p className="muted">Nothing awaiting {ROLE_LABEL[role]}. Switch the acting role to see other queues.</p>
      ) : (
        <table className="data-table" aria-label="Approval inbox">
          <thead><tr><th>Document</th><th>Action</th><th className="num">Amount</th><th>Power</th><th></th></tr></thead>
          <tbody>
            {myDemands.map((d) => {
              const ps = pendingStage(d.chainType, d.currentStage)!;
              const ok = roleHasPower(role, d.totalEstimated);
              return (
                <tr key={d.id}>
                  <td>{d.demandNo} (demand)</td>
                  <td>{ps.label}</td>
                  <td className="num">{formatMoney(d.totalEstimated)}</td>
                  <td>{ok ? <span className="pos">within power</span> : <span className="neg">exceeds power</span>}</td>
                  <td><button className="btn" onClick={() => actDemand(d)} disabled={!ok}>{ps.label}</button></td>
                </tr>
              );
            })}
            {myPayments.map((p) => {
              const ps = pendingStage(p.chainType, p.currentStage)!;
              const ok = roleHasPower(role, p.amount);
              return (
                <tr key={p.id}>
                  <td>{p.paymentNo} (payment)</td>
                  <td>{ps.label}</td>
                  <td className="num">{formatMoney(p.amount)}</td>
                  <td>{ok ? <span className="pos">within power</span> : <span className="neg">exceeds power</span>}</td>
                  <td><button className="btn" onClick={() => actPayment(p)} disabled={!ok}>{ps.label}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

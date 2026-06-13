import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { RAR_STATUS_LABEL } from '../domain/rar';
import { ROLE_LABEL } from '../domain/chains';
import { rarChain, pendingRarStage, isRarPaid } from '../domain/rarchain';
import { computeRarPayment, retentionRelease } from '../domain/billing';
import { AuditTrail } from './AuditTrail';
import type { Rar, Ipc, RarIpcLink, Subcontractor, Advance } from '../data/types';

export function RarDetailModal({ projectId, rar, onClose }: { projectId: string; rar: Rar; onClose: () => void }) {
  const { provider } = useData();
  const [links, setLinks] = useState<RarIpcLink[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [cur, setCur] = useState<Rar>(rar);
  const [role, setRole] = useState('pm');
  const [error, setError] = useState('');

  async function reload() {
    const [l, i, s, rs, adv] = await Promise.all([
      provider.listRarIpcLinks(projectId), provider.listIpcs(projectId),
      provider.listSubcontractors(projectId), provider.listRars(projectId), provider.listAdvances(projectId),
    ]);
    setLinks(l.filter((x) => x.rarId === rar.id));
    setIpcs(i);
    setSubs(s);
    setCur(rs.find((x) => x.rarNo === rar.rarNo) ?? rar);
    setAdvances(adv);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId, rar.id]);

  const ipcNo = (id: string) => ipcs.find((i) => i.id === id)?.ipcNo ?? id;
  const recovered = links.reduce((a, l) => a + l.amount, 0);
  const outstanding = Math.max(0, cur.netPayable - recovered);

  const kind = subs.find((s) => s.id === cur.subcontractorId)?.kind ?? 'sublet';
  const linkedIpcApproved = links.some((l) => {
    const i = ipcs.find((x) => x.id === l.ipcId);
    return i && (i.status === 'approved' || i.status === 'paid');
  });
  const pay = computeRarPayment(cur.gross, kind, linkedIpcApproved);
  const ret = retentionRelease(pay.retention);

  const chain = rarChain(!!cur.isFinal);
  const stageIdx = cur.chainStage ?? 0;
  const state = { isFinal: !!cur.isFinal, stageIndex: stageIdx };
  const pending = pendingRarStage(state);
  const paid = isRarPaid(state);

  const dueRecoveries = advances
    .filter((a) => a.direction === 'sub_disbursement' && a.subcontractorId === cur.subcontractorId)
    .reduce((s, a) => s + a.amount, 0);
  const recoveriesBlock = pending?.action === 'pay' && dueRecoveries > 0 && !cur.recoveriesNetted;

  async function toggleFinal(next: boolean) {
    setError('');
    await provider.setRarFinal(projectId, cur.rarNo, next);
    await reload();
  }
  async function toggleNetted(next: boolean) {
    await provider.setRarRecoveriesNetted(projectId, cur.rarNo, next);
    await reload();
  }
  async function advance() {
    setError('');
    try { await provider.advanceRarChain(projectId, cur.rarNo, role); await reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`RAR ${cur.rarNo} detail`} aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{cur.rarNo} · {cur.period}{cur.isFinal && <span className="muted"> · Final bill</span>}</h3>
          <span className={`status-pill st-${cur.status}`}>{RAR_STATUS_LABEL[cur.status]}</span>
        </div>
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">Gross</div><div className="kpi-value">{formatMoney(cur.gross)}</div></div>
          <div className="kpi"><div className="kpi-label">Net payable</div><div className="kpi-value">{formatMoney(cur.netPayable)}</div></div>
          <div className="kpi"><div className="kpi-label">Recovered</div><div className="kpi-value">{formatMoney(recovered)}</div></div>
          <div className="kpi"><div className="kpi-label">Outstanding</div><div className="kpi-value">{formatMoney(outstanding)}</div></div>
        </div>

        <h3>Payment computation <span className="muted small">· {kind} · IPC {linkedIpcApproved ? 'approved' : 'not approved'}</span></h3>
        <table className="data-table" aria-label="RAR payment computation">
          <tbody>
            <tr><td>Payable now ({pay.payableNowPct}%)</td><td className="num">{formatMoney(pay.payableNow)}</td></tr>
            <tr><td>Withheld ({pay.withheldPct}%) — released on IPC payment</td><td className="num">{formatMoney(pay.withheld)}</td></tr>
            <tr><td>Retention held</td><td className="num">{formatMoney(pay.retention)}</td></tr>
            <tr><td className="muted small">↳ released ½ with final bill</td><td className="num muted small">{formatMoney(ret.withFinalBill)}</td></tr>
            <tr><td className="muted small">↳ released ½ after DLP</td><td className="num muted small">{formatMoney(ret.afterDlp)}</td></tr>
          </tbody>
        </table>
        <p className="muted small">{pay.note}</p>

        <div className="section-head" style={{ marginTop: 14 }}>
          <h3>Billing approval chain</h3>
          <label className="small">
            <input type="checkbox" aria-label="Final bill" checked={!!cur.isFinal} onChange={(e) => toggleFinal(e.target.checked)} /> Final bill
          </label>
        </div>
        <ol className="wf-steps">
          {chain.map((s, i) => {
            const st = paid || i < stageIdx ? 'done' : i === stageIdx ? 'current' : 'todo';
            return (<li key={s.action} className={`wf-step ${st}`}><span className="wf-dot" aria-hidden>{st === 'done' ? '✓' : i + 1}</span><span>{s.label}</span></li>);
          })}
        </ol>
        {paid ? (
          <p className="pos small" role="status">RAR fully processed and paid.</p>
        ) : (
          <>
            {dueRecoveries > 0 && (
              <div className="create-row" aria-label="Recoveries gate">
                <span className={recoveriesBlock ? 'neg small' : 'muted small'}>
                  Due recoveries (advances): {formatMoney(dueRecoveries)}
                </span>
                <label className="small">
                  <input type="checkbox" aria-label="Recoveries netted" checked={!!cur.recoveriesNetted} onChange={(e) => toggleNetted(e.target.checked)} /> Recoveries netted
                </label>
              </div>
            )}
            <div className="create-row">
              <label className="small">Acting role{' '}
                <select aria-label="RAR acting role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {[...new Set(chain.map((s) => s.role))].map((r) => (<option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>))}
                </select>
              </label>
              <button className="btn" onClick={advance} disabled={!pending || pending.role !== role || recoveriesBlock}
                title={recoveriesBlock ? 'Net due recoveries before payment' : (pending && pending.role !== role ? `Awaiting ${ROLE_LABEL[pending.role] ?? pending.role}` : '')}>
                {pending ? pending.label : '—'}
              </button>
              {error && <span className="neg small">{error}</span>}
            </div>
          </>
        )}

        <h3 style={{ marginTop: 14 }}>Recovery against IPCs</h3>
        {links.length === 0 ? (
          <p className="muted small">No recoveries posted against client IPCs yet.</p>
        ) : (
          <table className="data-table" aria-label="RAR recovery links">
            <thead><tr><th>IPC</th><th className="num">Amount</th></tr></thead>
            <tbody>{links.map((l) => (<tr key={l.id}><td>{ipcNo(l.ipcId)}</td><td className="num">{formatMoney(l.amount)}</td></tr>))}</tbody>
            <tfoot><tr><td>Total recovered</td><td className="num">{formatMoney(recovered)}</td></tr></tfoot>
          </table>
        )}

        <div style={{ marginTop: 14 }}><AuditTrail entity="RAR" reference={cur.rarNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { RAR_STATUS_LABEL } from '../domain/rar';
import { ROLE_LABEL } from '../domain/chains';
import { rarChain, pendingRarStage, isRarPaid } from '../domain/rarchain';
import { computeRarPayment, retentionRelease } from '../domain/billing';
import { measurementSheet } from '../domain/measurement';
import { AuditTrail } from './AuditTrail';
import { Attachments } from './Attachments';
import type { Rar, Ipc, RarIpcLink, Subcontractor, Advance, BoqItem, Contract } from '../data/types';

export function RarDetailModal({ projectId, rar, onClose }: { projectId: string; rar: Rar; onClose: () => void }) {
  const { provider } = useData();
  const [links, setLinks] = useState<RarIpcLink[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [allRars, setAllRars] = useState<Rar[]>([]);
  const [cur, setCur] = useState<Rar>(rar);
  const [onlyBilled, setOnlyBilled] = useState(false);
  const [role, setRole] = useState('pm');
  const [error, setError] = useState('');

  async function reload() {
    const [l, i, s, rs, adv, b, ct] = await Promise.all([
      provider.listRarIpcLinks(projectId), provider.listIpcs(projectId),
      provider.listSubcontractors(projectId), provider.listRars(projectId), provider.listAdvances(projectId), provider.listBoq(projectId), provider.listContracts(projectId),
    ]);
    setLinks(l.filter((x) => x.rarId === rar.id));
    setIpcs(i);
    setSubs(s);
    setCur(rs.find((x) => x.rarNo === rar.rarNo) ?? rar);
    setAllRars(rs);
    setAdvances(adv);
    setBoq(b);
    setContracts(ct);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId, rar.id]);

  const ipcNo = (id: string) => ipcs.find((i) => i.id === id)?.ipcNo ?? id;
  const contract = contracts.find((c) => c.id === cur.contractId);
  const contractNo = contract?.contractNo;
  // Contractor scope = BOQ items in the contract's scope bills (else whole BOQ).
  const scopeBoq = useMemo(
    () => (contract && contract.scopeBills.length ? boq.filter((b) => contract.scopeBills.includes(b.billNo)) : boq),
    [boq, contract],
  );
  // Previous = RARs under the same contract (or same sub) with a lower seq.
  const peerRars = useMemo(
    () => allRars.filter((r) => (cur.contractId ? r.contractId === cur.contractId : r.subcontractorId === cur.subcontractorId)),
    [allRars, cur.contractId, cur.subcontractorId],
  );
  const sheet = useMemo(() => measurementSheet(cur, peerRars, scopeBoq, { onlyBilled }), [cur, peerRars, scopeBoq, onlyBilled]);
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
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
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

        {contractNo && <p className="muted small" style={{ margin: '0 0 8px' }}>Billed under contract <strong className="mono">{contractNo}</strong> · scope {contract?.scopeBills.length ? `bills ${contract.scopeBills.join(', ')}` : 'full BOQ'}</p>}
        <div className="section-head">
          <h3>Contractor BOQ — previous · this · cumulative</h3>
          <label className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyBilled} onChange={(e) => setOnlyBilled(e.target.checked)} aria-label="Only items billed in this RAR" />
            billed this RAR only
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table measure-table" aria-label="RAR measurement sheet">
            <thead>
              <tr>
                <th rowSpan={2}>Code</th><th rowSpan={2}>Description</th><th rowSpan={2} className="num">BOQ qty</th>
                <th colSpan={2} className="grp">Previous</th>
                <th colSpan={2} className="grp grp-now">This RAR</th>
                <th colSpan={2} className="grp">Cumulative</th>
                <th rowSpan={2} className="num">Balance</th><th rowSpan={2} className="num">%</th>
              </tr>
              <tr>
                <th className="num">Qty</th><th className="num">Amount</th>
                <th className="num grp-now">Qty</th><th className="num grp-now">Amount</th>
                <th className="num">Qty</th><th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.item.id} className={r.billedThis ? 'row-billed' : undefined}>
                  <td className="mono small">{r.item.code}</td>
                  <td>{r.item.description}<div className="muted small">Bill {r.item.billNo} · {r.item.billName}</div></td>
                  <td className="num small">{r.boqQty.toLocaleString('en-PK')} {r.item.unit}</td>
                  <td className="num small">{r.prevQty ? r.prevQty.toLocaleString('en-PK') : '—'}</td><td className="num small">{formatMoney(r.prevAmount)}</td>
                  <td className="num grp-now">{r.thisQty ? r.thisQty.toLocaleString('en-PK') : '—'}</td><td className="num grp-now">{formatMoney(r.thisAmount)}</td>
                  <td className="num small">{r.cumQty ? r.cumQty.toLocaleString('en-PK') : '—'}</td><td className="num">{formatMoney(r.cumAmount)}</td>
                  <td className="num small">{formatMoney(r.balanceAmount)}</td>
                  <td className="num small">{(r.pct * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Totals ({sheet.rows.length} items)</td>
                <td></td><td className="num">{formatMoney(sheet.prevGross)}</td>
                <td></td><td className="num grp-now">{formatMoney(sheet.thisGross)}</td>
                <td></td><td className="num">{formatMoney(sheet.cumGross)}</td>
                <td className="num">{formatMoney(sheet.boqTotal - sheet.cumGross)}</td>
                <td className="num">{sheet.boqTotal > 0 ? ((sheet.cumGross / sheet.boqTotal) * 100).toFixed(0) : '0'}%</td>
              </tr>
            </tfoot>
          </table>
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

        <div style={{ marginTop: 14 }}><Attachments projectId={projectId} entity="RAR" reference={cur.rarNo} /></div>
        <div style={{ marginTop: 14 }}><AuditTrail entity="RAR" reference={cur.rarNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

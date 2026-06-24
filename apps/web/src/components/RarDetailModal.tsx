import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { formatMoney } from '../domain/money';
import { RAR_STATUS_LABEL } from '../domain/rar';
import { ROLE_LABEL } from '../domain/chains';
import { rarChain, pendingRarStage, isRarPaid } from '../domain/rarchain';
import { measurementSheet } from '../domain/measurement';
import { materialRecovery } from '../domain/materialrecovery';
import { machineryRecovery } from '../domain/machineryRecovery';
import { rarSettlement, allowedRecoveryKinds, RAR_RECOVERY_LABEL, isLabourContractor } from '../domain/rarRecovery';
import { DEFAULT_COMMERCIAL_CONFIG } from '../domain/ipc';
import { useRole } from '../state/Role';
import { AuditTrail } from './AuditTrail';
import { Attachments } from './Attachments';
import type { Rar, RarRecovery, RarRecoveryKind, Subcontractor, Advance, BoqItem, Contract, CommercialConfig, MaterialIssue, MachineryUsage } from '../data/types';

const newId = () => `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function RarDetailModal({ projectId, rar, onClose }: { projectId: string; rar: Rar; onClose: () => void }) {
  const { provider } = useData();
  const { can } = useRole();
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [machinery, setMachinery] = useState<MachineryUsage[]>([]);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [allRars, setAllRars] = useState<Rar[]>([]);
  const [cfg, setCfg] = useState<CommercialConfig>(DEFAULT_COMMERCIAL_CONFIG);
  const [cur, setCur] = useState<Rar>(rar);
  const [onlyBilled, setOnlyBilled] = useState(false);
  const [role, setRole] = useState('pm');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<RarRecovery[]>([]);
  const [recDirty, setRecDirty] = useState(false);

  async function reload() {
    const [s, rs, adv, b, ct, c, mi, mu] = await Promise.all([
      provider.listSubcontractors(projectId), provider.listRars(projectId), provider.listAdvances(projectId),
      provider.listBoq(projectId), provider.listContracts(projectId), provider.getCommercialConfig(projectId), provider.listMaterialIssues(projectId), provider.listMachineryUsage(projectId),
    ]);
    const mine = rs.find((x) => x.rarNo === rar.rarNo) ?? rar;
    setSubs(s); setAllRars(rs); setAdvances(adv); setBoq(b); setContracts(ct); setCfg(c); setIssues(mi); setMachinery(mu);
    setCur(mine); setDraft(mine.recoveries ? mine.recoveries.map((r) => ({ ...r })) : []); setRecDirty(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId, rar.id]);

  const sub = subs.find((s) => s.id === cur.subcontractorId);
  const contract = contracts.find((c) => c.id === cur.contractId);
  const contractNo = contract?.contractNo;
  const editable = can('manager_contracts') || can('pm');
  const labour = isLabourContractor(sub);
  const kinds = allowedRecoveryKinds(sub);
  // Outstanding NLC material issued to this contractor (issued value − recovered).
  const materialDue = labour ? 0 : Math.max(0, materialRecovery(issues).find((r) => r.contractorId === cur.subcontractorId)?.balance ?? 0);
  const alreadyMaterial = draft.some((r) => r.kind === 'material');
  function recoverMaterial() {
    setDraft((d) => [...d, { id: newId(), kind: 'material', description: 'NLC material issued — balance to recover', amount: Math.round(materialDue) }]);
    setRecDirty(true);
  }
  const machineryDue = labour ? 0 : Math.max(0, machineryRecovery(machinery).find((r) => r.contractorId === cur.subcontractorId)?.balance ?? 0);
  const alreadyMachinery = draft.some((r) => r.kind === 'machinery');
  function recoverMachinery() {
    setDraft((d) => [...d, { id: newId(), kind: 'machinery', description: 'NLC machinery usage — balance to recover', amount: Math.round(machineryDue) }]);
    setRecDirty(true);
  }

  const scopeBoq = useMemo(
    () => (contract && contract.scopeBills.length ? boq.filter((b) => contract.scopeBills.includes(b.billNo)) : boq),
    [boq, contract],
  );
  const peerRars = useMemo(
    () => allRars.filter((r) => (cur.contractId ? r.contractId === cur.contractId : r.subcontractorId === cur.subcontractorId)),
    [allRars, cur.contractId, cur.subcontractorId],
  );
  const sheet = useMemo(() => measurementSheet(cur, peerRars, scopeBoq, { onlyBilled }), [cur, peerRars, scopeBoq, onlyBilled]);

  const retentionPct = Math.min(5, contract?.retentionPct ?? 5);
  // Live settlement uses the draft recoveries so edits preview before saving.
  const settle = rarSettlement({ gross: cur.gross, retentionPct, cfg, recoveries: draft });

  const chain = rarChain(!!cur.isFinal);
  const stageIdx = cur.chainStage ?? 0;
  const state = { isFinal: !!cur.isFinal, stageIndex: stageIdx };
  const pending = pendingRarStage(state);
  const paid = isRarPaid(state);

  const dueAdvances = advances
    .filter((a) => a.direction === 'sub_disbursement' && a.subcontractorId === cur.subcontractorId)
    .reduce((s, a) => s + a.amount, 0);
  const advanceBlock = pending?.action === 'pay' && dueAdvances > 0 && !cur.recoveriesNetted;

  async function toggleFinal(next: boolean) { setError(''); await provider.setRarFinal(projectId, cur.rarNo, next); await reload(); }
  async function toggleNetted(next: boolean) { await provider.setRarRecoveriesNetted(projectId, cur.rarNo, next); await reload(); }
  async function advance() {
    setError('');
    try { await provider.advanceRarChain(projectId, cur.rarNo, role); await reload(); }
    catch (e) { setError((e as Error).message); }
  }
  function addRecovery() {
    setDraft((d) => [...d, { id: newId(), kind: kinds[0], description: '', amount: 0 }]); setRecDirty(true);
  }
  function patchRecovery(id: string, patch: Partial<RarRecovery>) {
    setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r))); setRecDirty(true);
  }
  function removeRecovery(id: string) { setDraft((d) => d.filter((r) => r.id !== id)); setRecDirty(true); }
  async function saveRecoveries() {
    await provider.setRarRecoveries(projectId, cur.rarNo, draft.filter((r) => r.amount > 0 || r.description.trim()));
    await reload();
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
          <div className="kpi"><div className="kpi-label">Recoveries</div><div className="kpi-value">{formatMoney(settle.recoveryTotal)}</div></div>
          <div className="kpi"><div className="kpi-label">Net payable</div><div className="kpi-value">{formatMoney(settle.net)}</div></div>
        </div>

        {contractNo && <p className="muted small" style={{ margin: '0 0 8px' }}>Billed under contract <strong className="mono">{contractNo}</strong> · {sub?.name ?? ''} · {labour ? 'labour contract' : 'sublet contract'} · scope {contract?.scopeBills.length ? `bills ${contract.scopeBills.join(', ')}` : 'full BOQ'}</p>}

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

        <div className="section-head" style={{ marginTop: 14 }}>
          <h3>Recoveries</h3>
          {editable && <button className="btn-ghost btn-mini" onClick={addRecovery} aria-label="Add recovery">+ Add recovery</button>}
        </div>
        {labour && <p className="muted small" style={{ marginTop: 0 }}>Labour contract — only "other" recoveries apply (material and machinery are not recovered from labour-only contracts).</p>}
        {!labour && materialDue > 0 && !alreadyMaterial && editable && (
          <p className="muted small" style={{ marginTop: 0 }}>
            Outstanding NLC material issued to this contractor: <strong>{formatMoney(materialDue)}</strong>.{' '}
            <button className="link-btn" aria-label="Recover NLC material" onClick={recoverMaterial}>Recover this</button>
          </p>
        )}
        {!labour && machineryDue > 0 && !alreadyMachinery && editable && (
          <p className="muted small" style={{ marginTop: 0 }}>
            Outstanding NLC machinery usage by this contractor: <strong>{formatMoney(machineryDue)}</strong>.{' '}
            <button className="link-btn" aria-label="Recover NLC machinery" onClick={recoverMachinery}>Recover this</button>
          </p>
        )}
        {draft.length === 0 ? (
          <p className="muted small">No recoveries on this RAR.</p>
        ) : (
          <table className="data-table" aria-label="RAR recoveries">
            <thead><tr><th>Type</th><th>Description</th><th className="num">Amount</th>{editable && <th></th>}</tr></thead>
            <tbody>
              {draft.map((r) => (
                <tr key={r.id}>
                  <td>
                    {editable ? (
                      <select aria-label={`Recovery type ${r.id}`} value={r.kind} onChange={(e) => patchRecovery(r.id, { kind: e.target.value as RarRecoveryKind })}>
                        {kinds.map((k) => <option key={k} value={k}>{RAR_RECOVERY_LABEL[k]}</option>)}
                      </select>
                    ) : RAR_RECOVERY_LABEL[r.kind]}
                  </td>
                  <td>
                    {editable ? (
                      <input aria-label={`Recovery description ${r.id}`} value={r.description} placeholder="describe…"
                        onChange={(e) => patchRecovery(r.id, { description: e.target.value })} style={{ width: '100%' }} />
                    ) : r.description}
                  </td>
                  <td className="num">
                    {editable ? (
                      <input type="number" aria-label={`Recovery amount ${r.id}`} value={r.amount} min={0} style={{ width: 130 }}
                        onChange={(e) => patchRecovery(r.id, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                    ) : formatMoney(r.amount)}
                  </td>
                  {editable && <td><button className="btn-ghost btn-mini" aria-label={`Remove recovery ${r.id}`} onClick={() => removeRecovery(r.id)}>✕</button></td>}
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2}>Total recoveries</td><td className="num">{formatMoney(settle.recoveryTotal)}</td>{editable && <td></td>}</tr></tfoot>
          </table>
        )}
        {editable && recDirty && <button className="btn" onClick={saveRecoveries} style={{ marginTop: 8 }}>Save recoveries</button>}

        <h3 style={{ marginTop: 14 }}>Settlement</h3>
        <table className="data-table" aria-label="RAR settlement">
          <tbody>
            <tr><td>Gross (this RAR)</td><td className="num">{formatMoney(settle.gross)}</td></tr>
            <tr><td>Less retention @ {settle.retentionPct}%</td><td className="num neg">- {formatMoney(settle.retention)}</td></tr>
            <tr><td>Less income tax @ {settle.incomeTaxPct}%</td><td className="num neg">- {formatMoney(settle.incomeTax)}</td></tr>
            {settle.gstPct > 0 && <tr><td>Less GST / stamp @ {settle.gstPct}%</td><td className="num neg">- {formatMoney(settle.gst)}</td></tr>}
            {settle.materialRecovery > 0 && <tr><td>Less NLC material consumed</td><td className="num neg">- {formatMoney(settle.materialRecovery)}</td></tr>}
            {settle.machineryRecovery > 0 && <tr><td>Less NLC machinery usage</td><td className="num neg">- {formatMoney(settle.machineryRecovery)}</td></tr>}
            {settle.otherRecovery > 0 && <tr><td>Less other recovery</td><td className="num neg">- {formatMoney(settle.otherRecovery)}</td></tr>}
          </tbody>
          <tfoot><tr><td>Net payable to contractor</td><td className="num">{formatMoney(settle.net)}</td></tr></tfoot>
        </table>

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
            {dueAdvances > 0 && (
              <div className="create-row" aria-label="Advance recovery gate">
                <span className={advanceBlock ? 'neg small' : 'muted small'}>Outstanding contractor advances: {formatMoney(dueAdvances)}</span>
                <label className="small">
                  <input type="checkbox" aria-label="Advances netted" checked={!!cur.recoveriesNetted} onChange={(e) => toggleNetted(e.target.checked)} /> Advances netted
                </label>
              </div>
            )}
            <div className="create-row">
              <label className="small">Acting role{' '}
                <select aria-label="RAR acting role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {[...new Set(chain.map((s) => s.role))].map((r) => (<option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>))}
                </select>
              </label>
              <button className="btn" onClick={advance} disabled={!pending || pending.role !== role || advanceBlock}
                title={advanceBlock ? 'Net outstanding advances before payment' : (pending && pending.role !== role ? `Awaiting ${ROLE_LABEL[pending.role] ?? pending.role}` : '')}>
                {pending ? pending.label : '—'}
              </button>
              {error && <span className="neg small">{error}</span>}
            </div>
          </>
        )}

        <div style={{ marginTop: 14 }}><Attachments projectId={projectId} entity="RAR" reference={cur.rarNo} /></div>
        <div style={{ marginTop: 14 }}><AuditTrail entity="RAR" reference={cur.rarNo} /></div>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

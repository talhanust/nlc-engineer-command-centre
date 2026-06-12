import { Fragment, useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { ROLE_LABEL } from '../../domain/chains';
import {
  EXECUTION_LABEL, allocatedQty, remainingQty, isOverAllocated, itemMargin,
  boqMargin, contractSummaries, requiredAuthority, canApproveContract,
} from '../../domain/allocations';
import { canAwardByPec, pecLimitLabel } from '../../domain/pec';
import type { Allocation, BoqItem, ContractApproval, ExecutionType, Subcontractor } from '../../data/types';

const EXEC_TYPES: ExecutionType[] = ['labor', 'sublet', 'nlc_direct'];

export function DistributionPlanner({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [contracts, setContracts] = useState<ContractApproval[]>([]);
  const [role, setRole] = useState('pd');
  const [openItem, setOpenItem] = useState<string | null>(null);

  async function load() {
    const [b, s, a, c] = await Promise.all([
      provider.listBoq(projectId), provider.listSubcontractors(projectId),
      provider.listAllocations(projectId), provider.listContractApprovals(projectId),
    ]);
    setItems(b); setSubs(s); setAllocs(a); setContracts(c);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = (id?: string) => subs.find((s) => s.id === id)?.name ?? '—';
  const margin = boqMargin(items, allocs);
  const summaries = contractSummaries(items, allocs);
  const statusOf = (key: string) => contracts.find((c) => c.key === key)?.status ?? 'draft';

  async function addLine(item: BoqItem) {
    const rem = remainingQty(item, allocs);
    const next = await provider.upsertAllocation(projectId, {
      boqItemId: item.id, executionType: 'sublet', contractorId: subs[0]?.id, qty: Math.max(0, rem), rate: item.rate,
    });
    setAllocs([...next]);
  }
  async function patch(a: Allocation, p: Partial<Allocation>) {
    const next = await provider.upsertAllocation(projectId, { ...a, ...p });
    setAllocs([...next]);
  }
  async function removeLine(id: string) {
    setAllocs([...(await provider.deleteAllocation(projectId, id))]);
  }
  async function approve(key: string, type: ExecutionType, value: number) {
    const contractorId = key.split(':')[1];
    const sub = subs.find((s) => s.id === contractorId);
    if (!canApproveContract(role, type, value)) return;
    if (!canAwardByPec(sub?.pecCategory, value)) return;
    setContracts([...(await provider.approveContract(projectId, key, role, value))]);
  }

  return (
    <div>
      <div className="section-head">
        <h3>Distribution planner</h3>
        <span className="muted">Gross margin {formatMoney(margin.margin)} · {margin.marginPct}%</span>
      </div>
      <p className="muted small">
        Distribute each BOQ item's quantity across labor / sublet contractors (with rates) or NLC-direct.
        Distributed quantity may not exceed the BOQ quantity. Margin = (BOQ rate − contractor rate) × qty.
      </p>

      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <table className="data-table" aria-label="Distribution planner">
          <thead>
            <tr><th>Code</th><th>Description</th><th className="num">BOQ qty</th><th className="num">Allocated</th><th className="num">Remaining</th><th className="num">Item margin</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const lines = allocs.filter((a) => a.boqItemId === item.id);
              const over = isOverAllocated(item, allocs);
              const open = openItem === item.id;
              return (
                <Fragment key={item.id}>
                  <tr className={over ? 'row-flag' : ''}>
                    <td>{item.code}</td>
                    <td>{item.description}</td>
                    <td className="num">{item.qty}</td>
                    <td className="num">{allocatedQty(allocs, item.id)}</td>
                    <td className={`num ${over ? 'neg' : ''}`}>{remainingQty(item, allocs)}{over ? ' ⚠' : ''}</td>
                    <td className="num">{formatMoney(itemMargin(item, allocs))}</td>
                    <td><button className="btn-ghost" aria-label={`Allocate ${item.code}`} onClick={() => setOpenItem(open ? null : item.id)}>{open ? '▾' : '▸'}</button></td>
                  </tr>
                  {open && (
                    <tr key={`${item.id}-detail`}>
                      <td colSpan={7}>
                        <table className="data-table" aria-label={`Allocations for ${item.code}`}>
                          <thead><tr><th>Execution</th><th>Contractor</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Value</th><th></th></tr></thead>
                          <tbody>
                            {lines.map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <select aria-label={`Type ${a.id}`} value={a.executionType} onChange={(e) => patch(a, { executionType: e.target.value as ExecutionType })}>
                                    {EXEC_TYPES.map((t) => (<option key={t} value={t}>{EXECUTION_LABEL[t]}</option>))}
                                  </select>
                                </td>
                                <td>
                                  {a.executionType === 'nlc_direct' ? <span className="muted">—</span> : (
                                    <select aria-label={`Contractor ${a.id}`} value={a.contractorId ?? ''} onChange={(e) => patch(a, { contractorId: e.target.value })}>
                                      {subs.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                    </select>
                                  )}
                                </td>
                                <td className="num"><input className="qty-input" aria-label={`Qty ${a.id}`} defaultValue={a.qty} onBlur={(e) => patch(a, { qty: Number(e.target.value) || 0 })} /></td>
                                <td className="num"><input className="qty-input" aria-label={`Rate ${a.id}`} defaultValue={a.rate} onBlur={(e) => patch(a, { rate: Number(e.target.value) || 0 })} /></td>
                                <td className="num">{formatMoney(a.rate * a.qty)}</td>
                                <td><button className="btn-ghost" aria-label={`Remove ${a.id}`} onClick={() => removeLine(a.id)}>✕</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <button className="btn-ghost" style={{ marginTop: 6 }} onClick={() => addLine(item)}>+ Add allocation</button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {summaries.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="section-head">
            <h3>Contracts</h3>
            <label className="small">Acting authority{' '}
              <select aria-label="Contract acting role" value={role} onChange={(e) => setRole(e.target.value)}>
                {['pd', 'comd_engrs', 'dg', 'oic'].map((r) => (<option key={r} value={r}>{ROLE_LABEL[r]}</option>))}
              </select>
            </label>
          </div>
          <table className="data-table" aria-label="Contracts">
            <thead><tr><th>Type</th><th>Contractor</th><th className="num">Value</th><th className="num">Margin</th><th>Competent Authority</th><th>PEC</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {summaries.map((c) => {
                const status = statusOf(c.key);
                const reqd = requiredAuthority(c.executionType, c.value);
                const sub = subs.find((s) => s.id === c.contractorId);
                const pecOk = canAwardByPec(sub?.pecCategory, c.value);
                const allowed = canApproveContract(role, c.executionType, c.value) && pecOk;
                return (
                  <tr key={c.key} className={!pecOk ? 'row-flag' : ''}>
                    <td>{EXECUTION_LABEL[c.executionType]}</td>
                    <td>{subName(c.contractorId)}</td>
                    <td className="num">{formatMoney(c.value)}</td>
                    <td className="num">{formatMoney(c.margin)}</td>
                    <td>{ROLE_LABEL[reqd]}</td>
                    <td className={pecOk ? '' : 'neg'}>{sub?.pecCategory ?? '—'} {pecOk ? '' : `⚠ ${pecLimitLabel(sub?.pecCategory)}`}</td>
                    <td>{status === 'locked' ? <span className="status-pill st-paid">Locked</span> : <span className="status-pill st-vetted">Draft</span>}</td>
                    <td>
                      {status === 'locked' ? <span className="muted small">approved</span> : (
                        <button className="btn" disabled={!allowed} aria-label={`Approve ${c.key}`}
                          title={!pecOk ? 'Exceeds contractor PEC category' : (allowed ? '' : `Requires ${ROLE_LABEL[reqd]}`)} onClick={() => approve(c.key, c.executionType, c.value)}>
                          Approve &amp; lock
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

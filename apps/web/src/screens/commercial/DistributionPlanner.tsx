import { Fragment, useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { downloadWorkbook } from '../../components/xlsxExport';
import { itemLocks } from '../../domain/contractLocks';
import { formatMoney } from '../../domain/money';
import { ROLE_LABEL } from '../../domain/chains';
import {
  EXECUTION_LABEL, allocatedQty, remainingQty, isOverAllocated,
  boqMargin, contractSummaries, contractCoverage, requiredAuthority, canApproveContract,
  itemScCost, itemLoCost, itemModeLabel, itemMarginPct, planTotals,
} from '../../domain/allocations';
import { canAwardByPec, pecLimitLabel } from '../../domain/pec';
import type { Allocation, BoqItem, Contract, ContractApproval, ExecutionType, Subcontractor } from '../../data/types';

const EXEC_TYPES: ExecutionType[] = ['labor', 'sublet', 'nlc_direct'];
const num = (n: number) => n.toLocaleString('en-PK');
const money = (n: number) => (n > 0 ? formatMoney(n) : '—');
const MODE_CLASS: Record<string, string> = { Unassigned: 'mode-unassigned', Self: 'mode-self', Sublet: 'mode-sublet', Labor: 'mode-labor', Mixed: 'mode-mixed' };

export function DistributionPlanner({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [contracts, setContracts] = useState<ContractApproval[]>([]);
  const [regContracts, setRegContracts] = useState<Contract[]>([]);
  const [role, setRole] = useState('pd');
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bill, setBill] = useState('all');

  async function load() {
    const [b, s, a, c, rc] = await Promise.all([
      provider.listBoq(projectId), provider.listSubcontractors(projectId),
      provider.listAllocations(projectId), provider.listContractApprovals(projectId), provider.listContracts(projectId),
    ]);
    setItems(b); setSubs(s); setAllocs(a); setContracts(c); setRegContracts(rc);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = (id?: string) => subs.find((s) => s.id === id)?.name ?? '—';
  const contractForSub = (id?: string) => regContracts.find((c) => c.subcontractorId === id);
  const margin = boqMargin(items, allocs);
  const summaries = contractSummaries(items, allocs);
  const coverage = contractCoverage(regContracts, items, allocs);
  // Contract-committed (locked) quantity per item, from sublet/labor contracts.
  const locks = useMemo(() => itemLocks(items, regContracts), [items, regContracts]);
  const statusOf = (key: string) => contracts.find((c) => c.key === key)?.status ?? 'draft';

  const billNos = useMemo(() => Array.from(new Set(items.map((i) => i.billNo))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [items]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((it) => (bill === 'all' || it.billNo === bill) && (!s || `${it.code} ${it.description}`.toLowerCase().includes(s)));
  }, [items, search, bill]);
  const totals = useMemo(() => planTotals(filtered, allocs), [filtered, allocs]);

  async function addLine(item: BoqItem) {
    const rem = remainingQty(item, allocs);
    const next = await provider.upsertAllocation(projectId, {
      boqItemId: item.id, executionType: 'sublet', contractorId: subs[0]?.id, qty: Math.max(0, rem), rate: item.rate,
    });
    setAllocs([...next]);
  }
  async function patch(a: Allocation, p: Partial<Allocation>) {
    // Over-allocation guard: an item's allocations may never exceed its BOQ qty.
    let next2 = { ...a, ...p };
    if (p.qty !== undefined) {
      const item = items.find((it) => it.id === a.boqItemId);
      if (item) {
        const others = allocs.filter((x) => x.boqItemId === a.boqItemId && x.id !== a.id).reduce((s, x) => s + x.qty, 0);
        const maxQty = +(item.qty - others).toFixed(4);
        if (p.qty > maxQty + 1e-6) {
          next2 = { ...next2, qty: Math.max(0, maxQty) };
          toast({ message: `Capped at ${num(maxQty)} ${item.unit} — only that much of ${item.code} is left to award`, kind: 'error' });
        }
      }
    }
    const next = await provider.upsertAllocation(projectId, next2);
    setAllocs([...next]);
  }
  async function removeLine(id: string) {
    setAllocs([...(await provider.deleteAllocation(projectId, id))]);
  }
  async function markFilteredSelf() {
    for (const item of filtered) {
      for (const a of allocs.filter((x) => x.boqItemId === item.id)) await provider.deleteAllocation(projectId, a.id);
      await provider.upsertAllocation(projectId, { boqItemId: item.id, executionType: 'nlc_direct', qty: item.qty, rate: 0 });
    }
    await load();
    toast({ message: `Marked ${filtered.length} item${filtered.length === 1 ? '' : 's'} as 100% self`, kind: 'success' });
  }
  function exportPlan() {
    void downloadWorkbook([{ name: 'Distribution', aoa: [
      ['Code', 'Description', 'Unit', 'Contract Qty', 'Rate', 'Amount', 'Mode', 'Allocated %', 'S/C Cost', 'L/O Cost', 'Margin %'],
      ...filtered.map((it) => [it.code, it.description, it.unit, it.qty, it.rate, Math.round(it.amount), itemModeLabel(it, allocs),
        Math.round((allocatedQty(allocs, it.id) / (it.qty || 1)) * 100), Math.round(itemScCost(it, allocs)), Math.round(itemLoCost(it, allocs)), itemMarginPct(it, allocs)]),
    ] }], `${projectId}-distribution.xlsx`);
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
        <div>
          <h3>Distribution Planner</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Allocate each BOQ item across Self-Execution and Subcontractors. Plans are soft — execution can deviate but will be flagged.</p>
        </div>
        <span className="muted">Gross margin {formatMoney(margin.margin)} · {margin.marginPct}%</span>
      </div>

      {items.length === 0 ? (
        <p className="muted">Import a BOQ first.</p>
      ) : (
        <>
          <div className="filter-bar card" role="group" aria-label="Planner filters">
            <input className="input" aria-label="Search items" placeholder="Search description, code…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Bill filter" value={bill} onChange={(e) => setBill(e.target.value)}>
              <option value="all">All bills</option>
              {billNos.map((b) => <option key={b} value={b}>Bill {b}</option>)}
            </select>
            <span className="muted small">{filtered.length} of {items.length} items</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
              <button className="btn-ghost btn-mini" onClick={markFilteredSelf} title="Set every filtered item to 100% NLC self-execution">⚡ Mark filtered 100% Self</button>
              <button className="btn-ghost btn-mini" onClick={exportPlan}>Export Plan (XLSX)</button>
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table plan-table" aria-label="Distribution planner">
              <thead>
                <tr>
                  <th>Code</th><th>Description</th><th>Unit</th>
                  <th className="num">Contract qty</th><th className="num">Rate</th><th className="num">Amount</th>
                  <th className="num" title="Quantity committed to sublet/labor contracts">Locked</th>
                  <th className="num" title="Quantity not yet committed to any contract">Unallocated</th>
                  <th>Mode</th><th>Allocation</th>
                  <th className="num">S/C cost</th><th className="num">L/O cost</th><th className="num">Margin %</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const lines = allocs.filter((a) => a.boqItemId === item.id);
                  const lock = locks.get(item.id);
                  const over = isOverAllocated(item, allocs);
                  const open = openItem === item.id;
                  const pct = item.qty > 0 ? Math.min(1, allocatedQty(allocs, item.id) / item.qty) : 0;
                  const mode = itemModeLabel(item, allocs);
                  const mpct = itemMarginPct(item, allocs);
                  return (
                    <Fragment key={item.id}>
                      <tr className={over ? 'row-flag' : ''}>
                        <td className="mono small">{item.code}</td>
                        <td>{item.description}</td>
                        <td className="small">{item.unit}</td>
                        <td className="num">{num(item.qty)}</td>
                        <td className="num">{num(item.rate)}</td>
                        <td className="num">{formatMoney(item.amount)}</td>
                        <td className={`num small ${lock && lock.overCommitted ? 'neg' : ''}`}
                          title={lock && lock.holders.length ? lock.holders.map((h) => `${h.contractNo}: ${h.qty.toLocaleString('en-PK')}`).join('\n') : 'Not committed to any contract'}>
                          {lock && lock.lockedQty > 0 ? `${lock.lockedQty.toLocaleString('en-PK')}${lock.overCommitted ? ' ⚠' : ''}` : '—'}
                        </td>
                        <td className="num small">{lock ? lock.unallocatedQty.toLocaleString('en-PK') : num(item.qty)}</td>
                        <td><span className={`mode-badge ${MODE_CLASS[mode]}`}>{mode === 'Unassigned' ? '⚠ ' : ''}{mode}</span></td>
                        <td>
                          <div className="boq-status" title={`${Math.round(pct * 100)}% allocated`}>
                            <span className="boq-prog" aria-hidden><span className="boq-prog-fill" style={{ width: `${Math.round(pct * 100)}%`, background: over ? 'var(--rag-red)' : undefined }} /></span>
                            <span className="boq-pct mono small">{Math.round(pct * 100)}%</span>
                          </div>
                        </td>
                        <td className="num">{money(itemScCost(item, allocs))}</td>
                        <td className="num">{money(itemLoCost(item, allocs))}</td>
                        <td className={`num ${mpct < 0 ? 'neg' : ''}`}>{mode === 'Unassigned' ? '—' : `${mpct}%`}</td>
                        <td><button className="btn-ghost" aria-label={`Plan ${item.code}`} onClick={() => setOpenItem(open ? null : item.id)}>{open ? '▾ Close' : 'Plan'}</button></td>
                      </tr>
                      {open && (
                        <tr key={`${item.id}-detail`}>
                          <td colSpan={14}>
                            <table className="data-table" aria-label={`Allocations for ${item.code}`}>
                              <thead><tr><th>Execution</th><th>Contractor</th><th>Contract</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Value</th><th></th></tr></thead>
                              <tbody>
                                {lines.map((a) => {
                                  const ctr = a.executionType === 'nlc_direct' ? undefined : contractForSub(a.contractorId);
                                  return (
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
                                    <td className="small">{a.executionType === 'nlc_direct' ? <span className="muted">NLC self</span> : ctr ? <span className="mono">{ctr.contractNo}</span> : <span className="muted" title="No awarded contract for this contractor yet">no contract</span>}</td>
                                    <td className="num"><input key={`q-${a.id}-${a.qty}`} className="qty-input" aria-label={`Qty ${a.id}`} defaultValue={a.qty} onBlur={(e) => patch(a, { qty: Number(e.target.value) || 0 })} /></td>
                                    <td className="num"><input className="qty-input" aria-label={`Rate ${a.id}`} defaultValue={a.rate} onBlur={(e) => patch(a, { rate: Number(e.target.value) || 0 })} /></td>
                                    <td className="num">{formatMoney(a.rate * a.qty)}</td>
                                    <td><button className="btn-ghost" aria-label={`Remove ${a.id}`} onClick={() => removeLine(a.id)}>✕</button></td>
                                  </tr>
                                  );
                                })}
                                <tr className="alloc-unassigned">
                                  <td className="muted small">Unassigned</td><td></td><td></td>
                                  <td className="num small">{num(Math.max(0, remainingQty(item, allocs)))} {item.unit}</td>
                                  <td></td>
                                  <td className="num small">{money(Math.max(0, remainingQty(item, allocs)) * item.rate)}</td>
                                  <td></td>
                                </tr>
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
              <tfoot>
                <tr className="boq-total-row">
                  <td colSpan={5}><strong>Totals · {filtered.length} items</strong></td>
                  <td className="num"><strong>{formatMoney(totals.amount)}</strong></td>
                  <td /><td />
                  <td className="num"><strong>{money(totals.scCost)}</strong></td>
                  <td className="num"><strong>{money(totals.loCost)}</strong></td>
                  <td className="num"><strong>{totals.marginPct}%</strong></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {(summaries.length > 0 || coverage.length > 0) && (
        <div style={{ marginTop: 20 }}>
          <div className="section-head">
            <h3>Contracts</h3>
            <label className="small">Acting authority{' '}
              <select aria-label="Contract acting role" value={role} onChange={(e) => setRole(e.target.value)}>
                {['pd', 'comd_engrs', 'dg', 'oic'].map((r) => (<option key={r} value={r}>{ROLE_LABEL[r]}</option>))}
              </select>
            </label>
          </div>
          {coverage.length > 0 && (
          <table className="data-table" aria-label="Contract scope coverage" style={{ marginBottom: 16 }}>
            <thead><tr><th>Contract</th><th>Contractor</th><th className="num">Scope value</th><th className="num">Allocated</th><th className="num">Unawarded</th><th className="num">Coverage</th></tr></thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.contractId} className={c.unawarded > 1 ? 'row-flag' : ''}>
                  <td className="mono small">{c.contractNo}</td>
                  <td>{subName(c.subcontractorId)}</td>
                  <td className="num">{formatMoney(c.scopeValue)}</td>
                  <td className="num">{formatMoney(c.allocatedValue)}</td>
                  <td className={`num${c.unawarded > 1 ? ' neg' : ''}`}>{formatMoney(c.unawarded)}</td>
                  <td className="num">{(c.pct * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          {summaries.length > 0 && (
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
          )}
        </div>
      )}
    </div>
  );
}

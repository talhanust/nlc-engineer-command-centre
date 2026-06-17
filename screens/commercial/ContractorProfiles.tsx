import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { PEC_CODES, pecLimitLabel } from '../../domain/pec';
import { contractSummaries } from '../../domain/allocations';
import type { Subcontractor, Allocation, BoqItem, Rar, Advance } from '../../data/types';

export function ContractorProfiles({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [items, setItems] = useState<BoqItem[]>([]);
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');

  async function load() {
    const [s, b, a, r, adv] = await Promise.all([
      provider.listSubcontractors(projectId), provider.listBoq(projectId),
      provider.listAllocations(projectId), provider.listRars(projectId), provider.listAdvances(projectId),
    ]);
    setSubs(s); setItems(b); setAllocs(a); setRars(r); setAdvances(adv);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const summaries = contractSummaries(items, allocs);

  function standing(sub: Subcontractor) {
    const awarded = summaries.filter((c) => c.contractorId === sub.id);
    const awardedValue = awarded.reduce((s, c) => s + c.value, 0);
    const subRars = rars.filter((r) => r.subcontractorId === sub.id);
    const executed = subRars.reduce((s, r) => s + r.gross, 0);
    const paid = subRars.filter((r) => r.status === 'paid').reduce((s, r) => s + r.netPayable, 0);
    const liabilities = Math.max(0, executed - paid);
    const subAdvances = advances.filter((a) => a.subcontractorId === sub.id).reduce((s, a) => s + a.amount, 0);
    return { contracts: awarded.length, awardedValue, executed, paid, liabilities, advances: subAdvances };
  }

  async function add() {
    if (!name.trim()) return;
    await provider.addSubcontractor(projectId, { name: name.trim(), trade: trade.trim() });
    setName(''); setTrade(''); await load();
  }
  async function patch(id: string, p: Partial<Subcontractor>) {
    await provider.updateSubcontractor(projectId, id, p);
    await load();
  }

  return (
    <div>
      <div className="section-head"><h3>Contractor profiles</h3><span className="muted">{subs.length} contractors</span></div>
      <p className="muted small">Labor / sublet contractor profiles. Work cannot be awarded beyond a contractor's PEC category (enforced in the distribution planner).</p>

      <div className="card create-row">
        <input aria-label="Contractor name" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Contractor trade" placeholder="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} />
        <button className="btn" onClick={add}>Add contractor</button>
      </div>

      {subs.map((s) => {
        const st = standing(s);
        const isOpen = open === s.id;
        return (
          <div className="card" key={s.id} style={{ marginTop: 10 }}>
            <div className="section-head">
              <h3>{s.name} <span className="muted small">· {s.kind ?? 'unset'} · PEC {s.pecCategory ?? '—'} ({pecLimitLabel(s.pecCategory)})</span></h3>
              <button className="btn-ghost" aria-label={`Edit ${s.name}`} onClick={() => setOpen(isOpen ? null : s.id)}>{isOpen ? 'Close' : 'Edit profile'}</button>
            </div>

            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-label">Contracts</div><div className="kpi-value">{st.contracts}</div></div>
              <div className="kpi"><div className="kpi-label">Awarded</div><div className="kpi-value">{formatMoney(st.awardedValue)}</div></div>
              <div className="kpi"><div className="kpi-label">Executed (RAR)</div><div className="kpi-value">{formatMoney(st.executed)}</div></div>
              <div className="kpi"><div className="kpi-label">Paid</div><div className="kpi-value">{formatMoney(st.paid)}</div></div>
              <div className="kpi"><div className="kpi-label">Liabilities</div><div className="kpi-value">{formatMoney(st.liabilities)}</div></div>
              <div className="kpi"><div className="kpi-label">Advances</div><div className="kpi-value">{formatMoney(st.advances)}</div></div>
              <div className="kpi"><div className="kpi-label">Perf. security</div><div className="kpi-value">{formatMoney(s.performanceSecurity ?? 0)}</div></div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10 }}>
                <div className="create-row">
                  <label className="small">Kind{' '}
                    <select aria-label={`Kind ${s.id}`} value={s.kind ?? 'sublet'} onChange={(e) => patch(s.id, { kind: e.target.value as 'labor' | 'sublet' })}>
                      <option value="labor">Labor</option><option value="sublet">Sublet</option>
                    </select>
                  </label>
                  <label className="small">PEC category{' '}
                    <select aria-label={`PEC ${s.id}`} value={s.pecCategory ?? ''} onChange={(e) => patch(s.id, { pecCategory: e.target.value })}>
                      <option value="">— set —</option>
                      {PEC_CODES.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </label>
                </div>
                <div className="create-row" style={{ marginTop: 8 }}>
                  <input aria-label={`Owner ${s.id}`} placeholder="Owner" defaultValue={s.owner ?? ''} onBlur={(e) => patch(s.id, { owner: e.target.value })} />
                  <input aria-label={`CNIC ${s.id}`} placeholder="CNIC" defaultValue={s.cnic ?? ''} onBlur={(e) => patch(s.id, { cnic: e.target.value })} />
                  <input aria-label={`Enlistment ${s.id}`} placeholder="NLC enlistment" defaultValue={s.enlistment ?? ''} onBlur={(e) => patch(s.id, { enlistment: e.target.value })} />
                </div>
                <div className="create-row" style={{ marginTop: 8 }}>
                  <input aria-label={`Address ${s.id}`} placeholder="Address" defaultValue={s.address ?? ''} onBlur={(e) => patch(s.id, { address: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
                  <input aria-label={`Contact ${s.id}`} placeholder="Contact" defaultValue={s.contact ?? ''} onBlur={(e) => patch(s.id, { contact: e.target.value })} />
                  <input aria-label={`Security ${s.id}`} placeholder="Perf. security (PKR)" defaultValue={s.performanceSecurity ?? ''} onBlur={(e) => patch(s.id, { performanceSecurity: Number(e.target.value) || 0 })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

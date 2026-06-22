import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { nextTransition, IPC_STATUS_LABEL } from '../../domain/ipc';
import { ROLE_LABEL } from '../../domain/chains';
import { useRole } from '../../state/Role';
import { pnCoefficient, DEFAULT_PBS_COMPONENTS, type EscalationComponent } from '../../domain/escalation';
import type { Epc, Ipc, IpcStatus } from '../../data/types';

const ELIGIBLE: ReadonlySet<IpcStatus> = new Set(['vetted', 'forwarded_to_client', 'approved', 'paid_pending_ack', 'paid']);
const money = (n: number) => (n > 0 ? formatMoney(n) : '0');

export function EscalationTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { can } = useRole();
  const { toast } = useToast();
  const [comps, setComps] = useState<EscalationComponent[]>(DEFAULT_PBS_COMPONENTS);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);

  async function load() {
    const [c, e, i] = await Promise.all([provider.listEscalationComponents(projectId), provider.listEpcs(projectId), provider.listIpcs(projectId)]);
    setComps(c); setEpcs(e); setIpcs(i);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const pn = useMemo(() => pnCoefficient(comps), [comps]);

  function editComp(i: number, field: 'currentIndex' | 'baseIndex' | 'weight', value: string) {
    setComps((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: Number(value) || 0 } : c)));
  }
  function editLabel(i: number, value: string) {
    setComps((prev) => prev.map((c, idx) => (idx === i ? { ...c, label: value } : c)));
  }
  async function addComp() {
    const next = [...comps, { label: 'New component', weight: 0, baseIndex: 100, currentIndex: 100 }];
    setComps(next); await provider.setEscalationComponents(projectId, next);
  }
  async function removeComp(i: number) {
    if (i === 0) return;
    const next = comps.filter((_, idx) => idx !== i);
    setComps(next); await provider.setEscalationComponents(projectId, next);
  }
  async function persist() { await provider.setEscalationComponents(projectId, comps); }

  const totalEsc = epcs.reduce((a, e) => a + e.amount, 0);
  const paidEsc = epcs.filter((e) => e.status === 'paid').reduce((a, e) => a + e.amount, 0);
  const pendingEsc = totalEsc - paidEsc;

  async function generateDrafts() {
    const have = new Set(epcs.map((e) => e.ipcNo).filter(Boolean));
    const eligible = ipcs.filter((i) => ELIGIBLE.has(i.status) && !have.has(i.ipcNo));
    if (eligible.length === 0) { toast({ message: 'No eligible IPCs without an EPC.', kind: 'info' }); return; }
    for (const ipc of eligible) {
      const amount = Math.round(ipc.gross * (pn.pn - 1));
      await provider.createEpc(projectId, { period: ipc.period, amount, ipcNo: ipc.ipcNo });
    }
    await load();
    toast({ message: `Generated ${eligible.length} EPC draft${eligible.length === 1 ? '' : 's'} at Pₙ ${pn.pn.toFixed(4)}`, kind: 'success' });
  }
  async function advance(epc: Epc) {
    const t = nextTransition(epc.status);
    if (!t) return;
    const updated = await provider.transitionEpc(projectId, epc.epcNo, t.action);
    setEpcs((prev) => prev.map((e) => (e.epcNo === updated.epcNo ? updated : e)));
    toast({ message: `${updated.epcNo} → ${IPC_STATUS_LABEL[updated.status]}`, kind: 'success' });
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Escalation</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Price-adjustment payments. Formula-based EPCs for the main contract (FGEHA → NLC), and negotiated sublet escalation for S/C contractors (inline in RAR validate/approve).</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Escalation overview">
        <Kpi label="Sublet escalation approved" value="0" sub="0 contractors" />
        <Kpi label="Sublet escalation paid" value="0" sub="—" />
        <Kpi label="Sublet escalation pending" value="0" sub="in RARs not yet paid" />
        <Kpi label="Client EPCs issued" value={epcs.length ? String(epcs.length) : '—'} sub="formula-based" />
      </div>

      <h4 style={{ margin: '20px 0 4px' }}>Formula-based Escalation Payment Certificates</h4>
      <p className="muted small" style={{ margin: '0 0 10px' }}>One EPC per IPC. Pₙ derived from PBS index movements weighted by contractual components. Amount = IPC_gross × (Pₙ − 1). Pipeline: draft → submitted → vetted → approved → paid.</p>

      <div className="kpi-row" aria-label="EPC summary">
        <Kpi label="Current Pₙ" value={pn.pn.toFixed(4)} sub={`+${((pn.pn - 1) * 100).toFixed(2)}% over base`} accent />
        <Kpi label="Total EPCs" value={String(epcs.length)} sub="in pipeline" />
        <Kpi label="Total escalation" value={money(totalEsc)} sub="across all EPCs" />
        <Kpi label="Paid" value={money(paidEsc)} sub={`${epcs.filter((e) => e.status === 'paid').length} paid`} />
        <Kpi label="Pending" value={money(pendingEsc)} sub="in pipeline" />
      </div>

      <div className="section-head" style={{ marginTop: 18 }}>
        <h4 style={{ margin: 0 }}>PBS index master · base &amp; current values</h4>
        <span className="muted small">Weights must sum to 1.000. Edit current indices to drive Pₙ.</span>
      </div>
      <table className="data-table pbs-table" aria-label="PBS index master">
        <thead><tr><th>Component</th><th className="num">Base idx</th><th className="num">Current</th><th className="num">Ratio</th><th className="num">Weight</th><th className="num">Contribution</th><th></th></tr></thead>
        <tbody>
          {pn.lines.map((l, i) => (
            <tr key={i}>
              <td>{i === 0 ? <>{l.label}<span className="muted small"> (ratio fixed at 1.000)</span></> : <input className="qty-input" style={{ width: 160, textAlign: 'left' }} aria-label={`Label ${i}`} value={l.label} onChange={(e) => editLabel(i, e.target.value)} onBlur={persist} />}</td>
              <td className="num"><input className="qty-input" aria-label={`Base ${i}`} value={l.baseIndex} disabled={i === 0} onChange={(e) => editComp(i, 'baseIndex', e.target.value)} onBlur={persist} /></td>
              <td className="num"><input className="qty-input" aria-label={`Current ${i}`} value={l.currentIndex} disabled={i === 0} onChange={(e) => editComp(i, 'currentIndex', e.target.value)} onBlur={persist} /></td>
              <td className="num">{l.ratio.toFixed(4)}</td>
              <td className="num"><input className="qty-input" aria-label={`Weight ${i}`} value={l.weight} onChange={(e) => editComp(i, 'weight', e.target.value)} onBlur={persist} /></td>
              <td className="num">{l.contribution.toFixed(4)}</td>
              <td>{i === 0 ? null : <button className="btn-ghost btn-mini" aria-label={`Remove ${l.label}`} onClick={() => removeComp(i)}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="boq-total-row">
            <td><strong>Σ weights / Pₙ</strong></td><td /><td /><td />
            <td className={`num ${Math.abs(pn.sumWeights - 1) > 1e-6 ? 'neg' : ''}`}><strong>{pn.sumWeights.toFixed(3)}</strong></td>
            <td className="num"><strong>{pn.pn.toFixed(4)}</strong></td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div style={{ marginTop: 8 }}>
        <button className="btn-ghost btn-mini" onClick={addComp}>+ Add component</button>
        {Math.abs(pn.sumWeights - 1) > 1e-6 && <span className="muted small" style={{ marginLeft: 10, color: 'var(--rag-amber)' }}>⚠ Weights sum to {pn.sumWeights.toFixed(3)}, should be 1.000</span>}
      </div>

      <div className="section-head" style={{ marginTop: 18 }}>
        <h4 style={{ margin: 0 }}>EPC pipeline</h4>
        <button className="btn" onClick={generateDrafts}>⚡ Generate drafts for all eligible IPCs</button>
      </div>
      {epcs.length === 0 ? (
        <p className="muted">No EPCs yet. Generate one EPC per vetted-or-later IPC.</p>
      ) : (
        <table className="data-table" aria-label="EPC register">
          <thead><tr><th>EPC</th><th>For IPC</th><th>Period</th><th>Status</th><th className="num">Escalation</th><th></th></tr></thead>
          <tbody>
            {epcs.map((epc) => {
              const t = nextTransition(epc.status);
              return (
                <tr key={epc.epcNo}>
                  <td className="mono small">{epc.epcNo}</td>
                  <td className="mono small">{epc.ipcNo ?? '—'}</td>
                  <td>{epc.period}</td>
                  <td><span className="status-pill st-vetted">{IPC_STATUS_LABEL[epc.status]}</span></td>
                  <td className="num">{formatMoney(epc.amount)}</td>
                  <td>{t ? <button className="btn-ghost btn-mini" disabled={!can(t.role)} aria-label={`Advance ${epc.epcNo}`} title={can(t.role) ? t.label : `Requires ${ROLE_LABEL[t.role] ?? t.role}`} onClick={() => advance(epc)}>{t.label}</button> : <span className="muted small">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: 'var(--rag-amber)' } : undefined}>{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

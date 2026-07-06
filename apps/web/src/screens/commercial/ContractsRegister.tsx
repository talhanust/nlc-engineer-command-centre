import { useEffect, useMemo, useState } from 'react';
import { ContractDetailModal } from '../../components/ContractDetailModal';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { SkeletonRows } from '../../components/Skeleton';
import { ExportMenu } from '../../components/ExportMenu';
import type { Contract, ContractStatus, Subcontractor } from '../../data/types';
import { useRole } from '../../state/Role';
import { ChainStatus, ChainControls } from '../../components/ApptChainControls';

const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'Draft', awarded: 'Awarded', in_progress: 'In progress', completed: 'Completed', closed: 'Closed',
};
const STATUS_FLOW: ContractStatus[] = ['draft', 'awarded', 'in_progress', 'completed', 'closed'];
const pill = (s: ContractStatus) => (s === 'completed' || s === 'closed' ? 'paid' : s === 'in_progress' ? 'vetted' : 'draft');

export function ContractsRegister({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const { role, user } = useRole();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [detail, setDetail] = useState<Contract | null>(null);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [subId, setSubId] = useState('');
  const [bills, setBills] = useState('');
  const [value, setValue] = useState('');
  const [retention, setRetention] = useState('5');

  async function load() {
    const [c, s] = await Promise.all([provider.listContracts(projectId), provider.listSubcontractors(projectId)]);
    setContracts(c); setSubs(s); setLoading(false);
    if (!subId && s[0]) setSubId(s[0].id);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = (id: string) => subs.find((s) => s.id === id)?.name ?? id;
  const totals = useMemo(() => ({
    value: contracts.reduce((s, c) => s + c.value, 0),
    active: contracts.filter((c) => c.status === 'in_progress' || c.status === 'awarded').length,
    done: contracts.filter((c) => c.status === 'completed' || c.status === 'closed').length,
  }), [contracts]);

  async function create() {
    const v = Number(value.replace(/,/g, ''));
    if (!title.trim() || !subId || !Number.isFinite(v) || v <= 0) return;
    const scopeBills = bills.split(',').map((b) => b.trim()).filter(Boolean);
    const retPct = Math.max(0, Math.min(5, Number(retention) || 5));
    const c = await provider.createContract(projectId, { title: title.trim(), subcontractorId: subId, scopeBills, value: v, awardDate: new Date().toISOString().slice(0, 10), retentionPct: retPct });
    setTitle(''); setBills(''); setValue(''); setRetention('5');
    await load();
    toast({ message: `${c.contractNo} created`, kind: 'success' });
  }
  async function advance(c: Contract) {
    const next = STATUS_FLOW[Math.min(STATUS_FLOW.length - 1, STATUS_FLOW.indexOf(c.status) + 1)];
    await provider.setContractStatus(projectId, c.id, next);
    setContracts((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    toast({ message: `${c.contractNo} → ${STATUS_LABEL[next]}`, kind: 'success' });
  }

  return (
    <div>
      {detail && <ContractDetailModal projectId={projectId} contract={detail} onClose={() => setDetail(null)} />}
      <div className="section-head">
        <div>
          <h3>Contracts Register</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Subcontract packages with unique numbers. RARs are billed against a contract.</p>
        </div>
        <ExportMenu
          filename={`${projectId.replace('proj-', '')}-contracts`}
          title="Contracts Register"
          subtitle="NLC subcontract packages"
          meta={[['Contracts', String(contracts.length)], ['Total contracted', formatMoney(totals.value)]]}
          columns={[
            { label: 'Contract No' }, { label: 'Title' }, { label: 'Contractor' }, { label: 'Bills' },
            { label: 'Value', align: 'right' }, { label: 'Status' }, { label: 'Award date' },
          ]}
          rows={contracts.map((c) => [c.contractNo, c.title, subName(c.subcontractorId), c.scopeBills.join(' '), Math.round(c.value), STATUS_LABEL[c.status], c.awardDate ?? ''])}
        />
      </div>

      <div className="kpi-row" aria-label="Contracts summary">
        <Kpi label="Contracts" value={String(contracts.length)} sub={`${totals.active} active · ${totals.done} closed`} />
        <Kpi label="Total contracted" value={formatMoney(totals.value)} sub="sublet value" accent />
        <Kpi label="Subcontractors" value={String(new Set(contracts.map((c) => c.subcontractorId)).size)} sub="engaged" />
      </div>

      <div className="card create-row" style={{ flexWrap: 'wrap' }}>
        <input aria-label="Contract title" placeholder="Package title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ minWidth: 200 }} />
        <select aria-label="Contractor" value={subId} onChange={(e) => setSubId(e.target.value)}>
          {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input aria-label="Scope bills" placeholder="Bills e.g. 1,2,4" value={bills} onChange={(e) => setBills(e.target.value)} style={{ width: 120 }} />
        <input aria-label="Contract value" placeholder="Value (PKR)" value={value} onChange={(e) => setValue(e.target.value)} />
        <input aria-label="Contract retention %" type="number" min={0} max={5} step={0.5} title="Retention % (max 5% of contract value)" placeholder="Ret %" value={retention} onChange={(e) => setRetention(e.target.value)} style={{ width: 90 }} />
        <button className="btn" onClick={create}>+ New Contract</button>
      </div>

      {loading ? <SkeletonRows rows={3} cols={6} /> : contracts.length === 0 ? (
        <p className="muted" style={{ padding: 16 }}>No contracts yet. Award the first subcontract package above.</p>
      ) : (
        <table className="data-table" aria-label="Contracts register">
          <thead><tr><th>Contract No</th><th>Title</th><th>Contractor</th><th>Bills</th><th className="num">Value</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="mono small">{c.contractNo}</td>
                <td>{c.title}{c.awardDate && <div className="muted small">Awarded {c.awardDate}</div>}</td>
                <td className="small">{subName(c.subcontractorId)}</td>
                <td className="small">{c.scopeBills.length ? c.scopeBills.join(', ') : '—'}</td>
                <td className="num">{formatMoney(c.value)}</td>
                <td>
                  <span className={`status-pill st-${pill(c.status)}`}>{STATUS_LABEL[c.status]}</span>
                  {!c.chain && c.status === 'draft' && <div className="muted small">not submitted</div>}
                  <ChainStatus chain={c.chain} refNo={c.contractNo} />
                </td>
                <td>
                  <button className="btn-ghost btn-mini" aria-label={`View ${c.contractNo}`} onClick={() => setDetail(c)}>View</button>
                  {!c.chain && c.status === 'draft' && (
                    <button className="btn btn-mini" style={{ marginLeft: 6 }} aria-label={`Submit ${c.contractNo} for approval`}
                      onClick={async () => { await provider.submitContractApproval(projectId, c.id, user?.name ?? role); await load(); toast({ message: 'Submitted for approval', kind: 'success' }); }}>
                      Submit for approval
                    </button>
                  )}
                  <ChainControls chain={c.chain} refNo={c.contractNo} me={user?.appointmentId} isAdmin={role === 'admin'}
                    canResubmit={['contract_engr', 'spm']}
                    onAct={async () => { await provider.actOnContract(projectId, c.id, user?.name ?? role); await load(); }}
                    onReturn={async (rm) => { await provider.returnContract(projectId, c.id, user?.name ?? role, rm); await load(); }}
                    onResubmit={async () => { await provider.resubmitContract(projectId, c.id, user?.name ?? role); await load(); toast({ message: 'Resubmitted — ladder rebuilt at current value', kind: 'success' }); }}
                  />
                  {c.status !== 'closed' && c.status !== 'draft' ? <button className="btn-ghost btn-mini" style={{ marginLeft: 6 }} aria-label={`Advance ${c.contractNo}`} onClick={() => advance(c)}>Advance →</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={accent ? { color: 'var(--rag-green)' } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

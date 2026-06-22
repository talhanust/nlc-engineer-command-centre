import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney, toNum } from '../../domain/money';
import { variationSummary, nextVoTransition, VO_STATUS_LABEL, VO_TYPE_LABEL } from '../../domain/variations';
import { ROLE_LABEL } from '../../domain/chains';
import { useRole } from '../../state/Role';
import { SkeletonRows } from '../../components/Skeleton';
import type { Variation, VariationType } from '../../data/types';

const TYPES: VariationType[] = ['addition', 'omission', 'substitution', 'rate_change'];
const signed = (n: number) => `${n >= 0 ? '+' : '−'} ${formatMoney(Math.abs(n))}`;

export function VariationsTab({ projectId }: { projectId: string }) {
  const { provider, projects } = useData();
  const { toast } = useToast();
  const { can } = useRole();
  const [vos, setVos] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<VariationType>('addition');
  const [amount, setAmount] = useState('');

  async function load() {
    setVos(await provider.listVariations(projectId));
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const original = toNum(projects.find((p) => p.id === projectId)?.contractValue ?? '0');
  const sum = useMemo(() => variationSummary(vos, original), [vos, original]);

  async function create() {
    const raw = Number(amount.replace(/,/g, ''));
    if (!title.trim() || !Number.isFinite(raw) || raw === 0) return;
    const signedAmount = type === 'omission' ? -Math.abs(raw) : Math.abs(raw);
    const vo = await provider.createVariation(projectId, { title: title.trim(), type, amount: signedAmount, date: new Date().toISOString().slice(0, 10) });
    setTitle(''); setAmount('');
    await load();
    toast({ message: `${vo.voNo} created`, kind: 'success' });
  }
  async function advance(vo: Variation) {
    const t = nextVoTransition(vo.status);
    if (!t) return;
    const updated = await provider.transitionVariation(projectId, vo.voNo, t.action);
    setVos((prev) => prev.map((v) => (v.voNo === updated.voNo ? updated : v)));
    toast({ message: `${updated.voNo} → ${VO_STATUS_LABEL[updated.status]}`, kind: 'success' });
  }
  async function reject(vo: Variation) {
    const updated = await provider.transitionVariation(projectId, vo.voNo, 'reject');
    setVos((prev) => prev.map((v) => (v.voNo === updated.voNo ? updated : v)));
    toast({ message: `${updated.voNo} rejected`, kind: 'info' });
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Variations / Change Orders</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Additions, omissions, substitutions and rate changes against the contract. Approved variations adjust the revised contract value, which flows into retention cap and coverage.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Variation summary">
        <Kpi label="Original contract" value={formatMoney(original)} sub="FGEHA award" />
        <Kpi label="Approved variations" value={signed(sum.approvedTotal)} sub={`${vos.filter((v) => v.status === 'approved').length} approved`} accent={sum.approvedTotal >= 0} neg={sum.approvedTotal < 0} />
        <Kpi label="Pending variations" value={signed(sum.pendingTotal)} sub="awaiting approval" />
        <Kpi label="Revised contract" value={formatMoney(sum.revisedContractValue)} sub="original + approved" accent />
        <Kpi label="Variations" value={String(sum.count)} sub="excl. rejected" />
      </div>

      <div className="card create-row" style={{ flexWrap: 'wrap' }}>
        <input aria-label="Variation title" placeholder="Variation title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ minWidth: 220 }} />
        <select aria-label="Variation type" value={type} onChange={(e) => setType(e.target.value as VariationType)}>
          {TYPES.map((t) => <option key={t} value={t}>{VO_TYPE_LABEL[t]}</option>)}
        </select>
        <input aria-label="Variation amount" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <span className="muted small">{type === 'omission' ? 'recorded as a deduction' : 'recorded as an addition'}</span>
        <button className="btn" onClick={create}>+ New Variation</button>
      </div>

      {loading ? <SkeletonRows rows={3} cols={6} /> : vos.length === 0 ? (
        <div className="empty-state card" style={{ textAlign: 'center', padding: 36 }}>
          <div style={{ fontSize: 34 }}>📝</div>
          <h4 style={{ margin: '8px 0 4px' }}>No variations yet</h4>
          <p className="muted small" style={{ margin: 0 }}>Raise the first change order above — it enters the approval pipeline as a draft.</p>
        </div>
      ) : (
        <table className="data-table" aria-label="Variations register">
          <thead><tr><th>VO</th><th>Title</th><th>Type</th><th className="num">Amount</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {vos.map((vo) => {
              const t = nextVoTransition(vo.status);
              return (
                <tr key={vo.voNo} className={vo.status === 'rejected' ? 'row-flag' : ''}>
                  <td className="mono small">{vo.voNo}</td>
                  <td>{vo.title}{vo.date && <div className="muted small">{vo.date}</div>}</td>
                  <td className="small">{VO_TYPE_LABEL[vo.type]}</td>
                  <td className={`num ${vo.amount < 0 ? 'neg' : ''}`}>{signed(vo.amount)}</td>
                  <td><span className={`status-pill st-${vo.status === 'approved' ? 'paid' : vo.status === 'rejected' ? 'draft' : 'vetted'}`}>{VO_STATUS_LABEL[vo.status]}</span></td>
                  <td>
                    {t ? <button className="btn-ghost btn-mini" disabled={!can(t.role)} aria-label={`Advance ${vo.voNo}`} title={can(t.role) ? t.label : `Requires ${ROLE_LABEL[t.role] ?? t.role}`} onClick={() => advance(vo)}>{t.label}</button> : <span className="muted small">—</span>}
                    {t && <button className="btn-ghost btn-mini" aria-label={`Reject ${vo.voNo}`} style={{ marginLeft: 6 }} onClick={() => reject(vo)}>Reject</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent, neg }: { label: string; value: string; sub?: string; accent?: boolean; neg?: boolean }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={neg ? { color: 'var(--rag-red)' } : accent ? { color: 'var(--rag-green)' } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

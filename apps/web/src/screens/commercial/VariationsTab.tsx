import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney, toNum } from '../../domain/money';
import { variationSummary, nextVoTransition, VO_STATUS_LABEL, VO_TYPE_LABEL, variationLineAmount, VO_LINE_KIND_LABEL } from '../../domain/variations';
import { ROLE_LABEL } from '../../domain/chains';
import { useRole } from '../../state/Role';
import { SkeletonRows } from '../../components/Skeleton';
import type { Variation, VariationLine, VariationLineKind, BoqItem } from '../../data/types';

const signed = (n: number) => `${n >= 0 ? '+' : '−'} ${formatMoney(Math.abs(n))}`;
const KINDS: VariationLineKind[] = ['qty', 'rate', 'add', 'omit'];

export function VariationsTab({ projectId }: { projectId: string }) {
  const { provider, projects } = useData();
  const { toast } = useToast();
  const { can } = useRole();
  const [vos, setVos] = useState<Variation[]>([]);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<VariationLine[]>([]);
  const [kind, setKind] = useState<VariationLineKind>('qty');
  const [boqId, setBoqId] = useState('');
  const [val, setVal] = useState('');
  const [add, setAdd] = useState({ billNo: '', code: '', description: '', unit: 'No', qty: '', rate: '' });

  async function load() {
    const [v, b] = await Promise.all([provider.listVariations(projectId), provider.listBoq(projectId)]);
    setVos(v); setBoq(b); setLoading(false);
    if (!boqId && b[0]) setBoqId(b[0].id);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const boqById = useMemo(() => new Map(boq.map((b) => [b.id, b])), [boq]);
  const original = toNum(projects.find((p) => p.id === projectId)?.contractValue ?? '0');
  const sum = useMemo(() => variationSummary(vos, original), [vos, original]);
  const stagedTotal = lines.reduce((s, l) => s + l.amount, 0);

  function addLine() {
    let line: VariationLine | null = null;
    if (kind === 'add') {
      const qty = Number(add.qty.replace(/,/g, '')); const rate = Number(add.rate.replace(/,/g, ''));
      if (!add.description.trim() || !Number.isFinite(qty) || !Number.isFinite(rate) || qty <= 0) return;
      line = { kind: 'add', billNo: add.billNo.trim(), code: add.code.trim(), description: add.description.trim(), unit: add.unit.trim() || 'No', newQty: qty, newRate: rate, amount: 0 };
      line.amount = variationLineAmount(line);
      setAdd({ billNo: '', code: '', description: '', unit: 'No', qty: '', rate: '' });
    } else {
      const item = boqById.get(boqId);
      if (!item) return;
      if (kind === 'omit') {
        line = { kind: 'omit', boqItemId: boqId, amount: 0 };
      } else {
        const n = Number(val.replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) return;
        line = kind === 'qty' ? { kind: 'qty', boqItemId: boqId, newQty: n, amount: 0 } : { kind: 'rate', boqItemId: boqId, newRate: n, amount: 0 };
      }
      line.amount = variationLineAmount(line, item);
      setVal('');
    }
    setLines((prev) => [...prev, line!]);
  }

  async function create() {
    if (!title.trim() || lines.length === 0) return;
    const vo = await provider.createVariation(projectId, { title: title.trim(), lines, date: new Date().toISOString().slice(0, 10) });
    setTitle(''); setLines([]);
    await load();
    toast({ message: `${vo.voNo} created · ${signed(vo.amount)}`, kind: 'success' });
  }
  async function advance(vo: Variation) {
    const t = nextVoTransition(vo.status);
    if (!t) return;
    const updated = await provider.transitionVariation(projectId, vo.voNo, t.action);
    await load();
    toast({ message: updated.appliedToBoq ? `${updated.voNo} approved — BOQ revised` : `${updated.voNo} → ${VO_STATUS_LABEL[updated.status]}`, kind: 'success' });
  }
  async function reject(vo: Variation) {
    const updated = await provider.transitionVariation(projectId, vo.voNo, 'reject');
    setVos((prev) => prev.map((v) => (v.voNo === updated.voNo ? updated : v)));
    toast({ message: `${updated.voNo} rejected`, kind: 'info' });
  }

  const lineTarget = (l: VariationLine) => l.kind === 'add' ? (l.description || 'New item') : (boqById.get(l.boqItemId!)?.code ?? l.boqItemId ?? '');

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Variations / Change Orders</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Quantity variations, rate changes, added and omitted items against the BOQ. When a VO is approved it supersedes the original BOQ; the revised contract value flows into retention cap and EVM.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Variation summary">
        <Kpi label="Original contract" value={formatMoney(original)} sub="award" />
        <Kpi label="Approved variations" value={signed(sum.approvedTotal)} sub={`${vos.filter((v) => v.status === 'approved').length} approved`} accent={sum.approvedTotal >= 0} neg={sum.approvedTotal < 0} />
        <Kpi label="Pending variations" value={signed(sum.pendingTotal)} sub="awaiting approval" />
        <Kpi label="Revised contract" value={formatMoney(sum.revisedContractValue)} sub="original + approved" accent />
        <Kpi label="Variations" value={String(sum.count)} sub="excl. rejected" />
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="create-row" style={{ marginBottom: 10 }}>
          <input aria-label="Variation title" placeholder="Variation title (e.g. Additional culvert)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        </div>
        <div className="create-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="small muted">Change<br />
            <select aria-label="Change kind" value={kind} onChange={(e) => setKind(e.target.value as VariationLineKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{VO_LINE_KIND_LABEL[k]}</option>)}
            </select>
          </label>
          {kind !== 'add' ? (
            <>
              <label className="small muted" style={{ flex: 1, minWidth: 220 }}>BOQ item<br />
                <select aria-label="BOQ item" value={boqId} onChange={(e) => setBoqId(e.target.value)} style={{ width: '100%' }}>
                  {boq.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.description.slice(0, 40)} ({b.qty.toLocaleString('en-PK')} {b.unit} @ {b.rate})</option>)}
                </select>
              </label>
              {kind === 'qty' && <label className="small muted">New qty<br /><input aria-label="New quantity" value={val} onChange={(e) => setVal(e.target.value)} placeholder={String(boqById.get(boqId)?.qty ?? '')} /></label>}
              {kind === 'rate' && <label className="small muted">New rate<br /><input aria-label="New rate" value={val} onChange={(e) => setVal(e.target.value)} placeholder={String(boqById.get(boqId)?.rate ?? '')} /></label>}
              {kind === 'omit' && <span className="muted small">removes the item value</span>}
            </>
          ) : (
            <>
              <input aria-label="New item bill" placeholder="Bill" value={add.billNo} onChange={(e) => setAdd({ ...add, billNo: e.target.value })} style={{ width: 60 }} />
              <input aria-label="New item description" placeholder="Description" value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
              <input aria-label="New item unit" placeholder="Unit" value={add.unit} onChange={(e) => setAdd({ ...add, unit: e.target.value })} style={{ width: 70 }} />
              <input aria-label="New item qty" placeholder="Qty" value={add.qty} onChange={(e) => setAdd({ ...add, qty: e.target.value })} style={{ width: 80 }} />
              <input aria-label="New item rate" placeholder="Rate" value={add.rate} onChange={(e) => setAdd({ ...add, rate: e.target.value })} style={{ width: 90 }} />
            </>
          )}
          <button className="btn-ghost" onClick={addLine}>+ Add change</button>
        </div>

        {lines.length > 0 && (
          <table className="data-table" aria-label="Staged variation lines" style={{ marginTop: 12 }}>
            <thead><tr><th>Change</th><th>Target</th><th className="num">Delta</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="small">{VO_LINE_KIND_LABEL[l.kind]}</td>
                  <td className="small">{lineTarget(l)}{l.kind === 'qty' && ` → ${l.newQty}`}{l.kind === 'rate' && ` → ${l.newRate}`}</td>
                  <td className={`num ${l.amount < 0 ? 'neg' : ''}`}>{signed(l.amount)}</td>
                  <td><button className="btn-ghost btn-mini" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="boq-total-row"><td colSpan={2}><strong>Net variation</strong></td><td className={`num ${stagedTotal < 0 ? 'neg' : ''}`}><strong>{signed(stagedTotal)}</strong></td><td /></tr></tfoot>
          </table>
        )}
        <div style={{ marginTop: 10 }}>
          <button className="btn" disabled={!title.trim() || lines.length === 0} onClick={create}>+ Raise Variation ({signed(stagedTotal)})</button>
        </div>
      </div>

      {loading ? <SkeletonRows rows={3} cols={6} /> : vos.length === 0 ? (
        <div className="empty-state card" style={{ textAlign: 'center', padding: 36 }}>
          <div style={{ fontSize: 34 }}>📝</div>
          <h4 style={{ margin: '8px 0 4px' }}>No variations yet</h4>
          <p className="muted small" style={{ margin: 0 }}>Build a change above — add quantity variations, rate changes or new/omitted items, then raise the VO.</p>
        </div>
      ) : (
        <table className="data-table" aria-label="Variations register" style={{ marginTop: 14 }}>
          <thead><tr><th>VO</th><th>Title</th><th>Type</th><th className="num">Changes</th><th className="num">Amount</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {vos.map((vo) => {
              const t = nextVoTransition(vo.status);
              return (
                <tr key={vo.voNo} className={vo.status === 'rejected' ? 'row-flag' : ''}>
                  <td className="mono small">{vo.voNo}</td>
                  <td>{vo.title}{vo.date && <div className="muted small">{vo.date}</div>}{vo.appliedToBoq && <div className="muted small" style={{ color: 'var(--rag-green)' }}>BOQ revised ✓</div>}</td>
                  <td className="small">{VO_TYPE_LABEL[vo.type]}</td>
                  <td className="num small">{vo.lines?.length ?? '—'}</td>
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

import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { ROLE_LABEL } from '../../domain/chains';
import { TIMELINE, CURRENT_IDX } from '../../domain/scurve';
import {
  cumulativeExecuted, itemPctComplete, physicalProgressPct, executedValueToDate,
} from '../../domain/progress';
import type { BoqItem, ProgressUpdate } from '../../data/types';

export function ProgressTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [role, setRole] = useState('sqs');
  const [period, setPeriod] = useState(TIMELINE[CURRENT_IDX]);
  const [error, setError] = useState('');

  async function load() {
    const [b, u] = await Promise.all([provider.listBoq(projectId), provider.listProgress(projectId)]);
    setItems(b); setUpdates(u);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const physical = physicalProgressPct(items, updates);
  const earned = executedValueToDate(items, updates);

  async function enter(item: BoqItem, qty: string) {
    setError('');
    const v = Number(qty);
    if (!v) return;
    setUpdates([...(await provider.upsertProgress(projectId, { boqItemId: item.id, period, executedQty: v, role }))]);
  }
  async function validate(id: string) {
    setError('');
    try { setUpdates([...(await provider.validateProgress(projectId, id, role))]); }
    catch (e) { setError((e as Error).message); }
  }

  const drafts = updates.filter((u) => u.status === 'draft');

  return (
    <div>
      <div className="section-head">
        <h3>Progress updates</h3>
        <span className="muted">Physical {physical}% · executed value {formatMoney(earned)}</span>
      </div>
      <p className="muted small">QS enters executed quantity per BOQ item; the PM validates. Validated progress is the single source feeding the S-curve actual and IPC/RAR billing.</p>

      <div className="card create-row">
        <label className="small">Acting role{' '}
          <select aria-label="Progress acting role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="sqs">{ROLE_LABEL['sqs'] ?? 'QS'}</option>
            <option value="pm">{ROLE_LABEL['pm'] ?? 'PM'}</option>
          </select>
        </label>
        <label className="small">Period{' '}
          <select aria-label="Progress period" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {TIMELINE.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
        </label>
      </div>
      {error && <p className="neg small">{error}</p>}

      <table className="data-table" aria-label="Progress by BOQ item">
        <thead><tr><th>Code</th><th>Description</th><th className="num">BOQ qty</th><th className="num">Executed (cum.)</th><th className="num">% complete</th><th className="num">Enter {period}</th></tr></thead>
        <tbody>
          {items.length === 0 ? <tr><td colSpan={6} className="muted">Import a BOQ first.</td></tr> :
            items.map((i) => (
              <tr key={i.id}>
                <td>{i.code}</td><td>{i.description}</td>
                <td className="num">{i.qty}</td>
                <td className="num">{cumulativeExecuted(updates, i.id)}</td>
                <td className="num">{itemPctComplete(i, updates)}%</td>
                <td className="num"><input className="qty-input" aria-label={`Enter executed ${i.code}`} placeholder="qty" disabled={role !== 'sqs'} onBlur={(e) => { enter(i, e.target.value); e.currentTarget.value = ''; }} /></td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="section-head" style={{ marginTop: 16 }}><h3>Pending validation</h3><span className="muted">{drafts.length} draft updates</span></div>
      <table className="data-table" aria-label="Progress pending validation">
        <thead><tr><th>Item</th><th>Period</th><th className="num">Executed qty</th><th>Entered by</th><th></th></tr></thead>
        <tbody>
          {drafts.length === 0 ? <tr><td colSpan={5} className="muted">Nothing awaiting validation.</td></tr> :
            drafts.map((u) => {
              const it = items.find((x) => x.id === u.boqItemId);
              return (
                <tr key={u.id}>
                  <td>{it?.code ?? u.boqItemId}</td>
                  <td>{u.period}</td>
                  <td className="num">{u.executedQty}</td>
                  <td>{ROLE_LABEL[u.enteredBy ?? ''] ?? u.enteredBy}</td>
                  <td><button className="btn" aria-label={`Validate ${u.id}`} disabled={role !== 'pm'} title={role !== 'pm' ? 'Only the PM can validate' : ''} onClick={() => validate(u.id)}>Validate</button></td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

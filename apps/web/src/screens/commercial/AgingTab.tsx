import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { buildAging, agingTotals, URGENCY_LABEL, type AgingDoc } from '../../domain/aging';
import type { Ipc, Rar, Epc } from '../../data/types';

type GroupBy = 'all' | 'stage' | 'owner' | 'urgency';

export function AgingTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('all');
  const [breachedOnly, setBreachedOnly] = useState(false);

  useEffect(() => {
    let a = true;
    void Promise.all([provider.listIpcs(projectId), provider.listRars(projectId), provider.listEpcs(projectId)])
      .then(([i, r, e]) => { if (a) { setIpcs(i); setRars(r); setEpcs(e); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const docs = useMemo(() => {
    const all = buildAging(ipcs, rars, epcs);
    return breachedOnly ? all.filter((d) => d.ratio >= 1) : all;
  }, [ipcs, rars, epcs, breachedOnly]);
  const totals = useMemo(() => agingTotals(docs), [docs]);

  const groups = useMemo(() => {
    if (groupBy === 'all') return [{ key: 'All items', rows: docs }];
    const key = (d: AgingDoc) => (groupBy === 'stage' ? d.stage : groupBy === 'owner' ? d.owner : URGENCY_LABEL[d.urgency]);
    const m = new Map<string, AgingDoc[]>();
    for (const d of docs) { const k = key(d); const arr = m.get(k) ?? []; arr.push(d); m.set(k, arr); }
    return [...m.entries()].map(([k, rows]) => ({ key: k, rows }));
  }, [docs, groupBy]);

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Aging</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Every in-pipeline document (IPC · RAR · EPC) with days-in-stage tracking and breach detection. Critical urgency triggers when a document exceeds 2× its stage threshold.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Aging summary">
        <Kpi label="In pipeline" value={String(totals.count)} sub="across IPCs · RARs · EPCs" />
        <Kpi label="Total value" value={totals.value > 0 ? formatMoney(totals.value) : '0'} sub="sum of in-pipeline docs" />
        <Kpi label="Critical (≥2×)" value={String(totals.critical)} sub={totals.critical ? 'breached' : 'none'} />
        <Kpi label="High (1.5×)" value={String(totals.high)} sub={totals.high ? 'attention' : 'none'} />
        <Kpi label="Medium (1×)" value={String(totals.medium)} sub={totals.medium ? 'due' : 'none'} />
      </div>

      <div className="filter-bar card" role="group" aria-label="Aging controls">
        <span className="muted small">Group by</span>
        <div className="seg" role="tablist">
          {(['all', 'stage', 'owner', 'urgency'] as GroupBy[]).map((g) => (
            <button key={g} role="tab" aria-selected={groupBy === g} className={`seg-btn${groupBy === g ? ' active' : ''}`} onClick={() => setGroupBy(g)}>
              {g === 'all' ? 'All items' : g === 'stage' ? 'By stage' : g === 'owner' ? 'By owner' : 'By urgency'}
            </button>
          ))}
        </div>
        <label className="small" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={breachedOnly} onChange={(e) => setBreachedOnly(e.target.checked)} /> Breached only
        </label>
      </div>

      {docs.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: 24 }}>No documents in pipeline. Items appear from their draft stage until paid.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table" aria-label="Aging documents">
            <thead><tr><th>Ref</th><th>Kind</th><th>Stage</th><th>Owner</th><th className="num">Value</th><th className="num">Days</th><th className="num">×Threshold</th><th>Urgency</th></tr></thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                {groupBy !== 'all' && <tr className="boq-section-row"><td colSpan={8}>{g.key} · {g.rows.length}</td></tr>}
                {g.rows.map((d) => (
                  <tr key={d.id} className={d.urgency === 'critical' ? 'row-flag' : ''}>
                    <td className="mono small">{d.ref}</td>
                    <td><span className={`mode-badge mode-${d.kind === 'IPC' ? 'self' : d.kind === 'RAR' ? 'sublet' : 'labor'}`}>{d.kind}</span></td>
                    <td className="small">{d.stage}</td>
                    <td className="small">{d.owner}</td>
                    <td className="num">{formatMoney(d.value)}</td>
                    <td className="num">{d.days}</td>
                    <td className="num">{d.ratio.toFixed(1)}×</td>
                    <td><span className={`urg-badge urg-${d.urgency}`}>{URGENCY_LABEL[d.urgency]}</span></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

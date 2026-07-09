import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { marginAnalytics } from '../../domain/marginanalytics';
import type { BoqItem, Allocation, ProgressUpdate, Subcontractor, Ipc, Rar } from '../../data/types';

const money = (n: number) => (n !== 0 ? formatMoney(n) : '0');

export function MarginAnalyticsTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [allocs, setAllocs] = useState<Allocation[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);

  useEffect(() => {
    let a = true;
    void Promise.all([
      provider.listBoq(projectId), provider.listAllocations(projectId), provider.listProgress(projectId),
      provider.listSubcontractors(projectId), provider.listIpcs(projectId), provider.listRars(projectId),
    ]).then(([b, al, p, s, i, r]) => { if (a) { setBoq(b); setAllocs(al); setProgress(p); setSubs(s); setIpcs(i); setRars(r); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const m = useMemo(() => marginAnalytics(boq, allocs, progress, subs, ipcs, rars), [boq, allocs, progress, subs, ipcs, rars]);
  const maxContractor = Math.max(1, ...m.topContractors.map((c) => c.value));

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Margin Analytics</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Revenue (executed) vs costs (sublet/labour incurred), gross margin, and per-contractor scorecard.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Margin summary">
        <Kpi label="Gross revenue (executed)" value={money(m.grossRevenue)} sub="client side" />
        <Kpi label="S/C cost" value={money(m.scCost)} sub="sublet contractors" />
        <Kpi label="L/O cost" value={money(m.loCost)} sub="labour-only" />
        <Kpi label="Gross margin" value={money(m.grossMargin)} sub={`${m.marginPct}% on revenue`} accent={m.grossMargin >= 0} neg={m.grossMargin < 0} />
        <Kpi label="Net working capital" value={money(m.netWorkingCapital)} sub={m.netWorkingCapital >= 0 ? 'Positive' : 'Negative'} />
      </div>

      <div className="analytics-grid">
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Top contractors by allocated value</h4>
          {m.topContractors.length === 0 ? <p className="muted small">No contractor allocation yet.</p> : (
            <div className="bar-list" aria-label="Top contractors">
              {m.topContractors.map((c) => (
                <div className="bar-row" key={c.id}>
                  <span className="bar-label">{c.name}</span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round((c.value / maxContractor) * 100)}%` }} /></span>
                  <span className="bar-val mono small">{formatMoney(c.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>Items at margin risk <span className="muted small">(contractor rate / BOQ rate &gt; 90%)</span></h4>
          {m.riskItems.length === 0 ? <p className="muted small">✓ No items at margin risk.</p> : (
            <table className="data-table" aria-label="Margin risk items">
              <thead><tr><th>Code</th><th>Description</th><th>Contractor</th><th className="num">Rate ratio</th></tr></thead>
              <tbody>
                {m.riskItems.map((r, i) => (
                  <tr key={`${r.code}-${i}`} className="row-flag">
                    <td className="mono small">{r.code}</td><td>{r.description}</td><td className="small">{r.contractor}</td>
                    <td className="num neg">{Math.round(r.ratio * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <details className="card" style={{ marginTop: 14, padding: '10px 14px' }}>
        <summary style={{ cursor: 'pointer' }}><strong>How profitability is computed</strong> <span className="muted small">(documented margin basis, req 3e(2))</span></summary>
        <div className="small" style={{ marginTop: 8, lineHeight: 1.55 }}>
          <p style={{ margin: '4px 0' }}>
            <strong>Revenue basis.</strong> Client-side revenue is the executed BOQ value certified through IPCs plus EPC price escalation,
            net of the configured retention and statutory deductions. Subcontractor RARs are expenditure — they are never netted against revenue.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Direct cost basis.</strong> Item-level cost comes from the distribution plan: sublet and labour allocations at their awarded rates;
            NLC-direct scope carries no contractor cost here and is covered by resources, overheads and plant usage in the project ledger.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Centrally procured &amp; recovered material.</strong> Material NLC issues to a contractor is NOT double-counted: its cost sits in
            Procurement (PO/CRV), and the corresponding value is <em>recovered from the contractor's RAR</em> (material recovery), which restores the margin
            at settlement. The same treatment applies to NLC machinery hired to contractors (machinery recovery). Labour-only contracts carry no
            material or machinery recovery by rule.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Margin.</strong> Item margin = BOQ value − allocated contractor cost; project margin aggregates items and is read with the
            recovery balances above. Items where the awarded rate exceeds the risk threshold of the BOQ rate are flagged in the risk list.
          </p>
        </div>
      </details>
    </div>
  );
}

function Kpi({ label, value, sub, accent, neg }: { label: string; value: string; sub?: string; accent?: boolean; neg?: boolean }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={neg ? { color: 'var(--rag-red)' } : accent ? { color: 'var(--rag-green)' } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

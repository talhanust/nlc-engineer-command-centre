import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { hrRollup, descendantNodeIds, hrByCategory } from '../domain/hr';
import type { HrPosting, OrgNode } from '../data/types';

export function HrRollupCard({ nodeId, nodes }: { nodeId: string; nodes: OrgNode[] }) {
  const { provider } = useData();
  const [hr, setHr] = useState<HrPosting[]>([]);
  useEffect(() => { provider.listAllHr().then(setHr); }, [provider]);

  const r = hrRollup(nodes, hr, nodeId);
  const cats = hrByCategory(hr, [nodeId, ...descendantNodeIds(nodes, nodeId)]);
  if (hr.length === 0) return null;

  return (
    <div className="card" aria-label="HR roll-up">
      <div className="section-head">
        <h3>HR roll-up</h3>
        <span className="muted">{r.excludesOwn ? 'own HR shown but excluded from roll-up' : 'includes this node’s own HR'}</span>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Own posted</div><div className="kpi-value">{r.own.posted}/{r.own.sanctioned}</div></div>
        <div className="kpi"><div className="kpi-label">Sub-units posted</div><div className="kpi-value">{r.descendants.posted}/{r.descendants.sanctioned}</div></div>
        <div className="kpi"><div className="kpi-label">Rolled-up posted</div><div className="kpi-value">{r.rolled.posted}/{r.rolled.sanctioned}</div></div>
        <div className="kpi"><div className="kpi-label">Vacancy (rolled)</div><div className="kpi-value">{r.rolled.sanctioned - r.rolled.posted}</div></div>
      </div>
      <table className="data-table" aria-label="HR by category">
        <thead><tr><th>Category</th><th className="num">Posted</th><th className="num">Sanctioned</th></tr></thead>
        <tbody>
          {cats.map((c) => (<tr key={c.category}><td>{c.category}</td><td className="num">{c.posted}</td><td className="num">{c.sanctioned}</td></tr>))}
        </tbody>
      </table>
    </div>
  );
}

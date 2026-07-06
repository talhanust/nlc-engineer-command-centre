import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { projectWorklist, directiveWorklist, inputAckWorklist, type WorkItem } from '../domain/worklist';
import { nodeInScope } from '../domain/access';
import { ROLE_LABEL } from '../domain/chains';
import { formatMoney } from '../domain/money';

/**
 * Loads the acting role's pending approvals across every project in the
 * signed-in user's scope. Refreshes whenever any workflow writes the audit
 * trail (the provider dispatches 'nlc:audit').
 */
export function useWorklist(): { items: WorkItem[]; loading: boolean } {
  const { provider, projects, nodes } = useData();
  const { role, user } = useRole();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const scoped = projects.filter((p) => nodeInScope(nodes, user?.nodeId ?? null, p.id));
    const all = await Promise.all(scoped.map(async (p) => {
      const [ipcs, rars, demands, procPayments] = await Promise.all([
        provider.listIpcs(p.id), provider.listRars(p.id), provider.listDemands(p.id), provider.listProcPayments(p.id),
      ]);
      const projectName = nodes.find((n) => n.id === p.id)?.name ?? p.id;
      return projectWorklist(role, { projectId: p.id, projectName, ipcs, rars, demands, procPayments });
    }));
    const [directives, markInputs] = await Promise.all([provider.listDirectives(), provider.listMarkInputs()]);
    const dirItems = directiveWorklist(
      role, directives,
      (nid) => nodeInScope(nodes, user?.nodeId ?? null, nid),
      (id) => nodes.find((n) => n.id === id)?.name ?? id,
      new Date().toISOString().slice(0, 10),
    );
    const ackItems = inputAckWorklist(user?.appointmentId, markInputs, (id) => nodes.find((n) => n.id === id)?.name ?? id);
    setItems([...ackItems, ...dirItems, ...all.flat()]);
    setLoading(false);
  }, [provider, projects, nodes, role, user?.nodeId]);

  useEffect(() => {
    void load();
    const onAudit = () => void load();
    window.addEventListener('nlc:audit', onAudit);
    return () => window.removeEventListener('nlc:audit', onAudit);
  }, [load]);

  return { items, loading };
}

/** Unified approver work-list (req 3h(4)) — pending actions across all modules. */
export function Worklist() {
  const { role } = useRole();
  const { items, loading } = useWorklist();
  const navigate = useNavigate();

  return (
    <div className="content">
      <div className="breadcrumb"><Link to="/node/hq-nlc">HQ NLC</Link><span className="sep">/</span><strong>My approvals</strong></div>
      <div className="section-head">
        <h1>My approvals — {role === 'admin' ? 'Admin' : ROLE_LABEL[role] ?? role}</h1>
        <span className="muted">{items.length} pending</span>
      </div>
      <p className="muted small">
        Every record whose next approval step belongs to your role, across all projects in your scope. Acting on an item advances it through its authorised sequence.
      </p>
      {loading ? null : items.length === 0 ? (
        <p className="muted card" style={{ padding: 16 }}>Nothing awaits {role === 'admin' ? 'Admin' : ROLE_LABEL[role] ?? role}. ✅</p>
      ) : (
        <table className="data-table" aria-label="My approvals">
          <thead><tr><th>Project</th><th>Type</th><th>Ref</th><th className="num">Amount</th><th>Awaiting</th><th></th></tr></thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id}>
                <td>{w.projectName}</td>
                <td><span className="status-pill">{w.kind}</span></td>
                <td className="mono small">{w.ref}</td>
                <td className="num">{w.amount !== undefined ? formatMoney(w.amount) : '—'}</td>
                <td>{w.action}</td>
                <td><button className="btn btn-mini" aria-label={`Open ${w.ref}`} onClick={() => navigate(w.href)}>Open →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

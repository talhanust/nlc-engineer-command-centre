import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { useToast } from './Toast';
import { ROLE_LABEL } from '../domain/chains';
import { nodeInScope } from '../domain/access';
import type { Directive, DirectiveStatus, OrgNode } from '../data/types';

const STATUS_LABEL: Record<DirectiveStatus, string> = {
  issued: 'Issued', acknowledged: 'Acknowledged', in_progress: 'In progress', complied: 'Complied', closed: 'Closed',
};
const COMMAND_ROLES = ['admin', 'pd', 'fm'];
const ASSIGNABLE = ['pm', 'fm', 'pd', 'manager_contracts'];

/**
 * Command directives: the DG / Comd Engrs / PD issues an instruction from the
 * dashboard, assigned to a role within a scope with a due date; the assignee
 * must act and respond in time. Overdue items alarm; the full response thread
 * is preserved and every step is audited.
 */
export function DirectivesPanel({ node, nodes, projectIds }: { node: OrgNode; nodes: OrgNode[]; projectIds: string[] }) {
  const { provider } = useData();
  const { role, user } = useRole();
  const { toast } = useToast();
  const [all, setAll] = useState<Directive[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [assigneeRole, setAssigneeRole] = useState('pm');
  const [assigneeNodeId, setAssigneeNodeId] = useState(node.id);
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [replyFor, setReplyFor] = useState<{ id: string; text: string; comply: boolean } | null>(null);

  async function load() { setAll(await provider.listDirectives()); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider]);

  const today = new Date().toISOString().slice(0, 10);
  const scoped = useMemo(
    () => all.filter((d) => nodeInScope(nodes, node.id, d.assigneeNodeId) || d.nodeId === node.id),
    [all, nodes, node.id],
  );
  const open = scoped.filter((d) => d.status !== 'closed');
  const overdue = open.filter((d) => d.dueDate < today && d.status !== 'complied').length;
  const canIssue = COMMAND_ROLES.includes(role);
  const canAct = (d: Directive) => (role === d.assigneeRole || role === 'admin') && d.status !== 'closed' && d.status !== 'complied';
  const canClose = (d: Directive) => canIssue && (d.status === 'complied' || role === 'admin');
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  async function issue() {
    if (title.trim().length < 3) return;
    await provider.createDirective({
      nodeId: node.id, projectId: projectId || undefined, title: title.trim(), detail: detail.trim(),
      issuedBy: user?.name ?? (role === 'admin' ? 'Admin' : ROLE_LABEL[role] ?? role),
      assigneeRole, assigneeNodeId, dueDate,
    });
    setTitle(''); setDetail(''); setShowForm(false);
    await load();
    toast({ message: 'Directive issued', kind: 'success' });
  }

  async function reply() {
    if (!replyFor || replyFor.text.trim().length < 2) return;
    const by = user?.name ?? (ROLE_LABEL[role] ?? role);
    await provider.respondDirective(replyFor.id, by, replyFor.text.trim(), replyFor.comply ? 'complied' : 'in_progress');
    setReplyFor(null);
    await load();
    toast({ message: replyFor.comply ? 'Marked complied' : 'Response recorded', kind: 'success' });
  }

  async function close(d: Directive) {
    await provider.setDirectiveStatus(d.id, 'closed', user?.name ?? role);
    await load();
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h3 style={{ display: 'inline' }}>Command directives</h3>{' '}
          {overdue > 0 && <span className="status-pill" style={{ background: 'var(--rag-red)', color: '#fff' }} aria-label={`${overdue} overdue directives`}>{overdue} overdue</span>}
        </div>
        {canIssue && <button className="btn btn-mini" aria-label="Issue directive" onClick={() => setShowForm((f) => !f)}>{showForm ? 'Cancel' : '+ Issue directive'}</button>}
      </div>

      {showForm && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 10 }}>
          <div className="create-row">
            <input aria-label="Directive title" placeholder="Instruction (e.g. Recover Sardar & Sons material balance before RAR-04)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
          </div>
          <div className="create-row">
            <textarea aria-label="Directive detail" placeholder="Detail / reference…" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
          </div>
          <div className="create-row">
            <select aria-label="Directive assignee role" value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}>
              {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
            </select>
            <select aria-label="Directive scope" value={assigneeNodeId} onChange={(e) => setAssigneeNodeId(e.target.value)}>
              {nodes.filter((n) => nodeInScope(nodes, node.id, n.id)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <select aria-label="Directive project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No specific project</option>
              {projectIds.map((p) => <option key={p} value={p}>{nodeName(p)}</option>)}
            </select>
            <input type="date" aria-label="Directive due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <button className="btn" onClick={issue} disabled={title.trim().length < 3}>Issue</button>
          </div>
        </div>
      )}

      {open.length === 0 ? (
        <p className="muted small">No open directives in this scope.</p>
      ) : (
        <table className="data-table" aria-label="Directives">
          <thead><tr><th></th><th>Directive</th><th>To</th><th>Due</th><th>Status</th><th>Last response</th><th></th></tr></thead>
          <tbody>
            {open.map((d) => {
              const late = d.dueDate < today && d.status !== 'complied';
              const last = d.responses[d.responses.length - 1];
              return (
                <tr key={d.id} className={late ? 'row-flag' : ''}>
                  <td>{late ? '⛔' : d.status === 'complied' ? '✅' : '📌'}</td>
                  <td>
                    <strong>{d.title}</strong>
                    {d.detail && <div className="muted small">{d.detail}</div>}
                    <div className="muted small">by {d.issuedBy} · {nodeName(d.nodeId)}{d.projectId ? ` · ${nodeName(d.projectId)}` : ''}</div>
                  </td>
                  <td className="small">{ROLE_LABEL[d.assigneeRole] ?? d.assigneeRole}<div className="muted small">{nodeName(d.assigneeNodeId)}</div></td>
                  <td className={`small${late ? ' neg' : ''}`}>{d.dueDate}{late ? ' ⚠' : ''}</td>
                  <td><span className={`status-pill st-${d.status === 'complied' ? 'resolved' : d.status === 'issued' ? 'open' : 'ack'}`}>{STATUS_LABEL[d.status]}</span></td>
                  <td className="small">{last ? <>{last.text.slice(0, 80)}<div className="muted small">— {last.by}, {last.at.slice(0, 10)}</div></> : <span className="muted">awaiting response</span>}</td>
                  <td>
                    {canAct(d) && <button className="btn-ghost btn-mini" aria-label={`Respond ${d.title.slice(0, 20)}`} onClick={() => setReplyFor({ id: d.id, text: '', comply: false })}>Respond…</button>}{' '}
                    {canClose(d) && <button className="btn btn-mini" aria-label={`Close ${d.title.slice(0, 20)}`} onClick={() => close(d)}>Close</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {replyFor && (
        <div className="modal-backdrop" onClick={() => setReplyFor(null)}>
          <div className="modal" role="dialog" aria-label="Respond to directive" onClick={(e) => e.stopPropagation()}>
            <h3>Respond to directive</h3>
            <textarea aria-label="Directive response" rows={3} style={{ width: '100%' }} placeholder="Action taken / compliance report…"
              value={replyFor.text} onChange={(e) => setReplyFor((r) => (r ? { ...r, text: e.target.value } : r))} />
            <label className="small" style={{ display: 'block', margin: '8px 0' }}>
              <input type="checkbox" checked={replyFor.comply} onChange={(e) => setReplyFor((r) => (r ? { ...r, comply: e.target.checked } : r))} />{' '}
              Mark as <strong>complied</strong> (task completed)
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setReplyFor(null)}>Cancel</button>
              <button className="btn" disabled={replyFor.text.trim().length < 2} onClick={reply}>Send response</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

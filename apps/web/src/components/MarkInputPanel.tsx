import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { useToast } from './Toast';
import { appointment, properChannel } from '../domain/appointments';
import type { MarkInput, OrgNode } from '../data/types';

/**
 * Mark-Input (spec §9 A9): the subordinate's recorded minute to their
 * immediate superior on the proper channel. The superior MUST acknowledge —
 * pending acknowledgements appear here and in the superior's work-list.
 */
export function MarkInputPanel({ node, projectIds }: { node: OrgNode; projectIds: string[] }) {
  const { provider, nodes } = useData();
  const { user } = useRole();
  const { toast } = useToast();
  const [inputs, setInputs] = useState<MarkInput[]>([]);
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState('');

  const myAppt = user?.appointmentId ? appointment(user.appointmentId) : undefined;
  const superior = useMemo(() => {
    if (!myAppt) return undefined;
    const chain = properChannel(myAppt.id);
    return chain[1]; // immediate superior
  }, [myAppt]);

  async function load() { setInputs(await provider.listMarkInputs()); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider]);

  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  async function send() {
    if (!user || !superior || text.trim().length < 3) return;
    await provider.createMarkInput({
      fromUser: user.name, fromAppointmentId: myAppt?.id, toAppointmentId: superior.id,
      nodeId: node.id, projectId: projectId || undefined, text: text.trim(),
    });
    setText(''); setProjectId('');
    await load();
    toast({ message: `Input marked to ${superior.title}`, kind: 'success' });
  }

  async function ack(m: MarkInput) {
    if (!user) return;
    setInputs(await provider.acknowledgeMarkInput(m.id, user.name));
  }

  // Inputs awaiting MY acknowledgement (I hold the recipient appointment).
  const awaitingMe = inputs.filter((m) => m.status === 'sent' && myAppt && m.toAppointmentId === myAppt.id);
  // Inputs I sent (most recent few).
  const mine = inputs.filter((m) => user && m.fromUser === user.name).slice(0, 6);

  if (!user) {
    return <p className="muted small">Sign in from the header user switcher to mark inputs to your superior.</p>;
  }

  return (
    <div>
      {superior ? (
        <div className="create-row">
          <input aria-label="Input text" placeholder={`Mark input to ${superior.title}…`} value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
          <select aria-label="Input project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">General</option>
            {projectIds.map((p) => <option key={p} value={p}>{nameOf(p)}</option>)}
          </select>
          <button className="btn btn-mini" onClick={send} disabled={text.trim().length < 3}>Mark input ↑</button>
        </div>
      ) : (
        <p className="muted small">Your login has no appointment on the proper channel — inputs unavailable.</p>
      )}

      {awaitingMe.length > 0 && (
        <>
          <h4 style={{ margin: '10px 0 4px' }}>Awaiting your acknowledgement <span className="neg">({awaitingMe.length})</span></h4>
          <table className="data-table" aria-label="Inputs awaiting acknowledgement">
            <thead><tr><th>From</th><th>Input</th><th>Ref</th><th>At</th><th></th></tr></thead>
            <tbody>
              {awaitingMe.map((m) => (
                <tr key={m.id} className="row-flag">
                  <td className="small">{m.fromUser}</td>
                  <td>{m.text}</td>
                  <td className="small">{m.projectId ? nameOf(m.projectId) : nameOf(m.nodeId)}</td>
                  <td className="small">{m.at.slice(0, 10)}</td>
                  <td><button className="btn btn-mini" aria-label={`Acknowledge ${m.id}`} onClick={() => ack(m)}>Acknowledge</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {mine.length > 0 && (
        <>
          <h4 style={{ margin: '10px 0 4px' }}>Your inputs</h4>
          <table className="data-table" aria-label="My inputs">
            <thead><tr><th>To</th><th>Input</th><th>Status</th></tr></thead>
            <tbody>
              {mine.map((m) => (
                <tr key={m.id}>
                  <td className="small">{appointment(m.toAppointmentId)?.title ?? m.toAppointmentId}</td>
                  <td className="small">{m.text.slice(0, 90)}</td>
                  <td>{m.status === 'acknowledged'
                    ? <span className="pos small">acknowledged by {m.ackBy} · {m.ackAt?.slice(0, 10)}</span>
                    : <span className="muted small">awaiting acknowledgement</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

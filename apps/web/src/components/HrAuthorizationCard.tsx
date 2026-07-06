import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { useToast } from './Toast';
import { ChainStatus, ChainControls } from './ApptChainControls';
import { appointment } from '../domain/appointments';
import type { HrProposal, HrProposalEntry } from '../data/types';

/**
 * Project HR authorisation (spec §2 steps 3–5, A3): Manager HR (HQ PD) drafts
 * the key appointments with grades; the ladder delegates by grade — Gr 1–16
 * terminate at Comd Engrs, Gr 17+ (and the overall TOHR) at DG NLC. Approval
 * opens the project level to project staff.
 */
export function HrAuthorizationCard({ projectId, hrApproved, onApproved }: {
  projectId: string; hrApproved?: boolean; onApproved: () => void;
}) {
  const { provider } = useData();
  const { role, user } = useRole();
  const { toast } = useToast();
  const [proposals, setProposals] = useState<HrProposal[]>([]);
  const [entries, setEntries] = useState<HrProposalEntry[]>([]);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('17');
  const [auth, setAuth] = useState('1');
  const [tohr, setTohr] = useState(false);

  const mayDraft = role === 'admin' || user?.appointmentId === 'mgr_hr_pd';
  const by = user?.name ?? role;

  async function load() { setProposals(await provider.listHrProposals(projectId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  function addEntry() {
    const g = Number(grade), a = Number(auth);
    if (!title.trim() || !Number.isFinite(g) || g < 1 || !Number.isFinite(a) || a < 1) return;
    setEntries((e) => [...e, { title: title.trim(), grade: g, auth: a }]);
    setTitle('');
  }

  async function createAndSubmit() {
    if (entries.length === 0) return;
    const h = await provider.createHrProposal(projectId, { kind: tohr ? 'tohr' : 'key_appointments', entries, by });
    await provider.submitHrProposal(projectId, h.id, by);
    setEntries([]);
    await load();
    toast({ message: 'HR proposal submitted for authorisation', kind: 'success' });
  }

  async function refreshAfter(h: HrProposal) {
    await load();
    if (h.status === 'approved') { onApproved(); toast({ message: 'HR approved — project opens to project staff', kind: 'success' }); }
  }

  const maxGrade = entries.length ? Math.max(...entries.map((e) => e.grade)) : 0;

  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div className="section-head">
        <h3>Project HR authorisation</h3>
        <span className={`status-pill ${hrApproved === false ? 'st-open' : 'st-resolved'}`}>
          {hrApproved === false ? 'awaiting approval — project closed to project staff' : 'HR approved'}
        </span>
      </div>

      {mayDraft && (
        <>
          <div className="create-row">
            <input aria-label="HR entry title" placeholder="Appointment (e.g. Senior Project Manager)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <input aria-label="HR entry grade" placeholder="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} style={{ width: 70 }} title="NLC grade — 17+ escalates to DG NLC" />
            <input aria-label="HR entry auth" placeholder="Auth" value={auth} onChange={(e) => setAuth(e.target.value)} style={{ width: 60 }} />
            <button className="btn-ghost btn-mini" aria-label="Add HR entry" onClick={addEntry}>＋ Add</button>
            <label className="small"><input type="checkbox" checked={tohr} onChange={(e) => setTohr(e.target.checked)} /> overall TOHR</label>
            <button className="btn btn-mini" aria-label="Submit HR proposal" disabled={entries.length === 0} onClick={createAndSubmit}>
              Submit for authorisation
            </button>
          </div>
          {entries.length > 0 && (
            <p className="muted small">
              {entries.map((e) => `${e.title} (Gr ${e.grade} × ${e.auth})`).join(' · ')} —{' '}
              routes to <strong>{tohr || maxGrade >= 17 ? 'DG NLC' : 'Comd Engineers (delegated)'}</strong>
            </p>
          )}
        </>
      )}

      {proposals.length === 0 ? (
        <p className="muted small">No HR proposal yet{mayDraft ? '' : ' — drafted by Manager HR (HQ PD)'}.</p>
      ) : (
        <table className="data-table" aria-label="HR proposals">
          <thead><tr><th>Proposal</th><th>Appointments</th><th>Status / chain</th><th></th></tr></thead>
          <tbody>
            {proposals.map((h) => (
              <tr key={h.id}>
                <td className="small">{h.kind === 'tohr' ? 'Overall TOHR' : 'Key appointments'}<div className="muted small">by {h.createdBy} · {h.createdAt.slice(0, 10)}</div></td>
                <td className="small">{h.entries.map((e) => `${e.title} (Gr ${e.grade})`).join(', ')}</td>
                <td>
                  <span className={`status-pill st-${h.status === 'approved' ? 'resolved' : h.status === 'in_chain' ? 'ack' : 'open'}`}>{h.status.replace('_', ' ')}</span>
                  <ChainStatus chain={h.chain} refNo={h.id} />
                </td>
                <td>
                  <ChainControls chain={h.chain} refNo={h.id} me={user?.appointmentId} isAdmin={role === 'admin'}
                    canResubmit={['mgr_hr_pd', 'pd']}
                    onAct={async () => refreshAfter(await provider.actOnHrProposal(projectId, h.id, by))}
                    onReturn={async (rm) => { await provider.returnHrProposal(projectId, h.id, by, rm); await load(); }}
                    onResubmit={async () => { await provider.resubmitHrProposal(projectId, h.id, by); await load(); }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small" style={{ marginTop: 6 }}>
        Ladder: PD recommends → SM HR (HQ Engrs) reviews → Gr 1–16: Comd Engrs approves · Gr 17+/TOHR: Comd endorses → Dir HR → DG NLC approves.
        Acting appointment: {user?.appointmentId ? appointment(user.appointmentId)?.title : 'dev mode'}.
      </p>
    </section>
  );
}

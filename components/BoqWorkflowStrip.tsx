import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { ROLE_LABEL } from '../domain/chains';
import { chainFor, pendingBoqStage, INITIAL_BOQ_WORKFLOW, type BoqWorkflowState } from '../domain/boqworkflow';

/** BOQ lifecycle: stepper + role-gated advance + lock + raise-VO. Calls onChange when lock state moves. */
export function BoqWorkflowStrip({ projectId, onChange }: { projectId: string; onChange?: (locked: boolean) => void }) {
  const { provider } = useData();
  const [wf, setWf] = useState<BoqWorkflowState>(INITIAL_BOQ_WORKFLOW);
  const [role, setRole] = useState('sqs');
  const [error, setError] = useState('');

  async function load() {
    const s = await provider.getBoqWorkflow(projectId);
    setWf(s);
    onChange?.(s.locked);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const stage = pendingBoqStage(wf);
  const chain = chainFor(wf.phase);

  async function advance() {
    setError('');
    try { const s = await provider.advanceBoqWorkflow(projectId, role); setWf(s); onChange?.(s.locked); }
    catch (e) { setError((e as Error).message); }
  }
  async function raiseVo() {
    setError('');
    try { const s = await provider.raiseBoqVo(projectId); setWf(s); onChange?.(s.locked); setRole('sqs'); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="card" aria-label="BOQ workflow">
      <div className="section-head">
        <h3>BOQ lifecycle {wf.phase === 'vo' && <span className="muted">· VO #{wf.voCount}</span>}</h3>
        {wf.locked
          ? <span className="status-pill st-paid">Locked</span>
          : <span className="status-pill st-vetted">{wf.phase === 'vo' ? 'Variation order' : 'In approval'}</span>}
      </div>

      <ol className="wf-steps">
        {chain.map((s, i) => {
          const state = wf.locked || i < wf.stageIndex ? 'done' : i === wf.stageIndex ? 'current' : 'todo';
          return (
            <li key={s.action} className={`wf-step ${state}`}>
              <span className="wf-dot" aria-hidden>{state === 'done' ? '✓' : i + 1}</span>
              <span>{s.label}</span>
            </li>
          );
        })}
      </ol>

      {wf.locked ? (
        <div className="create-row">
          <span className="muted small">BOQ is locked. A variation order unlocks it for SQS editing and re-approval.</span>
          <button className="btn-ghost" onClick={raiseVo}>Raise variation order</button>
        </div>
      ) : (
        <div className="create-row">
          <label className="small">Acting role{' '}
            <select aria-label="BOQ acting role" value={role} onChange={(e) => setRole(e.target.value)}>
              {[...new Set(chain.map((s) => s.role))].map((r) => (<option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>))}
            </select>
          </label>
          <button className="btn" onClick={advance} disabled={!stage || stage.role !== role}
            title={stage && stage.role !== role ? `Awaiting ${ROLE_LABEL[stage.role] ?? stage.role}` : ''}>
            {stage ? stage.label : '—'}
          </button>
          {error && <span className="neg small">{error}</span>}
        </div>
      )}
    </div>
  );
}

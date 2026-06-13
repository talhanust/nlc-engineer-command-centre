import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { ROLE_LABEL } from '../domain/chains';
import {
  SCHEDULE_BASELINE_CHAIN, pendingBaselineStage, INITIAL_BASELINE_WORKFLOW, type BaselineWorkflowState,
} from '../domain/schedulebaseline';

/** Baseline (Primavera) approval cycle: stepper + role-gated advance + lock + amend. */
export function ScheduleWorkflowStrip({ projectId, onChange }: { projectId: string; onChange?: (locked: boolean) => void }) {
  const { provider } = useData();
  const [wf, setWf] = useState<BaselineWorkflowState>(INITIAL_BASELINE_WORKFLOW);
  const [role, setRole] = useState('pm');
  const [error, setError] = useState('');

  async function load() {
    const s = await provider.getScheduleWorkflow(projectId);
    setWf(s); onChange?.(s.locked);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const stage = pendingBaselineStage(wf);

  async function advance() {
    setError('');
    try { const s = await provider.advanceScheduleWorkflow(projectId, role); setWf(s); onChange?.(s.locked); }
    catch (e) { setError((e as Error).message); }
  }
  async function amend() {
    setError('');
    try { const s = await provider.amendScheduleBaseline(projectId); setWf(s); onChange?.(s.locked); setRole('pm'); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="card" aria-label="Baseline workflow">
      <div className="section-head">
        <h3>Baseline approval {wf.revision > 0 && <span className="muted">· rev {wf.revision}</span>}</h3>
        {wf.locked ? <span className="status-pill st-paid">Locked</span> : <span className="status-pill st-vetted">In approval</span>}
      </div>
      <ol className="wf-steps">
        {SCHEDULE_BASELINE_CHAIN.map((s, i) => {
          const st = wf.locked || i < wf.stageIndex ? 'done' : i === wf.stageIndex ? 'current' : 'todo';
          return (<li key={s.action} className={`wf-step ${st}`}><span className="wf-dot" aria-hidden>{st === 'done' ? '✓' : i + 1}</span><span>{s.label}</span></li>);
        })}
      </ol>
      {wf.locked ? (
        <div className="create-row">
          <span className="muted small">Baseline is locked. Amending re-runs the approval cycle (new revision).</span>
          <button className="btn-ghost" onClick={amend}>Amend baseline</button>
        </div>
      ) : (
        <div className="create-row">
          <label className="small">Acting role{' '}
            <select aria-label="Baseline acting role" value={role} onChange={(e) => setRole(e.target.value)}>
              {[...new Set(SCHEDULE_BASELINE_CHAIN.map((s) => s.role))].map((r) => (<option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>))}
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

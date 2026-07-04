import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { ROLE_LABEL } from '../domain/chains';
import { MAPPING_CHAIN, pendingMappingStage, INITIAL_MAPPING_WORKFLOW } from '../domain/mappingapproval';
import type { BaselineWorkflowState } from '../domain/schedulebaseline';

export function MappingWorkflowStrip({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [wf, setWf] = useState<BaselineWorkflowState>(INITIAL_MAPPING_WORKFLOW);
  const [role, setRole] = useState('pm');
  const [error, setError] = useState('');

  async function load() { setWf(await provider.getMappingWorkflow(projectId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const stage = pendingMappingStage(wf);

  async function advance() {
    setError('');
    try { setWf(await provider.advanceMappingWorkflow(projectId, role)); }
    catch (e) { setError((e as Error).message); }
  }
  async function amend() {
    setError('');
    try { setWf(await provider.amendMapping(projectId)); setRole('pm'); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="card" aria-label="Mapping workflow">
      <div className="section-head">
        <h3>Mapping approval {wf.revision > 0 && <span className="muted">· rev {wf.revision}</span>}</h3>
        {wf.locked ? <span className="status-pill st-paid">Locked</span> : <span className="status-pill st-vetted">In approval</span>}
      </div>
      <ol className="wf-steps">
        {MAPPING_CHAIN.map((s, i) => {
          const st = wf.locked || i < wf.stageIndex ? 'done' : i === wf.stageIndex ? 'current' : 'todo';
          return (<li key={s.action} className={`wf-step ${st}`}><span className="wf-dot" aria-hidden>{st === 'done' ? '✓' : i + 1}</span><span>{s.label}</span></li>);
        })}
      </ol>
      {wf.locked ? (
        <div className="create-row">
          <span className="muted small">Mapping is locked. Changes require PD re-approval.</span>
          <button className="btn-ghost" onClick={amend}>Amend mapping</button>
        </div>
      ) : (
        <div className="create-row">
          <label className="small">Acting role{' '}
            <select aria-label="Mapping acting role" value={role} onChange={(e) => setRole(e.target.value)}>
              {[...new Set(MAPPING_CHAIN.map((s) => s.role))].map((r) => (<option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>))}
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

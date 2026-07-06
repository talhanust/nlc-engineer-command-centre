import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { useToast } from './Toast';
import { ChainStatus, ChainControls } from './ApptChainControls';
import { BASELINE_LABEL, type BaselineKind } from '../domain/apptchain';
import type { BaselineLock } from '../data/types';

/**
 * Baseline lock banner (spec §3): shows the register's lock state and drives
 * the validate→lock ladder, then revision-via-Comd-Engrs after lock. Rendered
 * atop the BOQ, Schedule and Mapping tabs. `onChange` lets the host react to
 * the locked flag (e.g. disable editing).
 */
export function BaselineLockBanner({ projectId, kind, onChange }: {
  projectId: string; kind: BaselineKind; onChange?: (locked: boolean) => void;
}) {
  const { provider } = useData();
  const { role, user } = useRole();
  const { toast } = useToast();
  const [lock, setLock] = useState<BaselineLock | null>(null);
  const by = user?.name ?? role;

  async function load() {
    const l = await provider.getBaselineLock(projectId, kind);
    setLock(l);
    onChange?.(l.status === 'locked');
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId, kind]);

  if (!lock) return null;
  const canStart = role === 'admin' || user?.appointmentId === 'sqs' || user?.appointmentId === 'planning_engr' || user?.appointmentId === 'spm';

  function set(updated: BaselineLock) {
    setLock(updated);
    onChange?.(updated.status === 'locked');
  }

  const tone = lock.status === 'locked' ? 'st-resolved' : lock.status === 'open' ? 'st-open' : 'st-ack';
  const stateText = lock.status === 'locked'
    ? `Locked${lock.revisionNo > 0 ? ` · rev ${lock.revisionNo}` : ''}${lock.lockedBy ? ` by ${lock.lockedBy}` : ''}${lock.lockedAt ? ` · ${lock.lockedAt.slice(0, 10)}` : ''}`
    : lock.status === 'open' ? 'Draft — not yet locked'
    : lock.status === 'revising' ? 'Revision in progress (Comd Engrs authorisation)'
    : 'Locking in progress';

  return (
    <section className="card" role="status" aria-label={`${BASELINE_LABEL[kind]} lock`} style={{ marginBottom: 12, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong>{BASELINE_LABEL[kind]}</strong>
        <span className={`status-pill ${tone}`}>{stateText}</span>
        <ChainStatus chain={lock.chain} refNo={`${kind}-lock`} />
        <span style={{ flex: 1 }} />
        {lock.status === 'open' && canStart && (
          <button className="btn btn-mini" aria-label={`Submit ${kind} for lock`}
            onClick={async () => { set(await provider.submitBaselineLock(projectId, kind, by)); toast({ message: 'Submitted for validation & lock', kind: 'success' }); }}>
            Submit for lock
          </button>
        )}
        {lock.status === 'locked' && (role === 'admin' || user?.appointmentId === 'spm') && (
          <button className="btn-ghost btn-mini" aria-label={`Request ${kind} revision`}
            onClick={async () => { set(await provider.requestBaselineRevision(projectId, kind, by)); toast({ message: 'Revision requested — needs Comd Engrs authorisation', kind: 'success' }); }}>
            Request revision…
          </button>
        )}
        <ChainControls chain={lock.chain} refNo={`${BASELINE_LABEL[kind]}`} me={user?.appointmentId} isAdmin={role === 'admin'}
          canResubmit={['sqs', 'planning_engr', 'spm']}
          onAct={async () => set(await provider.actOnBaselineLock(projectId, kind, by))}
          onReturn={async (rm) => set(await provider.returnBaselineLock(projectId, kind, by, rm))}
          onResubmit={async () => set(await provider.submitBaselineLock(projectId, kind, by))}
        />
      </div>
      {lock.status === 'locked' && (
        <p className="muted small" style={{ margin: '6px 0 0' }}>Editing is closed. Changes require a Comd Engrs–authorised revision.</p>
      )}
    </section>
  );
}

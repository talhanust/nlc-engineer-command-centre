import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { useRole } from '../../state/Role';
import { commercialAlerts, mergeAlertStates, recoveryAlerts, ALERT_OWNER, type TriagedAlert } from '../../domain/alerts';
import { activityDerivedProgress, divergenceAlerts, unmappedBoqAlert } from '../../domain/derivedProgress';
import { materialLeadPlan, leadTimeAlerts } from '../../domain/leadtime';
import { ROLE_LABEL } from '../../domain/chains';
import type {
  Ipc, Rar, Epc, Distribution, BoqItem, Subcontractor, BankGuarantee, BoqWbsLink,
  ScheduleActivity, ProgressUpdate, CommercialConfig, MaterialIssue, MachineryUsage, AlertState, AlertStatus,
} from '../../data/types';

const STATUS_LABEL: Record<AlertStatus, string> = { open: 'Open', ack: 'Acknowledged', resolved: 'Resolved', muted: 'Muted' };

/**
 * Alert centre (req 3i): every computed exception in one queue, routed to a
 * responsible role and trackable from flag → acknowledged → resolved. Muting
 * requires a reason and is how repeat/low-value alerts are reduced over time.
 * Detection stays computed (alerts reappear only while their condition holds);
 * triage state persists per alert id.
 */
export function AlertCentre({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const { role } = useRole();
  const [alerts, setAlerts] = useState<TriagedAlert[]>([]);
  const [filter, setFilter] = useState<'active' | AlertStatus>('active');
  const [noteFor, setNoteFor] = useState<{ id: string; status: AlertStatus; note: string } | null>(null);

  async function load() {
    const [ipcs, rars, epcs, dists, boq, subs, bgs, links, sched, progress, cfg, issues, machinery, states, matLinks, crvs] = await Promise.all([
      provider.listIpcs(projectId), provider.listRars(projectId), provider.listEpcs(projectId),
      provider.listDistributions(projectId), provider.listBoq(projectId), provider.listSubcontractors(projectId),
      provider.listBankGuarantees(projectId), provider.listBoqWbs(projectId), provider.listSchedule(projectId),
      provider.listProgress(projectId), provider.getCommercialConfig(projectId),
      provider.listMaterialIssues(projectId), provider.listMachineryUsage(projectId), provider.listAlertStates(projectId),
      provider.listBoqMaterial(projectId), provider.listCrvs(projectId),
    ] as [
      Promise<Ipc[]>, Promise<Rar[]>, Promise<Epc[]>, Promise<Distribution[]>, Promise<BoqItem[]>, Promise<Subcontractor[]>,
      Promise<BankGuarantee[]>, Promise<BoqWbsLink[]>, Promise<ScheduleActivity[]>, Promise<ProgressUpdate[]>,
      Promise<CommercialConfig>, Promise<MaterialIssue[]>, Promise<MachineryUsage[]>, Promise<AlertState[]>,
      Promise<import('../../data/types').BoqMaterialLink[]>, Promise<import('../../data/types').Crv[]>,
    ]);
    const rows = activityDerivedProgress(sched, boq, links, progress, new Date().toISOString().slice(0, 10));
    const um = unmappedBoqAlert(boq, links);
    const computed = [
      ...commercialAlerts({ ipcs, rars, epcs, dists, boq, subs, bgs }),
      ...divergenceAlerts(rows, cfg.divergenceTolerancePct ?? 10),
      ...(um ? [um] : []),
      ...recoveryAlerts(issues, machinery),
      ...leadTimeAlerts(materialLeadPlan({ items: boq, matLinks, wbsLinks: links, sched, progress, crvs, issues, asOf: new Date().toISOString().slice(0, 10) })),
    ];
    setAlerts(mergeAlertStates(computed, states));
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const visible = useMemo(() => {
    const bySeverity = [...alerts].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
    if (filter === 'active') return bySeverity.filter((a) => a.status === 'open' || a.status === 'ack');
    return bySeverity.filter((a) => a.status === filter);
  }, [alerts, filter]);

  const counts = useMemo(() => ({
    active: alerts.filter((a) => a.status === 'open' || a.status === 'ack').length,
    resolved: alerts.filter((a) => a.status === 'resolved').length,
    muted: alerts.filter((a) => a.status === 'muted').length,
  }), [alerts]);

  function mayAct(a: TriagedAlert) { return role === 'admin' || role === a.owner; }

  async function setStatus(a: TriagedAlert, status: AlertStatus, note?: string) {
    await provider.setAlertState(projectId, { alertId: a.id, status, by: role, note });
    await load();
    toast({ message: `${a.title} → ${STATUS_LABEL[status]}`, kind: 'success' });
  }

  function act(a: TriagedAlert, status: AlertStatus) {
    if (status === 'resolved' || status === 'muted') setNoteFor({ id: a.id, status, note: '' });
    else void setStatus(a, status);
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Alert centre</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Exceptions routed to the responsible role; trackable flag → acknowledged → resolved. Alerts re-raise while their condition holds.
          </p>
        </div>
        <div className="head-tools">
          <select aria-label="Alert filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="active">Active ({counts.active})</option>
            <option value="resolved">Resolved ({counts.resolved})</option>
            <option value="muted">Muted ({counts.muted})</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted" style={{ padding: 12 }}>No {filter === 'active' ? 'active' : filter} alerts. ✅</p>
      ) : (
        <table className="data-table" aria-label="Alert centre">
          <thead><tr><th></th><th>Alert</th><th>Detail</th><th>Owner</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id} className={a.severity === 'critical' ? 'row-flag' : ''}>
                <td>{a.severity === 'critical' ? '⛔' : '⚠'}</td>
                <td><strong>{a.title}</strong></td>
                <td className="small">{a.detail}{a.note ? <em className="muted"> — {a.note}</em> : null}</td>
                <td className="small">{ROLE_LABEL[a.owner] ?? a.owner}</td>
                <td><span className={`status-pill st-${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
                <td>
                  {!mayAct(a) ? (
                    <span className="muted small">for {ROLE_LABEL[a.owner] ?? a.owner}</span>
                  ) : a.status === 'open' ? (
                    <>
                      <button className="btn-ghost btn-mini" aria-label={`Acknowledge ${a.id}`} onClick={() => act(a, 'ack')}>Acknowledge</button>{' '}
                      <button className="btn btn-mini" aria-label={`Resolve ${a.id}`} onClick={() => act(a, 'resolved')}>Resolve…</button>{' '}
                      <button className="btn-ghost btn-mini" aria-label={`Mute ${a.id}`} onClick={() => act(a, 'muted')}>Mute…</button>
                    </>
                  ) : a.status === 'ack' ? (
                    <>
                      <button className="btn btn-mini" aria-label={`Resolve ${a.id}`} onClick={() => act(a, 'resolved')}>Resolve…</button>{' '}
                      <button className="btn-ghost btn-mini" aria-label={`Mute ${a.id}`} onClick={() => act(a, 'muted')}>Mute…</button>
                    </>
                  ) : (
                    <button className="btn-ghost btn-mini" aria-label={`Reopen ${a.id}`} onClick={() => act(a, 'open')}>Reopen</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {noteFor && (
        <div className="modal-backdrop" onClick={() => setNoteFor(null)}>
          <div className="modal" role="dialog" aria-label={noteFor.status === 'muted' ? 'Mute alert' : 'Resolve alert'} onClick={(e) => e.stopPropagation()}>
            <h3>{noteFor.status === 'muted' ? 'Mute alert' : 'Resolve alert'}</h3>
            <p className="muted small">{noteFor.status === 'muted'
              ? 'Muting hides a repeat/low-value alert from the active queue. State the reason — it is recorded in the audit trail.'
              : 'Describe how the exception was resolved — it is recorded in the audit trail.'}</p>
            <textarea aria-label="Alert note" rows={3} style={{ width: '100%' }} placeholder="Reason…"
              value={noteFor.note} onChange={(e) => setNoteFor((n) => (n ? { ...n, note: e.target.value } : n))} />
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setNoteFor(null)}>Cancel</button>
              <button className="btn" disabled={noteFor.note.trim().length < 3}
                onClick={() => { const a = alerts.find((x) => x.id === noteFor.id); if (a) void setStatus(a, noteFor.status, noteFor.note.trim()); setNoteFor(null); }}>
                {noteFor.status === 'muted' ? 'Mute' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="muted small" style={{ marginTop: 10 }}>
        Routing: {Object.entries(ALERT_OWNER).map(([sub, r]) => `${sub} → ${ROLE_LABEL[r] ?? r}`).join(' · ')}
      </p>
    </div>
  );
}

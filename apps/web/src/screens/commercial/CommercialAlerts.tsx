import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { commercialAlerts, alertCounts, mergeAlertStates, activeAlerts } from '../../domain/alerts';
import { activityDerivedProgress, divergenceAlerts, unmappedBoqAlert } from '../../domain/derivedProgress';
import type { AlertState } from '../../data/types';
import type { Ipc, Rar, Epc, Distribution, BoqItem, Subcontractor, BankGuarantee, BoqWbsLink, ScheduleActivity, ProgressUpdate, CommercialConfig } from '../../data/types';

export function CommercialAlerts({ projectId, onNavigate }: { projectId: string; onNavigate: (sub: string) => void }) {
  const { provider } = useData();
  const [data, setData] = useState<{ ipcs: Ipc[]; rars: Rar[]; epcs: Epc[]; dists: Distribution[]; boq: BoqItem[]; subs: Subcontractor[]; bgs: BankGuarantee[]; links: BoqWbsLink[]; sched: ScheduleActivity[]; progress: ProgressUpdate[]; cfg: CommercialConfig; states: AlertState[] } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let a = true;
    const loadAll = () => {
      void Promise.all([
        provider.listIpcs(projectId), provider.listRars(projectId), provider.listEpcs(projectId),
        provider.listDistributions(projectId), provider.listBoq(projectId), provider.listSubcontractors(projectId), provider.listBankGuarantees(projectId),
        provider.listBoqWbs(projectId), provider.listSchedule(projectId), provider.listProgress(projectId), provider.getCommercialConfig(projectId), provider.listAlertStates(projectId),
      ]).then(([ipcs, rars, epcs, dists, boq, subs, bgs, links, sched, progress, cfg, states]) => { if (a) setData({ ipcs, rars, epcs, dists, boq, subs, bgs, links, sched, progress, cfg, states }); });
    };
    loadAll();
    const onAudit = loadAll;
    window.addEventListener('nlc:audit', onAudit);
    return () => { a = false; window.removeEventListener('nlc:audit', onAudit); };
  }, [provider, projectId]);

  const alerts = useMemo(() => {
    if (!data) return [];
    const base = commercialAlerts(data);
    const rows = activityDerivedProgress(data.sched, data.boq, data.links, data.progress, new Date().toISOString().slice(0, 10));
    const dv = divergenceAlerts(rows, data.cfg.divergenceTolerancePct ?? 10);
    const um = unmappedBoqAlert(data.boq, data.links);
    // Alert-centre lifecycle: resolved/muted alerts leave the banner (req 3i(2)).
    return activeAlerts(mergeAlertStates([...base, ...dv, ...(um ? [um] : [])], data.states));
  }, [data]);
  const counts = alertCounts(alerts);
  if (counts.total === 0) return null;

  const worst = counts.critical > 0 ? 'critical' : 'warning';
  return (
    <div className={`alert-banner sev-${worst}`} role="status" aria-label="Commercial alerts">
      <button className="alert-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="alert-dot" aria-hidden>{worst === 'critical' ? '⛔' : '⚠'}</span>
        <span className="alert-text">
          <strong>{counts.total} item{counts.total === 1 ? '' : 's'} need attention</strong>
          <span className="muted small">{counts.critical ? `${counts.critical} critical` : ''}{counts.critical && counts.warning ? ' · ' : ''}{counts.warning ? `${counts.warning} warning` : ''}</span>
        </span>
        <span className="alert-chevron" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className={`alert-item sev-${a.severity}`}>
              <button onClick={() => onNavigate(a.sub)}>
                <span className={`alert-pip sev-${a.severity}`} aria-hidden />
                <span><strong>{a.title}</strong><span className="muted small"> — {a.detail}</span></span>
                <span className="alert-go" aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

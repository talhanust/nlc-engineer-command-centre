import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { commercialAlerts, alertCounts } from '../../domain/alerts';
import type { Ipc, Rar, Epc, Distribution, BoqItem, Subcontractor, BankGuarantee } from '../../data/types';

export function CommercialAlerts({ projectId, onNavigate }: { projectId: string; onNavigate: (sub: string) => void }) {
  const { provider } = useData();
  const [data, setData] = useState<{ ipcs: Ipc[]; rars: Rar[]; epcs: Epc[]; dists: Distribution[]; boq: BoqItem[]; subs: Subcontractor[]; bgs: BankGuarantee[] } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let a = true;
    void Promise.all([
      provider.listIpcs(projectId), provider.listRars(projectId), provider.listEpcs(projectId),
      provider.listDistributions(projectId), provider.listBoq(projectId), provider.listSubcontractors(projectId), provider.listBankGuarantees(projectId),
    ]).then(([ipcs, rars, epcs, dists, boq, subs, bgs]) => { if (a) setData({ ipcs, rars, epcs, dists, boq, subs, bgs }); });
    const onAudit = () => {
      void Promise.all([
        provider.listIpcs(projectId), provider.listRars(projectId), provider.listEpcs(projectId),
        provider.listDistributions(projectId), provider.listBoq(projectId), provider.listSubcontractors(projectId), provider.listBankGuarantees(projectId),
      ]).then(([ipcs, rars, epcs, dists, boq, subs, bgs]) => { if (a) setData({ ipcs, rars, epcs, dists, boq, subs, bgs }); });
    };
    window.addEventListener('nlc:audit', onAudit);
    return () => { a = false; window.removeEventListener('nlc:audit', onAudit); };
  }, [provider, projectId]);

  const alerts = useMemo(() => (data ? commercialAlerts(data) : []), [data]);
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

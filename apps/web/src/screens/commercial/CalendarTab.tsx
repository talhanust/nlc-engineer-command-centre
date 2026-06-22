import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney, toNum } from '../../domain/money';
import { commercialCalendar, groupByHorizon, HORIZON_LABEL, type CalEvent, type CalHorizons } from '../../domain/calendar';
import { retentionSummary } from '../../domain/retention';
import { revisedContractValue } from '../../domain/variations';
import { SkeletonRows } from '../../components/Skeleton';
import type { BankGuarantee, Ipc, Variation } from '../../data/types';

const KIND_ICON: Record<string, string> = { bg_expiry: '🛡️', retention_completion: '💰', retention_dlp: '🔓' };

export function CalendarTab({ projectId, onNavigate }: { projectId: string; onNavigate?: (sub: string) => void }) {
  const { provider, projects } = useData();
  const [bgs, setBgs] = useState<BankGuarantee[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [vos, setVos] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let a = true;
    void Promise.all([provider.listBankGuarantees(projectId), provider.listIpcs(projectId), provider.listVariations(projectId)])
      .then(([b, i, v]) => { if (a) { setBgs(b); setIpcs(i); setVos(v); setLoading(false); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const project = projects.find((p) => p.id === projectId);
  const events = useMemo(() => {
    const bac = revisedContractValue(toNum(project?.contractValue ?? '0'), vos);
    const held = retentionSummary(ipcs, bac).deducted;
    return commercialCalendar({ bgs, completionDate: project?.completionDate, retentionHeld: held });
  }, [bgs, ipcs, vos, project]);

  const horizons = useMemo(() => groupByHorizon(events), [events]);
  const next30 = horizons.overdue.length + horizons.soon.length;
  const atRisk = [...horizons.overdue, ...horizons.soon].reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Commercial Calendar</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Forward view of bank-guarantee expiries and scheduled retention releases, so nothing lapses unnoticed.</p>
        </div>
      </div>

      <div className="kpi-row" aria-label="Calendar summary">
        <Kpi label="Due in 30 days" value={String(next30)} sub={horizons.overdue.length ? `${horizons.overdue.length} overdue` : 'none overdue'} neg={horizons.overdue.length > 0} />
        <Kpi label="Next 90 days" value={String(horizons.upcoming.length)} sub="upcoming events" />
        <Kpi label="Value in next 30 days" value={atRisk > 0 ? formatMoney(atRisk) : '0'} sub="BG cover + retention" />
        <Kpi label="Total scheduled" value={String(events.length)} sub="all future events" />
      </div>

      {loading ? <SkeletonRows rows={4} cols={3} /> : events.length === 0 ? (
        <p className="muted" style={{ padding: 16 }}>No upcoming guarantee expiries or retention releases. Register a bank guarantee or accrue retention to populate the calendar.</p>
      ) : (
        (['overdue', 'soon', 'upcoming', 'later'] as (keyof CalHorizons)[]).map((h) => (
          horizons[h].length > 0 && (
            <div key={h} className="cal-horizon">
              <h4 className={`cal-horizon-title ${h === 'overdue' ? 'overdue' : ''}`}>{HORIZON_LABEL[h]} <span className="muted small">· {horizons[h].length}</span></h4>
              <ul className="cal-list">
                {horizons[h].map((e) => <CalRow key={e.id} e={e} onNavigate={onNavigate} />)}
              </ul>
            </div>
          )
        ))
      )}
    </div>
  );
}

function CalRow({ e, onNavigate }: { e: CalEvent; onNavigate?: (sub: string) => void }) {
  const days = e.daysUntil < 0 ? `${Math.abs(e.daysUntil)}d overdue` : e.daysUntil === 0 ? 'today' : `in ${e.daysUntil}d`;
  return (
    <li className={`cal-row sev-${e.severity}`}>
      <button onClick={() => onNavigate?.(e.sub)}>
        <span className="cal-icon" aria-hidden>{KIND_ICON[e.kind]}</span>
        <span className="cal-date mono small">{e.date}</span>
        <span className="cal-main"><strong>{e.title}</strong><span className="muted small">{e.detail}</span></span>
        <span className={`cal-when ${e.daysUntil < 0 ? 'neg' : ''}`}>{days}</span>
        {e.amount ? <span className="cal-amount mono small">{formatMoney(e.amount)}</span> : null}
      </button>
    </li>
  );
}

function Kpi({ label, value, sub, neg }: { label: string; value: string; sub?: string; neg?: boolean }) {
  return (<div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={neg ? { color: 'var(--rag-red)' } : undefined}>{value}</div>{sub && <div className="muted small">{sub}</div>}</div>);
}

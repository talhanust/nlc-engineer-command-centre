import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { dataHealth, type HealthLevel } from '../domain/dataHealth';
import { materialRegister } from '../domain/materialRegister';
import { formatMoney } from '../domain/money';
import type { BoqItem, BoqWbsLink, ScheduleActivity, ProgressUpdate } from '../data/types';

const TAB_FOR: Record<string, string> = { mapping: 'mapping', schedule: 'execution', stock: 'procurement', progress: 'execution' };

/**
 * Compact cross-module data-quality banner for the project executive view:
 * unmapped BOQ value, oversold stock, pending progress, missing baseline.
 * Each issue deep-links to the tab where it's fixed. Hidden when all clear.
 */
export function DataHealthBanner({ nodeId }: { nodeId: string }) {
  const { provider } = useData();
  const navigate = useNavigate();
  const [input, setInput] = useState<Parameters<typeof dataHealth>[0] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [boq, links, schedule, progress, crvs, demands, pos, issues] = await Promise.all([
        provider.listBoq(nodeId),
        provider.listBoqWbs(nodeId),
        provider.listSchedule(nodeId),
        provider.listProgress(nodeId),
        provider.listCrvs(nodeId),
        provider.listDemands(nodeId),
        provider.listPurchaseOrders(nodeId),
        provider.listMaterialIssues(nodeId),
      ]) as [BoqItem[], BoqWbsLink[], ScheduleActivity[], ProgressUpdate[], Awaited<ReturnType<typeof provider.listCrvs>>, Awaited<ReturnType<typeof provider.listDemands>>, Awaited<ReturnType<typeof provider.listPurchaseOrders>>, Awaited<ReturnType<typeof provider.listMaterialIssues>>];
      const linked = new Set(links.map((l) => l.boqItemId));
      const unmapped = boq.filter((b) => !linked.has(b.id));
      const reg = materialRegister(crvs, demands, pos, issues);
      if (!alive) return;
      setInput({
        boqCount: boq.length,
        boqValue: boq.reduce((s, b) => s + b.amount, 0),
        unmappedCount: unmapped.length,
        unmappedValue: unmapped.reduce((s, b) => s + b.amount, 0),
        scheduleCount: schedule.length,
        negativeStockCodes: reg.negativeCodes,
        pendingProgress: progress.filter((p) => p.status === 'draft').length,
        fmtMoney: formatMoney,
      });
    }
    void load();
    const onAudit = () => void load();
    window.addEventListener('nlc:audit', onAudit);
    return () => { alive = false; window.removeEventListener('nlc:audit', onAudit); };
  }, [provider, nodeId]);

  const health = useMemo(() => (input ? dataHealth(input) : null), [input]);
  if (!health || health.issues === 0) return null;

  const worst: HealthLevel = health.worst;
  const issues = health.checks.filter((c) => c.level !== 'ok');
  const crit = issues.filter((c) => c.level === 'critical').length;
  const warn = issues.filter((c) => c.level === 'warning').length;

  return (
    <div className={`alert-banner sev-${worst}`} role="status" aria-label="Data health">
      <button className="alert-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="alert-dot" aria-hidden>{worst === 'critical' ? '⛔' : '⚠'}</span>
        <span className="alert-text">
          <strong>Data health — {health.issues} item{health.issues === 1 ? '' : 's'} to clean up</strong>
          <span className="muted small">{crit ? `${crit} critical` : ''}{crit && warn ? ' · ' : ''}{warn ? `${warn} warning` : ''}</span>
        </span>
        <span className="alert-chevron" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="alert-list">
          {issues.map((c) => (
            <li key={c.id} className={`alert-item sev-${c.level === 'critical' ? 'critical' : 'warning'}`}>
              <button onClick={() => navigate(`/node/${nodeId}/${TAB_FOR[c.id] ?? 'mapping'}`)}>
                <span className={`alert-pip sev-${c.level === 'critical' ? 'critical' : 'warning'}`} aria-hidden />
                <span><strong>{c.label}</strong><span className="muted small"> — {c.detail}</span></span>
                <span className="alert-go" aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

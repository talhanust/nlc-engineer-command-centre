import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { useToast } from './Toast';
import { formatMoney } from '../domain/money';
import { STAGE_LABEL, STAGES, projectStage, receivable, readyToClose, stageTotals } from '../domain/lifecycle';
import type { OrgNode, Project, ProjectStage } from '../data/types';

export type StageFilter = 'all' | ProjectStage;

/** Four-total strip: All · Ongoing · Physically completed (Recovery) · Financially closed — click drills. */
export function StageStrip({ projects, value, onChange }: { projects: Project[]; value: StageFilter; onChange: (s: StageFilter) => void }) {
  const t = useMemo(() => stageTotals(projects), [projects]);
  const cards: Array<[StageFilter, string, typeof t.all]> = [
    ['all', 'All projects', t.all],
    ['ongoing', STAGE_LABEL.ongoing, t.ongoing],
    ['physically_completed', STAGE_LABEL.physically_completed, t.physically_completed],
    ['financially_closed', STAGE_LABEL.financially_closed, t.financially_closed],
  ];
  return (
    <div className="kpi-grid" role="group" aria-label="Lifecycle totals">
      {cards.map(([id, label, tot]) => (
        <button key={id} className={`kpi-card kpi-click${value === id ? ' kpi-active' : ''}`} aria-pressed={value === id}
          aria-label={`${label} totals`} onClick={() => onChange(id)}>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{tot.count} <span className="muted" style={{ fontSize: 13 }}>proj</span></div>
          <div className="muted small">CV {formatMoney(tot.contractValue)} · billed {formatMoney(tot.billed)}</div>
          <div className="muted small">received {formatMoney(tot.received)}{tot.receivable > 0 ? <> · <span className="neg">recv {formatMoney(tot.receivable)}</span></> : null}</div>
        </button>
      ))}
    </div>
  );
}

/**
 * Lifecycle panel per stage filter:
 *  ongoing               → Issue TOC (moves the project into Recovery);
 *  physically_completed  → the RECOVERY register: receivable, liabilities,
 *                          ready-to-close gate, Mark financially closed;
 *  financially_closed    → the closed archive (admin may reopen).
 */
export function LifecyclePanel({ nodes, projects, stage, onChanged }: {
  nodes: OrgNode[]; projects: Project[]; stage: StageFilter; onChanged: () => void;
}) {
  const { provider } = useData();
  const { role } = useRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [liab, setLiab] = useState<Record<string, number>>({});
  const commander = role === 'admin' || role === 'pd' || role === 'fm';
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  const shown = useMemo(
    () => (stage === 'all' ? [] : projects.filter((p) => projectStage(p) === stage)),
    [projects, stage],
  );

  useEffect(() => {
    let a = true;
    if (stage !== 'physically_completed') return;
    void (async () => {
      const out: Record<string, number> = {};
      for (const p of shown) {
        const ls = await provider.listLiabilities(p.id);
        out[p.id] = ls.reduce((s, l) => s + l.amount, 0);
      }
      if (a) setLiab(out);
    })();
    return () => { a = false; };
  }, [provider, shown, stage]);

  if (stage === 'all' || shown.length === 0) return null;

  async function move(p: Project, to: ProjectStage, label: string) {
    await provider.setProjectStage(p.id, to);
    toast({ message: `${nameOf(p.id)} → ${label}`, kind: 'success' });
    onChanged();
  }

  if (stage === 'ongoing') {
    return (
      <div style={{ marginTop: 10 }}>
        <p className="muted small">Issuing the Taking-Over Certificate moves a project into the Recovery section.</p>
        <table className="data-table" aria-label="Ongoing projects">
          <thead><tr><th>Project</th><th className="num">Physical %</th><th className="num">Billed</th><th className="num">Receivable</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td className="row-link" onClick={() => navigate(`/node/${p.id}`)}>{nameOf(p.id)}</td>
                <td className="num">{p.actualPct}%</td>
                <td className="num">{formatMoney(Number(p.billedToDate))}</td>
                <td className="num">{formatMoney(receivable(p))}</td>
                <td>{commander && (
                  <button className="btn-ghost btn-mini" aria-label={`Issue TOC ${p.id}`}
                    disabled={p.actualPct < 100}
                    title={p.actualPct < 100 ? 'Physical progress must reach 100% before TOC' : 'Issue Taking-Over Certificate'}
                    onClick={() => move(p, 'physically_completed', 'Physically completed (Recovery)')}>
                    Issue TOC…
                  </button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (stage === 'physically_completed') {
    return (
      <div style={{ marginTop: 10 }}>
        <p className="muted small">
          <strong>Recovery section</strong> — TOC issued; collect the receivable, release retention, clear liabilities. A project may financially close only when the receivable and liabilities are both zero.
        </p>
        <table className="data-table" aria-label="Recovery section">
          <thead><tr><th>Project</th><th>TOC date</th><th className="num">Billed</th><th className="num">Received</th><th className="num">Receivable</th><th className="num">Liabilities</th><th>Ready</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => {
              const rec = receivable(p);
              const lb = liab[p.id] ?? 0;
              const ready = readyToClose(p, lb);
              return (
                <tr key={p.id} className={rec > 0 || lb > 0 ? 'row-flag' : ''}>
                  <td className="row-link" onClick={() => navigate(`/node/${p.id}/financial`)}>{nameOf(p.id)}</td>
                  <td className="small">{p.tocDate ?? '—'}</td>
                  <td className="num">{formatMoney(Number(p.billedToDate))}</td>
                  <td className="num">{formatMoney(Number(p.receivedToDate))}</td>
                  <td className={`num${rec > 0 ? ' neg' : ''}`}>{formatMoney(rec)}</td>
                  <td className={`num${lb > 0 ? ' neg' : ''}`}>{formatMoney(lb)}</td>
                  <td>{ready ? '✅' : <span className="muted small">recover first</span>}</td>
                  <td>{commander && (
                    <button className="btn btn-mini" aria-label={`Close ${p.id}`} disabled={!ready}
                      title={ready ? 'Archive as financially closed' : 'Receivable and liabilities must be zero'}
                      onClick={() => move(p, 'financially_closed', 'Financially closed')}>
                      Mark financially closed
                    </button>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <p className="muted small">Financially closed — receivable collected and liabilities cleared. Archived; figures remain in the all-projects totals.</p>
      <table className="data-table" aria-label="Financially closed projects">
        <thead><tr><th>Project</th><th>TOC date</th><th>Closed on</th><th className="num">Contract value</th><th className="num">Received</th><th></th></tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td className="row-link" onClick={() => navigate(`/node/${p.id}`)}>{nameOf(p.id)}</td>
              <td className="small">{p.tocDate ?? '—'}</td>
              <td className="small">{p.financialCloseDate ?? '—'}</td>
              <td className="num">{formatMoney(Number(p.contractValue))}</td>
              <td className="num">{formatMoney(Number(p.receivedToDate))}</td>
              <td>{role === 'admin' && (
                <button className="btn-ghost btn-mini" aria-label={`Reopen ${p.id}`}
                  onClick={() => move(p, 'physically_completed', 'reopened to Recovery')}>Reopen</button>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { STAGES };

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { useToast } from './Toast';
import { formatMoney } from '../domain/money';
import { STAGE_LABEL, STAGES, projectStage, receivable, readyToClose, stageTotals } from '../domain/lifecycle';
import { DEFAULT_COMMERCIAL_CONFIG } from '../domain/ipc';
import { finalBillRecon, type FinalBillSummary } from '../domain/finalbill';
import type { DlpDefect } from '../data/types';
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
  const [retention, setRetention] = useState<Record<string, number>>({});
  const [defects, setDefects] = useState<Record<string, DlpDefect[]>>({});
  const [detailFor, setDetailFor] = useState<Project | null>(null);
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
      const ret: Record<string, number> = {};
      const dfs: Record<string, DlpDefect[]> = {};
      for (const p of shown) {
        const [ls, ipcs, cfg, dd] = await Promise.all([
          provider.listLiabilities(p.id), provider.listIpcs(p.id), provider.getCommercialConfig(p.id),
          provider.listDlpDefects(p.id),
        ]);
        out[p.id] = ls.reduce((s, l) => s + l.amount, 0);
        const pct = (cfg.ipcRetentionPct ?? DEFAULT_COMMERCIAL_CONFIG.ipcRetentionPct) / 100;
        ret[p.id] = ipcs.reduce((s, i) => s + i.gross, 0) * pct;
        dfs[p.id] = dd;
      }
      if (a) { setLiab(out); setRetention(ret); setDefects(dfs); }
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
    const dlpEnd = (toc?: string) => {
      if (!toc) return null;
      const d = new Date(toc);
      d.setMonth(d.getMonth() + 12); // 12-month Defect Liability Period
      return d.toISOString().slice(0, 10);
    };
    const today = new Date().toISOString().slice(0, 10);
    return (
      <div style={{ marginTop: 10 }}>
        <p className="muted small">
          <strong>Recovery section</strong> — TOC issued; collect the receivable, release retention (½ on TOC, ½ after the 12-month DLP), clear liabilities. A project may financially close only when the receivable and liabilities are both zero.
        </p>
        <table className="data-table" aria-label="Recovery section">
          <thead><tr><th>Project</th><th>TOC date</th><th className="num">Receivable</th><th className="num">Liabilities</th><th className="num">Retention held</th><th className="num">Releasable now</th><th>2nd half after DLP</th><th>DLP defects</th><th>Ready</th><th></th></tr></thead>
          <tbody>
            {shown.map((p) => {
              const rec = receivable(p);
              const lb = liab[p.id] ?? 0;
              const held0 = defects[p.id] ?? [];
              const ready = readyToClose(p, lb, held0.filter((x) => x.status === 'open').length);
              const held = retention[p.id] ?? 0;
              const dlp = dlpEnd(p.tocDate);
              const dlpPast = dlp !== null && dlp <= today;
              const releasableNow = held * 0.5 + (dlpPast ? held * 0.5 : 0);
              const dd = defects[p.id] ?? [];
              const openD = dd.filter((x) => x.status === 'open').length;
              return (
                <tr key={p.id} className={rec > 0 || lb > 0 ? 'row-flag' : ''}>
                  <td className="row-link" onClick={() => navigate(`/node/${p.id}/financial`)}>{nameOf(p.id)}</td>
                  <td className="small">{p.tocDate ?? '—'}</td>
                  <td className={`num${rec > 0 ? ' neg' : ''}`}>{formatMoney(rec)}</td>
                  <td className={`num${lb > 0 ? ' neg' : ''}`}>{formatMoney(lb)}</td>
                  <td className="num">{formatMoney(held)}</td>
                  <td className="num pos">{formatMoney(releasableNow)}</td>
                  <td className="small">{dlp ? (dlpPast ? <span className="pos">DLP expired — release due</span> : `due ${dlp}`) : '—'}</td>
                  <td>
                    <button className="link-btn" aria-label={`DLP defects ${p.id}`} onClick={() => setDetailFor(p)}>
                      {openD > 0 ? <span className="neg">{openD} open</span> : <span className="muted">{dd.length ? 'all rectified' : 'none'}</span>}
                    </button>
                  </td>
                  <td>{ready ? '✅' : <span className="muted small">{openD > 0 ? 'defects open' : 'recover first'}</span>}</td>
                  <td>{commander && (
                    <button className="btn btn-mini" aria-label={`Close ${p.id}`} disabled={!ready}
                      title={ready ? 'Archive as financially closed' : 'Receivable, liabilities and open DLP defects must all be zero'}
                      onClick={() => move(p, 'financially_closed', 'Financially closed')}>
                      Mark financially closed
                    </button>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {detailFor && (
          <RecoveryDetailModal
            project={detailFor}
            name={nameOf(detailFor.id)}
            onClose={() => setDetailFor(null)}
            onChanged={async () => setDefects((d) => ({ ...d }))}
            reload={async () => {
              const dd = await provider.listDlpDefects(detailFor.id);
              setDefects((prev) => ({ ...prev, [detailFor.id]: dd }));
            }}
          />
        )}
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

/**
 * Recovery detail — the work between TOC and financial close:
 * the DLP defect register (raise, rectify) and the final-bill reconciliation
 * (authorised BOQ+VO quantities vs quantities claimed through IPCs).
 */
function RecoveryDetailModal({ project, name, onClose, reload }: {
  project: Project; name: string; onClose: () => void; onChanged?: () => Promise<void>; reload: () => Promise<void>;
}) {
  const { provider } = useData();
  const { role } = useRole();
  const { toast } = useToast();
  const [defects, setDefects] = useState<DlpDefect[]>([]);
  const [recon, setRecon] = useState<FinalBillSummary | null>(null);
  const [desc, setDesc] = useState('');
  const [loc, setLoc] = useState('');
  const [sev, setSev] = useState<'minor' | 'major'>('minor');
  const commander = role === 'admin' || role === 'pd' || role === 'fm' || role === 'pm';

  useEffect(() => {
    let a = true;
    void (async () => {
      const [dd, items, ipcs, variations] = await Promise.all([
        provider.listDlpDefects(project.id), provider.listBoq(project.id),
        provider.listIpcs(project.id), provider.listVariations(project.id),
      ]);
      if (!a) return;
      setDefects(dd);
      setRecon(finalBillRecon(items, ipcs, variations));
    })();
    return () => { a = false; };
  }, [provider, project.id]);

  async function raise() {
    if (desc.trim().length < 3) return;
    await provider.createDlpDefect(project.id, {
      raised: new Date().toISOString().slice(0, 10), description: desc.trim(),
      location: loc.trim() || undefined, severity: sev,
    });
    setDesc(''); setLoc('');
    setDefects(await provider.listDlpDefects(project.id));
    await reload();
    toast({ message: 'Defect raised', kind: 'success' });
  }

  async function setStatus(d: DlpDefect, status: DlpDefect['status']) {
    setDefects(await provider.setDlpDefectStatus(project.id, d.id, status));
    await reload();
  }

  const open = defects.filter((d) => d.status === 'open').length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={`Recovery detail ${name}`} style={{ maxWidth: 900, width: '94%' }} onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>{name} — DLP & final bill</h3>
          <button className="btn-ghost btn-mini" onClick={onClose}>Close</button>
        </div>

        <h4 style={{ margin: '8px 0 4px' }}>DLP defect register {open > 0 ? <span className="neg">· {open} open</span> : <span className="pos">· clear</span>}</h4>
        <p className="muted small" style={{ marginTop: 0 }}>Defects raised during the liability period block financial closure until rectified.</p>
        {commander && (
          <div className="create-row">
            <input aria-label="Defect description" placeholder="Defect (e.g. joint sealant failure)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <input aria-label="Defect location" placeholder="Location / RD" value={loc} onChange={(e) => setLoc(e.target.value)} style={{ width: 140 }} />
            <select aria-label="Defect severity" value={sev} onChange={(e) => setSev(e.target.value as 'minor' | 'major')}>
              <option value="minor">Minor</option><option value="major">Major</option>
            </select>
            <button className="btn btn-mini" onClick={raise} disabled={desc.trim().length < 3}>Raise defect</button>
          </div>
        )}
        {defects.length === 0 ? <p className="muted small">No defects recorded.</p> : (
          <table className="data-table" aria-label="DLP defects">
            <thead><tr><th>Raised</th><th>Defect</th><th>Location</th><th>Severity</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {defects.map((d) => (
                <tr key={d.id} className={d.status === 'open' ? 'row-flag' : ''}>
                  <td className="small">{d.raised}</td>
                  <td>{d.description}</td>
                  <td className="small">{d.location ?? '—'}</td>
                  <td><span className={`status-pill${d.severity === 'major' ? ' st-open' : ''}`}>{d.severity}</span></td>
                  <td>{d.status === 'open' ? <span className="neg">open</span> : <span className="pos">rectified {d.rectifiedDate}</span>}</td>
                  <td>{commander && (d.status === 'open'
                    ? <button className="btn btn-mini" aria-label={`Rectify ${d.id}`} onClick={() => setStatus(d, 'rectified')}>Mark rectified</button>
                    : <button className="link-btn" aria-label={`Reopen ${d.id}`} onClick={() => setStatus(d, 'open')}>reopen</button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4 style={{ margin: '14px 0 4px' }}>Final-bill reconciliation {recon && (recon.clean ? <span className="pos">· no over-claims</span> : <span className="neg">· {recon.overItems} over-claimed</span>)}</h4>
        <p className="muted small" style={{ marginTop: 0 }}>Authorised (BOQ + approved VOs) vs claimed through IPCs — the QS check before closure.</p>
        {recon && (
          <>
            <p className="small">
              Over-claimed: <strong className={recon.overItems ? 'neg' : ''}>{recon.overItems} items · {formatMoney(recon.overAmount)}</strong>
              {' · '}Unclaimed balance: <strong>{recon.underItems} items · {formatMoney(recon.underValue)}</strong>
            </p>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <table className="data-table" aria-label="Final bill reconciliation">
                <thead><tr><th>Code</th><th>Description</th><th className="num">Authorised</th><th className="num">Claimed</th><th className="num">Variance</th><th className="num">Value</th></tr></thead>
                <tbody>
                  {recon.rows.slice(0, 40).map((r) => (
                    <tr key={r.boqItemId} className={r.over ? 'row-flag' : ''}>
                      <td className="mono small">{r.code}</td>
                      <td className="small">{r.description.slice(0, 60)}</td>
                      <td className="num">{r.authorisedQty.toLocaleString('en-PK')} {r.unit}</td>
                      <td className="num">{r.claimedQty.toLocaleString('en-PK')}</td>
                      <td className={`num${r.over ? ' neg' : ''}`}>{r.varianceQty.toLocaleString('en-PK')}</td>
                      <td className={`num${r.over ? ' neg' : ''}`}>{formatMoney(r.varianceAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { STAGES };

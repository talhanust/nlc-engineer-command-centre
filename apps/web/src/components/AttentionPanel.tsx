import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import type { AttentionRollup, AttentionItem } from '../domain/attention';

/**
 * The Attention panel — one place that shows every alert under a node's command,
 * rolled up the org tree: a project shows its own; a PD HQ shows all it commands;
 * HQ Engineers and HQ NLC aggregate the whole subtree. Each alert is a deep link
 * into the project it came from, so triage is one click from the fix.
 *
 * It sits on every node screen (project and command), so "what needs my attention"
 * means the same thing at every level and a commander never opens a project just to
 * discover it was fine.
 */
export function AttentionPanel({ nodeId, isProject }: { nodeId: string; isProject: boolean }) {
  const { provider } = useData();
  const { role } = useRole();
  const navigate = useNavigate();
  const [roll, setRoll] = useState<AttentionRollup | null>(null);
  const [open, setOpen] = useState(false);
  const [groupByProject, setGroupByProject] = useState(!isProject);
  const [noteFor, setNoteFor] = useState<AttentionItem | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try { setRoll(await provider.attentionFor(nodeId)); } catch { /* keep prior */ }
  }
  async function ack(a: AttentionItem) {
    setBusy(true);
    try { await provider.setAlertState(a.projectId, { alertId: a.id, status: 'ack', by: role }); await refresh(); }
    finally { setBusy(false); }
  }
  async function resolve() {
    if (!noteFor) return;
    setBusy(true);
    try {
      await provider.setAlertState(noteFor.projectId, { alertId: noteFor.id, status: 'resolved', by: role, note: note.trim() || undefined });
      setNoteFor(null); setNote('');
      await refresh();
    } finally { setBusy(false); }
  }

  useEffect(() => {
    let live = true;
    void provider.attentionFor(nodeId).then((r) => { if (live) setRoll(r); }).catch(() => { if (live) setRoll(null); });
    const onAudit = () => { void provider.attentionFor(nodeId).then((r) => { if (live) setRoll(r); }).catch(() => {}); };
    window.addEventListener('nlc:audit', onAudit);
    return () => { live = false; window.removeEventListener('nlc:audit', onAudit); };
  }, [provider, nodeId]);

  if (!roll || roll.total === 0) return null;
  const worst = roll.critical > 0 ? 'critical' : 'warning';

  function openAlert(projectId: string, sub: string) {
    // Land on the exact screen that holds the fix. Mapping is a top-level tab;
    // every other alert targets a commercial sub-tab, carried in the URL so the
    // deep link lands there directly rather than on the commercial landing page.
    navigate(sub === 'mapping' ? `/node/${projectId}/mapping` : `/node/${projectId}/commercial?sub=${sub}`);
  }

  return (
    <div className={`alert-banner sev-${worst}`} role="status" aria-label="Attention">
      <button className="alert-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="alert-dot" aria-hidden>{worst === 'critical' ? '⛔' : '⚠'}</span>
        <span className="alert-text">
          <strong>{roll.total} item{roll.total === 1 ? '' : 's'} need attention</strong>
          <span className="muted small">
            {roll.critical ? `${roll.critical} critical` : ''}{roll.critical && roll.warning ? ' · ' : ''}{roll.warning ? `${roll.warning} warning` : ''}
            {!isProject && roll.affectedProjects > 0 ? ` · across ${roll.affectedProjects} project${roll.affectedProjects === 1 ? '' : 's'}` : ''}
          </span>
        </span>
        <span className="alert-chevron" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      <button className="attention-desklink btn-ghost btn-mini" onClick={() => navigate(`/attention/${nodeId}`)}
        aria-label="Open the attention triage desk">Triage desk →</button>

      {open && (
        <div className="attention-body">
          {!isProject && (
            <div className="attention-toolbar">
              <button className={`btn-ghost btn-mini${groupByProject ? ' active' : ''}`} aria-pressed={groupByProject} onClick={() => setGroupByProject(true)}>By project</button>
              <button className={`btn-ghost btn-mini${!groupByProject ? ' active' : ''}`} aria-pressed={!groupByProject} onClick={() => setGroupByProject(false)}>All alerts</button>
            </div>
          )}

          {groupByProject && !isProject ? (
            <ul className="attention-projects" aria-label="Affected projects">
              {roll.byProject.map((bp) => (
                <li key={bp.projectId}>
                  <button className="attention-project-row" onClick={() => navigate(`/node/${bp.projectId}/commercial`)}>
                    <span className="attention-project-name">{bp.projectName}</span>
                    <span className="attention-counts">
                      {bp.critical > 0 && <span className="pip sev-critical" title={`${bp.critical} critical`}>{bp.critical}</span>}
                      {bp.warning > 0 && <span className="pip sev-warning" title={`${bp.warning} warning`}>{bp.warning}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="alert-list" aria-label="Alerts">
              {roll.items.map((a) => (
                <li key={`${a.projectId}-${a.id}`} className={`alert-item sev-${a.severity}`}>
                  <div className="attention-row">
                    <button className="attention-open" onClick={() => openAlert(a.projectId, a.sub)}>
                      <span className={`alert-pip sev-${a.severity}`} aria-hidden />
                      <span className="alert-body">
                        <span className="alert-title">{a.title}{a.status === 'ack' ? <span className="ack-tag" title="Acknowledged"> · ack</span> : null}</span>
                        <span className="muted small">{a.detail}</span>
                      </span>
                      {!isProject && <span className="attention-origin muted small">{a.projectName}</span>}
                    </button>
                    <span className="attention-actions">
                      {a.status !== 'ack' && <button className="btn-ghost btn-mini" disabled={busy} onClick={() => ack(a)} aria-label={`Acknowledge ${a.title}`}>Ack</button>}
                      <button className="btn-ghost btn-mini" disabled={busy} onClick={() => { setNoteFor(a); setNote(''); }} aria-label={`Resolve ${a.title}`}>Resolve</button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {noteFor && (
        <div className="modal-backdrop" role="dialog" aria-label="Resolve alert" aria-modal="true" onClick={() => setNoteFor(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Resolve alert</h3>
            <p className="muted small">{noteFor.title} · {noteFor.projectName}</p>
            <p className="small">Resolving records who cleared it and why. It leaves the attention list; if the underlying condition recurs, a fresh alert is raised.</p>
            <textarea aria-label="Resolution note" rows={3} style={{ width: '100%' }} placeholder="Reason / action taken…"
              value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="create-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn-ghost" onClick={() => setNoteFor(null)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={resolve} disabled={busy} aria-label="Confirm resolve">{busy ? 'Resolving…' : 'Resolve'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

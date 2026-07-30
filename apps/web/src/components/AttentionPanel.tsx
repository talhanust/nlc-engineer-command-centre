import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import type { AttentionRollup } from '../domain/attention';

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
  const navigate = useNavigate();
  const [roll, setRoll] = useState<AttentionRollup | null>(null);
  const [open, setOpen] = useState(false);
  const [groupByProject, setGroupByProject] = useState(!isProject);

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
                  <button onClick={() => openAlert(a.projectId, a.sub)}>
                    <span className={`alert-pip sev-${a.severity}`} aria-hidden />
                    <span className="alert-body">
                      <span className="alert-title">{a.title}</span>
                      <span className="muted small">{a.detail}</span>
                    </span>
                    {!isProject && <span className="attention-origin muted small">{a.projectName}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

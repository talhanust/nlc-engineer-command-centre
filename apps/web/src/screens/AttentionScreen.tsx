import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useRole } from '../state/Role';
import { alertCategory, ALERT_CATEGORY_LABEL, type AlertCategory, type AttentionItem, type AttentionRollup } from '../domain/attention';

type SevFilter = 'all' | 'critical' | 'warning';

/**
 * The command-wide triage desk. The per-node Attention panel answers "what needs
 * attention here"; this screen is the whole command in one list, filterable by
 * severity, type and project, where a commander clears the morning queue. It rolls
 * up from a scope node (the whole org by default) and triages in place — ack,
 * resolve, or mute — so an alert leaves the list the moment it is handled.
 */
export function AttentionScreen() {
  const { nodeId = 'hq-nlc' } = useParams();
  const { provider, nodes } = useData();
  const { role } = useRole();
  const navigate = useNavigate();

  const [roll, setRoll] = useState<AttentionRollup | null>(null);
  const [sev, setSev] = useState<SevFilter>('all');
  const [cat, setCat] = useState<AlertCategory | 'all'>('all');
  const [proj, setProj] = useState<string>('all');
  const [noteFor, setNoteFor] = useState<{ item: AttentionItem; status: 'resolved' | 'muted' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try { setRoll(await provider.attentionFor(nodeId)); } catch { setRoll(null); }
  }
  useEffect(() => {
    let live = true;
    void provider.attentionFor(nodeId).then((r) => { if (live) setRoll(r); }).catch(() => { if (live) setRoll(null); });
    const onAudit = () => { void refresh(); };
    window.addEventListener('nlc:audit', onAudit);
    return () => { live = false; window.removeEventListener('nlc:audit', onAudit); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, nodeId]);

  const scopeName = nodes.find((n) => n.id === nodeId)?.name ?? 'Command';

  // Facets present in the data, so a filter only offers what exists.
  const facets = useMemo(() => {
    const cats = new Set<AlertCategory>();
    const projs = new Map<string, string>();
    for (const i of roll?.items ?? []) { cats.add(alertCategory(i)); projs.set(i.projectId, i.projectName); }
    return { cats: [...cats], projs: [...projs].sort((a, b) => a[1].localeCompare(b[1])) };
  }, [roll]);

  const filtered = useMemo(() => {
    return (roll?.items ?? []).filter((i) =>
      (sev === 'all' || i.severity === sev)
      && (cat === 'all' || alertCategory(i) === cat)
      && (proj === 'all' || i.projectId === proj));
  }, [roll, sev, cat, proj]);

  async function ack(a: AttentionItem) {
    setBusy(true);
    try { await provider.setAlertState(a.projectId, { alertId: a.id, status: 'ack', by: role }); await refresh(); }
    finally { setBusy(false); }
  }
  async function commitNote() {
    if (!noteFor) return;
    setBusy(true);
    try {
      await provider.setAlertState(noteFor.item.projectId, { alertId: noteFor.item.id, status: noteFor.status, by: role, note: note.trim() || undefined });
      setNoteFor(null); setNote('');
      await refresh();
    } finally { setBusy(false); }
  }
  function openAlert(a: AttentionItem) {
    navigate(a.sub === 'mapping' ? `/node/${a.projectId}/mapping` : `/node/${a.projectId}/commercial?sub=${a.sub}`);
  }

  const criticalShown = filtered.filter((i) => i.severity === 'critical').length;

  return (
    <div className="attention-screen">
      <div className="section-head">
        <h2>Attention — {scopeName}</h2>
        <span className="muted">{roll ? `${roll.total} open · ${roll.affectedProjects} project${roll.affectedProjects === 1 ? '' : 's'}` : 'Loading…'}</span>
      </div>

      <div className="filter-bar" role="group" aria-label="Attention filters">
        <label className="small">Severity{' '}
          <select aria-label="Filter by severity" value={sev} onChange={(e) => setSev(e.target.value as SevFilter)}>
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </select>
        </label>
        <label className="small">Type{' '}
          <select aria-label="Filter by type" value={cat} onChange={(e) => setCat(e.target.value as AlertCategory | 'all')}>
            <option value="all">All types</option>
            {facets.cats.map((c) => <option key={c} value={c}>{ALERT_CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="small">Project{' '}
          <select aria-label="Filter by project" value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="all">All projects</option>
            {facets.projs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        {(sev !== 'all' || cat !== 'all' || proj !== 'all') && (
          <button className="btn-ghost btn-mini" onClick={() => { setSev('all'); setCat('all'); setProj('all'); }}>Clear filters</button>
        )}
        <span className="filter-count muted small">{filtered.length} shown{criticalShown ? ` · ${criticalShown} critical` : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="muted" style={{ padding: '18px 2px' }}>
          {roll && roll.total > 0 ? 'Nothing matches these filters.' : 'Nothing needs attention across this command. '}
        </p>
      ) : (
        <table className="data-table attention-table" aria-label="Attention items">
          <thead>
            <tr><th style={{ width: 28 }} /><th>Alert</th><th>Type</th><th>Project</th><th style={{ width: 220 }} /></tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={`${a.projectId}-${a.id}`} className={`sev-${a.severity}`}>
                <td><span className={`alert-pip sev-${a.severity}`} aria-hidden /></td>
                <td>
                  <button className="link-cell" onClick={() => openAlert(a)}>
                    <span className="alert-title">{a.title}{a.status === 'ack' ? <span className="ack-tag"> · ack</span> : null}</span>
                    <span className="muted small"> — {a.detail}</span>
                  </button>
                  {a.note ? <div className="muted small"><em>{a.note}</em></div> : null}
                </td>
                <td className="small">{ALERT_CATEGORY_LABEL[alertCategory(a)]}</td>
                <td className="small">{a.projectName}</td>
                <td>
                  <div className="attention-actions-row">
                    {a.status !== 'ack' && <button className="btn-ghost btn-mini" disabled={busy} onClick={() => ack(a)} aria-label={`Acknowledge ${a.title}`}>Ack</button>}
                    <button className="btn-ghost btn-mini" disabled={busy} onClick={() => { setNoteFor({ item: a, status: 'muted' }); setNote(''); }} aria-label={`Mute ${a.title}`}>Mute</button>
                    <button className="btn-ghost btn-mini" disabled={busy} onClick={() => { setNoteFor({ item: a, status: 'resolved' }); setNote(''); }} aria-label={`Resolve ${a.title}`}>Resolve</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {noteFor && (
        <div className="modal-backdrop" role="dialog" aria-label={noteFor.status === 'muted' ? 'Mute alert' : 'Resolve alert'} aria-modal="true" onClick={() => setNoteFor(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{noteFor.status === 'muted' ? 'Mute alert' : 'Resolve alert'}</h3>
            <p className="muted small">{noteFor.item.title} · {noteFor.item.projectName}</p>
            <p className="small">{noteFor.status === 'muted'
              ? 'Muting hides this alert until its condition materially changes. Use it for a known, accepted situation.'
              : 'Resolving records who cleared it and why. If the condition recurs, a fresh alert is raised.'}</p>
            <textarea aria-label="Note" rows={3} style={{ width: '100%' }} placeholder={noteFor.status === 'muted' ? 'Why this is accepted…' : 'Reason / action taken…'}
              value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="create-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn-ghost" onClick={() => setNoteFor(null)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={commitNote} disabled={busy} aria-label={`Confirm ${noteFor.status === 'muted' ? 'mute' : 'resolve'}`}>
                {busy ? 'Saving…' : noteFor.status === 'muted' ? 'Mute' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

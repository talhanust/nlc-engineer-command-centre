import { useState } from 'react';
import type { BoqItem, ScheduleActivity, BoqWbsLink } from '../data/types';
import type { MapSuggestion } from '../domain/autoMap';

interface Choice { accepted: boolean; activityId: string }

/**
 * Review screen for auto-map suggestions. Each proposed BOQ→activity link shows
 * its match strength; the engineer accepts, re-points, or skips it, then commits
 * the accepted set as confirmed links (human-reviewed, so confidence 'confirmed').
 * Far safer than blindly applying every fuzzy match.
 */
export function MapReviewModal({
  items, activities, suggestions, onConfirm, onClose,
}: {
  items: BoqItem[];
  activities: ScheduleActivity[];
  suggestions: MapSuggestion[];
  onConfirm: (links: BoqWbsLink[]) => Promise<void> | void;
  onClose: () => void;
}) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ordered = [...suggestions].sort((a, b) => b.score - a.score);
  const [choices, setChoices] = useState<Record<string, Choice>>(
    Object.fromEntries(ordered.map((s) => [s.boqItemId, { accepted: true, activityId: s.activityId }])),
  );
  const [busy, setBusy] = useState(false);

  const acceptedCount = Object.values(choices).filter((c) => c.accepted && c.activityId).length;
  function setAll(accepted: boolean) {
    setChoices((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, accepted }])));
  }
  function strength(score: number): string {
    if (score >= 0.6) return 'strong';
    if (score >= 0.45) return 'good';
    return 'weak';
  }

  async function confirm() {
    setBusy(true);
    try {
      const links: BoqWbsLink[] = Object.entries(choices)
        .filter(([, c]) => c.accepted && c.activityId)
        .map(([boqItemId, c]) => ({ boqItemId, projectId: itemById.get(boqItemId)!.projectId, activityId: c.activityId, confidence: 'confirmed' as const }));
      await onConfirm(links);
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label="Review auto-map" aria-modal="true">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h3>Review auto-map — {ordered.length} suggestion{ordered.length === 1 ? '' : 's'}</h3>
          <div className="head-tools">
            <button className="btn-ghost btn-mini" onClick={() => setAll(true)}>Accept all</button>
            <button className="btn-ghost btn-mini" onClick={() => setAll(false)}>Clear all</button>
          </div>
        </div>
        <p className="muted small">Each BOQ item is matched to its closest schedule activity by description. Accept, re-point, or skip — accepted links are saved as confirmed.</p>
        <table className="data-table" aria-label="Auto-map suggestions">
          <thead><tr><th>Use</th><th>BOQ</th><th>Description</th><th>Suggested activity</th><th className="num">Match</th></tr></thead>
          <tbody>
            {ordered.map((s) => {
              const it = itemById.get(s.boqItemId);
              const ch = choices[s.boqItemId];
              if (!it || !ch) return null;
              return (
                <tr key={s.boqItemId} className={ch.accepted ? '' : 'row-muted'}>
                  <td>
                    <input type="checkbox" aria-label={`Accept ${it.code}`} checked={ch.accepted}
                      onChange={(e) => setChoices((p) => ({ ...p, [s.boqItemId]: { ...ch, accepted: e.target.checked } }))} />
                  </td>
                  <td>{it.code}</td>
                  <td className="small">{it.description}</td>
                  <td>
                    <select aria-label={`Activity for ${it.code}`} value={ch.activityId}
                      onChange={(e) => setChoices((p) => ({ ...p, [s.boqItemId]: { ...ch, activityId: e.target.value } }))}>
                      {activities.map((a) => (<option key={a.id} value={a.activityId}>{a.activityId} — {a.name}</option>))}
                    </select>
                  </td>
                  <td className="num">
                    <span className={`map-strength ms-${strength(s.score)}`} title={`${Math.round(s.score * 100)}% token match`}>{Math.round(s.score * 100)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || acceptedCount === 0} onClick={confirm}>Confirm {acceptedCount} mapping{acceptedCount === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}

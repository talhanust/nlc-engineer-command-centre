import { useEffect, useState } from 'react';
import { loadViews, saveView, deleteView, type SavedView } from '../state/savedViews';

export interface SavedViewsProps {
  /** Stable scope key, e.g. `rar:${projectId}`. */
  scope: string;
  /** The current filter selection to snapshot when saving. */
  current: Record<string, string>;
  /** Apply a stored view's filters back into the register. */
  onApply: (filters: Record<string, string>) => void;
}

/** Save / apply / delete named filter snapshots for a register's filter bar. */
export function SavedViews({ scope, current, onApply }: SavedViewsProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => { setViews(loadViews(scope)); }, [scope]);

  function apply(viewName: string) {
    const v = views.find((x) => x.name === viewName);
    if (v) onApply(v.filters);
  }
  function commitSave() {
    if (!name.trim()) { setNaming(false); return; }
    setViews(saveView(scope, name, current));
    setName(''); setNaming(false);
  }
  function remove(viewName: string) {
    setViews(deleteView(scope, viewName));
  }

  return (
    <div className="saved-views" role="group" aria-label="Saved views">
      {views.length > 0 && (
        <div className="view-chips">
          {views.map((v) => (
            <span key={v.name} className="view-chip">
              <button className="view-chip-apply" aria-label={`Apply view ${v.name}`} onClick={() => apply(v.name)}>{v.name}</button>
              <button className="view-chip-del" aria-label={`Delete view ${v.name}`} onClick={() => remove(v.name)}>✕</button>
            </span>
          ))}
        </div>
      )}
      {naming ? (
        <span className="view-save-row">
          <input autoFocus aria-label="View name" placeholder="View name…" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commitSave(); if (e.key === 'Escape') setNaming(false); }} />
          <button className="btn-mini btn" onClick={commitSave}>Save</button>
          <button className="btn-mini btn-ghost" onClick={() => setNaming(false)}>Cancel</button>
        </span>
      ) : (
        <button className="btn-ghost btn-mini" aria-label="Save current view" onClick={() => setNaming(true)}>★ Save view</button>
      )}
    </div>
  );
}

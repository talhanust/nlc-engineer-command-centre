// Named filter snapshots per register, persisted as a UI preference (localStorage,
// like density/basemap). Not project data, so it lives outside the provider store.

export interface SavedView { name: string; filters: Record<string, string> }

const PREFIX = 'nlc-ecc.views.';

export function loadViews(scope: string): SavedView[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFIX + scope) : null;
    const arr = raw ? (JSON.parse(raw) as SavedView[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function persist(scope: string, views: SavedView[]): void {
  try { localStorage.setItem(PREFIX + scope, JSON.stringify(views)); } catch { /* ignore */ }
}

export function saveView(scope: string, name: string, filters: Record<string, string>): SavedView[] {
  const clean = name.trim();
  if (!clean) return loadViews(scope);
  const views = loadViews(scope).filter((v) => v.name !== clean);
  views.push({ name: clean, filters });
  views.sort((a, b) => a.name.localeCompare(b.name));
  persist(scope, views);
  return views;
}

export function deleteView(scope: string, name: string): SavedView[] {
  const views = loadViews(scope).filter((v) => v.name !== name);
  persist(scope, views);
  return views;
}

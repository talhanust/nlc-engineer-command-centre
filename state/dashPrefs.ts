import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-role dashboard configuration (req 3g(4)): each role chooses which
 * metrics its breakdown shows and whether the manpower roll-up card renders.
 * Persisted per role, so a PD's view differs from the CFO's without affecting
 * either. RAG thresholds are configured alongside via the existing UiState.
 */

export interface DashPrefs {
  contract: boolean;
  billed: boolean;
  received: boolean;
  planned: boolean;
  actual: boolean;
  slippage: boolean;
  score: boolean;
  hrRollup: boolean;
}

export const DEFAULT_DASH_PREFS: DashPrefs = {
  contract: true, billed: true, received: true, planned: true, actual: true,
  slippage: true, score: true, hrRollup: true,
};

export const DASH_PREF_LABEL: Record<keyof DashPrefs, string> = {
  contract: 'Contract value', billed: 'Billed', received: 'Received', planned: 'Planned %',
  actual: 'Actual %', slippage: 'Slippage', score: 'Health score', hrRollup: 'Manpower roll-up card',
};

const key = (role: string) => `nlc-ecc.ui.dashprefs.${role}`;
const listeners = new Set<() => void>();
const cache = new Map<string, DashPrefs>();

function read(role: string): DashPrefs {
  const hit = cache.get(role);
  if (hit) return hit;
  let v = DEFAULT_DASH_PREFS;
  try {
    const raw = localStorage.getItem(key(role));
    if (raw) v = { ...DEFAULT_DASH_PREFS, ...(JSON.parse(raw) as Partial<DashPrefs>) };
  } catch { /* ignore */ }
  cache.set(role, v);
  return v;
}

export function setDashPrefs(role: string, prefs: DashPrefs): void {
  cache.set(role, prefs);
  try { localStorage.setItem(key(role), JSON.stringify(prefs)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useDashPrefs(role: string): [DashPrefs, (p: Partial<DashPrefs>) => void] {
  const prefs = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => read(role),
  );
  const patch = useCallback((p: Partial<DashPrefs>) => setDashPrefs(role, { ...read(role), ...p }), [role]);
  return [prefs, patch];
}

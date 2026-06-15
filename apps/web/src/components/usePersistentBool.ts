import { useEffect, useState } from 'react';

/** A boolean that persists to localStorage under a stable key. */
export function usePersistentBool(key: string | undefined, initial: boolean): [boolean, (v: boolean) => void] {
  const storageKey = key ? `nlc-ecc.ui.${key}` : undefined;
  const [val, setVal] = useState<boolean>(() => {
    if (!storageKey) return initial;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) return raw === '1';
    } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, val ? '1' : '0'); } catch { /* ignore */ }
  }, [storageKey, val]);
  return [val, setVal];
}

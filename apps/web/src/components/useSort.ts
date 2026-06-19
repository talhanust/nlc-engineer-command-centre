import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> { key: K | null; dir: SortDir }

/**
 * Client-side table sorting. `accessors` maps a column key to a comparable value.
 * Returns the sorted rows plus the current state and a toggle (asc → desc → asc).
 */
export function useSort<T, K extends string>(
  rows: T[],
  accessors: Record<K, (r: T) => string | number>,
  initial?: { key: NoInfer<K>; dir?: SortDir },
) {
  const [sort, setSort] = useState<SortState<K>>({ key: initial?.key ?? null, dir: initial?.dir ?? 'asc' });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const acc = accessors[sort.key];
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a); const vb = acc(b);
      if (va < vb) return -factor;
      if (va > vb) return factor;
      return 0;
    });
    // accessors are assumed stable per column key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: K) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  return { sorted, sort, toggle };
}

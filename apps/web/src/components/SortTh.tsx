import type { SortState } from './useSort';

/** A sortable table header cell with an asc/desc/neutral indicator. */
export function SortTh<K extends string>({ k, label, sort, toggle, className }: {
  k: K; label: string; sort: SortState<K>; toggle: (k: K) => void; className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`${className ?? ''} sortable${active ? ' sorted' : ''}`.trim()}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" onClick={() => toggle(k)}>
        <span>{label}</span>
        <span className="sort-ind" aria-hidden>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

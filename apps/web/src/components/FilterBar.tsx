import { useData } from '../data/DataContext';
import { useUiState, EMPTY_FILTER } from '../state/UiState';
import { clientsOf } from '../domain/filter';
import type { Rag } from '../domain/rollup';

const RAGS: (Rag | 'all')[] = ['all', 'green', 'amber', 'red'];
const RAG_LABEL: Record<string, string> = { all: 'All health', green: 'On track', amber: 'At risk', red: 'Behind' };

export function FilterBar() {
  const { projects } = useData();
  const { filter, setFilter, filterActive } = useUiState();
  const clients = clientsOf(projects);

  return (
    <div className="filter-bar" role="search">
      <input
        className="filter-input"
        type="search"
        placeholder="Search projects or clients…"
        aria-label="Search projects or clients"
        value={filter.search}
        onChange={(e) => setFilter({ ...filter, search: e.target.value })}
      />
      <select
        aria-label="Filter by client"
        value={filter.client}
        onChange={(e) => setFilter({ ...filter, client: e.target.value })}
      >
        <option value="all">All clients</option>
        {clients.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by health"
        value={filter.rag}
        onChange={(e) => setFilter({ ...filter, rag: e.target.value as Rag | 'all' })}
      >
        {RAGS.map((r) => (
          <option key={r} value={r}>
            {RAG_LABEL[r]}
          </option>
        ))}
      </select>
      {filterActive && (
        <button className="btn-ghost" onClick={() => setFilter(EMPTY_FILTER)}>
          Clear
        </button>
      )}
    </div>
  );
}

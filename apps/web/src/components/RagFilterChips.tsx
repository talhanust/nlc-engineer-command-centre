import { useUiState } from '../state/UiState';
import { projectRag } from '../domain/filter';
import type { Project } from '../data/types';
import type { Rag } from '../domain/rollup';

const CHIPS: { key: Rag; label: string }[] = [
  { key: 'green', label: 'On track' },
  { key: 'amber', label: 'At risk' },
  { key: 'red', label: 'Behind' },
];

/**
 * One-click cross-filter: tapping a health chip sets the shared RAG filter, which
 * re-filters the league table, exceptions, S-curve, KPIs and the map together.
 */
export function RagFilterChips({ projects }: { projects: Project[] }) {
  const { filter, setFilter, rag } = useUiState();
  if (projects.length === 0) return null;

  const counts: Record<Rag, number> = { green: 0, amber: 0, red: 0 };
  for (const p of projects) counts[projectRag(p, rag)]++;

  return (
    <div className="rag-chips" role="group" aria-label="Filter by health">
      {CHIPS.map(({ key, label }) => {
        const active = filter.rag === key;
        return (
          <button
            key={key}
            className={`rag-chip status-${key}${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => setFilter({ ...filter, rag: active ? 'all' : key })}
          >
            <span className="rag-chip-dot" aria-hidden />
            <span className="rag-chip-label">{label}</span>
            <span className="rag-chip-count">{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

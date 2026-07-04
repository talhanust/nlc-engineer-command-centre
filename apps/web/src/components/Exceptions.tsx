import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useUiState } from '../state/UiState';
import { descendantProjectIds, nodeById } from '../domain/org';
import { projectRag } from '../domain/filter';
import { formatPct } from '../domain/money';
import { RagBadge } from './RagBadge';
import type { Project } from '../data/types';

export function Exceptions({ nodeId, projects }: { nodeId: string; projects: Project[] }) {
  const { nodes } = useData();
  const { rag } = useUiState();
  const navigate = useNavigate();

  const ids = new Set(descendantProjectIds(nodes, nodeId));
  const flagged = projects
    .filter((p) => ids.has(p.id))
    .map((p) => ({ p, slip: p.actualPct - p.plannedPct, r: projectRag(p, rag) }))
    .filter((x) => x.r !== 'green')
    .sort((a, b) => a.slip - b.slip);

  return (
    <div className="card panel">
      <h3>Exceptions</h3>
      {flagged.length === 0 ? (
        <p className="muted">No at-risk or behind projects under this node.</p>
      ) : (
        <ul className="exceptions">
          {flagged.map(({ p, slip, r }) => (
            <li key={p.id} className="exc-row" onClick={() => navigate(`/node/${p.id}`)}>
              <div>
                <div className="exc-name">{nodeById(nodes, p.id)?.name}</div>
                <div className="muted small">{p.clientName}</div>
              </div>
              <div className="exc-right">
                <span className="neg">{formatPct(slip)}</span>
                <RagBadge rag={r} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

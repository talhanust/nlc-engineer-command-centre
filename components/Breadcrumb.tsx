import { Link } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { ancestorsOf } from '../domain/org';

export function Breadcrumb({ nodeId }: { nodeId: string }) {
  const { nodes } = useData();
  const chain = ancestorsOf(nodes, nodeId);
  return (
    <div className="breadcrumb" aria-label="Breadcrumb">
      {chain.map((n, i) => (
        <span key={n.id}>
          {i > 0 && <span className="sep">/</span>}
          {i < chain.length - 1 ? (
            <Link to={`/node/${n.id}`}>{n.name}</Link>
          ) : (
            <strong>{n.name}</strong>
          )}
        </span>
      ))}
    </div>
  );
}

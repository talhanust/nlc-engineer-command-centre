import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { childrenOf } from '../domain/org';
import type { OrgNode } from '../data/types';

export function OrgNavigator() {
  const { nodes } = useData();
  const roots = nodes.filter((n) => n.parentId === null);
  return (
    <nav className="org-nav" aria-label="Organization navigator">
      {roots.map((r) => (
        <TreeNode key={r.id} node={r} depth={0} />
      ))}
    </nav>
  );
}

function TreeNode({ node, depth }: { node: OrgNode; depth: number }) {
  const { nodes } = useData();
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const kids = childrenOf(nodes, node.id);
  const active = nodeId === node.id;
  return (
    <div>
      <button
        className={`org-nav-item${active ? ' active' : ''}`}
        style={{ paddingLeft: 10 + depth * 16 }}
        onClick={() => navigate(`/node/${node.id}`)}
        aria-current={active ? 'page' : undefined}
      >
        <span className={`dot type-${node.type}`} aria-hidden />
        {node.name}
      </button>
      {kids.map((k) => (
        <TreeNode key={k.id} node={k} depth={depth + 1} />
      ))}
    </div>
  );
}

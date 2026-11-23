import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { childrenOf } from '../domain/org';
import type { OrgNode } from '../data/types';

export function OrgNavigator() {
  const { nodes } = useData();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const roots = nodes.filter((n) => n.parentId === null);
  return (
    <nav className="org-nav" aria-label="Organization navigator">
      <div className="org-nav-quick">
        <button className={`org-nav-item org-nav-quick-item${pathname.startsWith('/attention') ? ' active' : ''}`}
          onClick={() => navigate('/attention')} aria-current={pathname.startsWith('/attention') ? 'page' : undefined}>
          <span className="quick-ico" aria-hidden>⚑</span> Triage desk
        </button>
        <button className={`org-nav-item org-nav-quick-item${pathname.startsWith('/worklist') ? ' active' : ''}`}
          onClick={() => navigate('/worklist')} aria-current={pathname.startsWith('/worklist') ? 'page' : undefined}>
          <span className="quick-ico" aria-hidden>✓</span> My approvals
        </button>
      </div>
      <div className="org-nav-heading">Organisation</div>
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

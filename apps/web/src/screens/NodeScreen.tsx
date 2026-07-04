import { useParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { nodeById, isBranch } from '../domain/org';
import { Breadcrumb } from '../components/Breadcrumb';
import { CommentsPanel } from '../components/CommentsPanel';
import { CommandDashboard } from './CommandDashboard';
import { ProjectView } from './ProjectView';

export function NodeScreen() {
  const { nodeId = 'hq-nlc' } = useParams();
  const { nodes, loading } = useData();
  if (loading) return <p className="muted">Loading…</p>;
  const node = nodeById(nodes, nodeId);
  if (!node) return <p>Node “{nodeId}” not found.</p>;
  return (
    <>
      <Breadcrumb nodeId={nodeId} />
      {isBranch(node) ? <CommandDashboard nodeId={nodeId} /> : <ProjectView nodeId={nodeId} />}
      <CommentsPanel nodeId={nodeId} />
    </>
  );
}

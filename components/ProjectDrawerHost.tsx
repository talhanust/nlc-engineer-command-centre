import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { DetailDrawer } from './DetailDrawer';
import { nodeById } from '../domain/org';
import { ragForSlippage } from '../domain/rollup';
import { toNum } from '../domain/money';
import { formatMoney } from '../domain/money';

const RAG_TEXT: Record<string, string> = { green: 'On track', amber: 'At risk', red: 'Behind' };

/** Open with: window.dispatchEvent(new CustomEvent('nlc:project-drawer', { detail: { projectId } })). */
export function ProjectDrawerHost() {
  const { projects, nodes } = useData();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (id) setProjectId(id);
    }
    window.addEventListener('nlc:project-drawer', onOpen);
    return () => window.removeEventListener('nlc:project-drawer', onOpen);
  }, []);

  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const node = projectId ? nodeById(nodes, projectId) : undefined;
  const close = () => setProjectId(null);

  if (!project) return <DetailDrawer open={false} title="" onClose={close}>{null}</DetailDrawer>;

  const contract = toNum(project.contractValue);
  const billed = toNum(project.billedToDate);
  const received = toNum(project.receivedToDate);
  const slippage = project.actualPct - project.plannedPct;
  const rag = ragForSlippage(slippage);
  const pdHq = node ? nodeById(nodes, node.parentId ?? '') : undefined;

  const rows: Array<[string, string]> = [
    ['Contract value', formatMoney(contract)],
    ['Billed to date', formatMoney(billed)],
    ['Received', formatMoney(received)],
    ['Outstanding (billed − received)', formatMoney(Math.max(0, billed - received))],
    ['Unbilled (contract − billed)', formatMoney(Math.max(0, contract - billed))],
  ];
  const meta: Array<[string, string]> = [
    ['Client', project.clientName],
    ...(project.location ? [['Location', project.location] as [string, string]] : []),
    ...(project.projectCode ? [['Project code', project.projectCode] as [string, string]] : []),
    ...(pdHq ? [['PD HQ', pdHq.name] as [string, string]] : []),
    ...(project.commencementDate ? [['Commenced', project.commencementDate] as [string, string]] : []),
    ...(project.completionDate ? [['Completion', project.completionDate] as [string, string]] : []),
  ];

  return (
    <DetailDrawer
      open
      title={node?.name ?? 'Project'}
      subtitle={project.clientName}
      badge={<span className={`drawer-badge status-${rag}`}>{RAG_TEXT[rag]}</span>}
      onClose={close}
      actions={
        <>
          <button className="btn" onClick={() => { navigate(`/node/${project.id}`); close(); }}>Open project →</button>
          <button className="btn-ghost" onClick={close}>Close</button>
        </>
      }
    >
      <div className="drawer-progress">
        <div className="drawer-prog-row"><span>Actual</span><strong>{project.actualPct}%</strong></div>
        <div className="drawer-bar"><div className={`drawer-bar-fill status-${rag}`} style={{ width: `${Math.min(100, project.actualPct)}%` }} /><div className="drawer-bar-plan" style={{ left: `${Math.min(100, project.plannedPct)}%` }} title={`Planned ${project.plannedPct}%`} /></div>
        <div className="drawer-prog-row muted small"><span>Planned {project.plannedPct}%</span><span className={slippage < 0 ? 'neg' : 'pos'}>{slippage >= 0 ? '+' : ''}{slippage.toFixed(1)} pts</span></div>
      </div>

      <table className="drawer-kpis">
        <tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
      </table>

      <h3 className="drawer-section">Details</h3>
      <table className="drawer-kpis">
        <tbody>{meta.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
      </table>
    </DetailDrawer>
  );
}

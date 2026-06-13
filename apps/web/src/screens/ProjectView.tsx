import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useData } from '../data/DataContext';
import { nodeById } from '../domain/org';
import { formatMoney, formatPct, toNum } from '../domain/money';
import { ragForSlippage } from '../domain/rollup';
import { useUiState } from '../state/UiState';
import { KpiCard } from '../components/KpiCard';
import { RagBadge } from '../components/RagBadge';
import { SalientsCard } from '../components/SalientsCard';
import { ProgressEditor } from '../components/ProgressEditor';
import { CommercialTab } from './commercial/CommercialTab';
import { ExecutionTab } from './execution/ExecutionTab';
import { MappingTab } from './mapping/MappingTab';
import { FinancialTab } from './financial/FinancialTab';
import { ProcurementTab } from './procurement/ProcurementTab';
import { HrTab } from './HrTab';
import { PhotoGallery } from '../components/PhotoGallery';
import { PakistanMap } from '../components/PakistanMap';
import { LocationEditor } from '../components/LocationEditor';

const TABS = ['executive', 'commercial', 'execution', 'mapping', 'procurement', 'financial', 'hr', 'gallery'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  executive: 'Executive', commercial: 'Commercial', execution: 'Execution',
  mapping: 'Mapping', procurement: 'Procurement', financial: 'Financial', hr: 'HR', gallery: 'Gallery',
};

export function ProjectView({ nodeId }: { nodeId: string }) {
  const { nodes, projects, provider, refresh } = useData();
  const { rag } = useUiState();
  const navigate = useNavigate();
  const { tab } = useParams();
  const [editProgress, setEditProgress] = useState(false);
  const active: Tab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'executive';

  const node = nodeById(nodes, nodeId);
  const project = projects.find((p) => p.id === nodeId);
  if (!node || !project) return <p>Project not found.</p>;
  const slippage = project.actualPct - project.plannedPct;

  async function archive() {
    if (!confirm(`Archive ${node!.name}? It will be hidden from the tree (restore in Settings).`)) return;
    await provider.archiveProject(nodeId);
    await refresh();
    navigate('/node/hq-nlc');
  }

  return (
    <section>
      {editProgress && <ProgressEditor project={project} onClose={() => setEditProgress(false)} onSaved={refresh} />}
      <div className="screen-head">
        <div>
          <h1>{node.name}</h1>
          {/* FGEHA etc. shown here as the project's CLIENT, not app branding. */}
          <div className="muted">Client: {project.clientName}</div>
        </div>
        <div className="head-tools">
          <button className="btn no-print" onClick={() => setEditProgress(true)}>Update progress</button>
          <button className="btn-ghost no-print" onClick={archive}>Archive</button>
          <RagBadge rag={ragForSlippage(slippage, rag)} />
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={active === t}
            className={`tab${active === t ? ' active' : ''}`}
            onClick={() => navigate(`/node/${nodeId}/${t}`)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {active === 'executive' && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Contract value" value={formatMoney(toNum(project.contractValue))} />
            <KpiCard label="Billed to date" value={formatMoney(toNum(project.billedToDate))} />
            <KpiCard label="Received" value={formatMoney(toNum(project.receivedToDate))} />
            <KpiCard label="Planned" value={formatPct(project.plannedPct)} />
            <KpiCard
              label="Actual"
              value={formatPct(project.actualPct)}
              sub={
                <span className={slippage < 0 ? 'neg' : 'pos'}>
                  {slippage >= 0 ? '+' : ''}
                  {formatPct(slippage)} vs plan
                </span>
              }
            />
          </div>
          <SalientsCard projectId={nodeId} />
          <div className="panel-grid">
            <LocationEditor project={project} onSaved={refresh} />
            <PakistanMap projects={[project]} title="Project location" height={260} />
          </div>
        </>
      )}
      {active === 'gallery' && <PhotoGallery projectId={nodeId} />}

      {active === 'commercial' && <CommercialTab projectId={nodeId} />}
      {active === 'execution' && <ExecutionTab projectId={nodeId} />}
      {active === 'mapping' && <MappingTab projectId={nodeId} />}
      {active === 'financial' && <FinancialTab projectId={nodeId} />}
      {active === 'procurement' && <ProcurementTab projectId={nodeId} />}
      {active === 'hr' && <HrTab nodeId={nodeId} />}
    </section>
  );
}

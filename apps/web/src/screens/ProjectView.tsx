import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { nodeById } from '../domain/org';
import { formatMoney, formatPct, toNum } from '../domain/money';
import { ragForSlippage } from '../domain/rollup';
import { useUiState } from '../state/UiState';
import { KpiCard } from '../components/KpiCard';
import { RagBadge } from '../components/RagBadge';
import { SalientsCard } from '../components/SalientsCard';
import { CommercialTab } from './commercial/CommercialTab';
import { ExecutionTab } from './execution/ExecutionTab';
import { MappingTab } from './mapping/MappingTab';
import { FinancialTab } from './financial/FinancialTab';
import { ProcurementTab } from './procurement/ProcurementTab';

const TABS = ['executive', 'commercial', 'execution', 'mapping', 'procurement', 'financial'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  executive: 'Executive', commercial: 'Commercial', execution: 'Execution',
  mapping: 'Mapping', procurement: 'Procurement', financial: 'Financial',
};

export function ProjectView({ nodeId }: { nodeId: string }) {
  const { nodes, projects } = useData();
  const { rag } = useUiState();
  const navigate = useNavigate();
  const { tab } = useParams();
  const active: Tab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'executive';

  const node = nodeById(nodes, nodeId);
  const project = projects.find((p) => p.id === nodeId);
  if (!node || !project) return <p>Project not found.</p>;
  const slippage = project.actualPct - project.plannedPct;

  return (
    <section>
      <div className="screen-head">
        <div>
          <h1>{node.name}</h1>
          {/* FGEHA etc. shown here as the project's CLIENT, not app branding. */}
          <div className="muted">Client: {project.clientName}</div>
        </div>
        <RagBadge rag={ragForSlippage(slippage, rag)} />
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
        </>
      )}

      {active === 'commercial' && <CommercialTab projectId={nodeId} />}
      {active === 'execution' && <ExecutionTab projectId={nodeId} />}
      {active === 'mapping' && <MappingTab projectId={nodeId} />}
      {active === 'financial' && <FinancialTab projectId={nodeId} />}
      {active === 'procurement' && <ProcurementTab projectId={nodeId} />}
    </section>
  );
}

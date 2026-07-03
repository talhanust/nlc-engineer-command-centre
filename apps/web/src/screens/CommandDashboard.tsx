import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useUiState } from '../state/UiState';
import { computeNodeRollup } from '../domain/rollup';
import { healthScore, healthLabel } from '../domain/health';
import { descendantNodes, descendantProjectIds } from '../domain/org';
import { applyFilter } from '../domain/filter';
import { formatMoney, formatPct } from '../domain/money';
import { KpiCard } from '../components/KpiCard';
import { RagBadge } from '../components/RagBadge';
import { RagThresholds } from '../components/RagThresholds';
import { FilterBar } from '../components/FilterBar';
import { Exceptions } from '../components/Exceptions';
import { LeagueTable } from '../components/LeagueTable';
import { BillingFunnel } from '../components/BillingFunnel';
import { PortfolioSCurve } from '../components/PortfolioSCurve';
import { HrCockpit } from '../components/HrCockpit';
import { nodeBreakdownCsv, nodeBreakdownAoa } from '../domain/exporters';
import { downloadWorkbook } from '../components/xlsxExport';
import { NewProjectModal } from '../components/NewProjectModal';
import { NodeMap } from '../components/NodeMap';
import { ActivityFeed } from '../components/ActivityFeed';
import { RagFilterChips } from '../components/RagFilterChips';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { PortfolioPerformance } from '../components/PortfolioPerformance';

export function CommandDashboard({ nodeId }: { nodeId: string }) {
  const { nodes, projects, refresh } = useData();
  const { rag, filter, filterActive } = useUiState();
  const navigate = useNavigate();
  const [newProject, setNewProject] = useState(false);

  // True re-aggregation: filter the project set, then roll up over it.
  const filtered = applyFilter(projects, nodes, filter, rag);
  const scopeIds = new Set(descendantProjectIds(nodes, nodeId));
  const scopeProjects = projects.filter((p) => scopeIds.has(p.id));
  const rollup = computeNodeRollup(nodes, filtered, nodeId, { rag });
  if (!rollup) return <p>Node not found.</p>;
  const { totals, children, node } = rollup;
  const canAddProject = node.type === 'pd_hq' || node.type === 'hq_engrs' || node.type === 'hq';

  return (
    <section>
      {newProject && <NewProjectModal defaultPdHq={node.type === 'pd_hq' ? node.id : undefined} onClose={() => setNewProject(false)} />}
      <div className="screen-head">
        <h1>{node.name}</h1>
        <div className="head-tools">
          {canAddProject && (
            <button className="btn no-print" onClick={() => setNewProject(true)}>+ New project</button>
          )}
          <button
            className="btn-ghost no-print"
            onClick={() => {
              const csv = nodeBreakdownCsv(rollup);
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${node.id}-breakdown.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </button>
          <button
            className="btn-ghost no-print"
            onClick={() =>
              void downloadWorkbook(
                [
                  { name: 'Summary', aoa: [['Node', node.name], ['Contract', Math.round(rollup.totals.contractValue)], ['Billed', Math.round(rollup.totals.billed)], ['Received', Math.round(rollup.totals.received)], ['Health', rollup.totals.rag]] },
                  { name: 'Breakdown', aoa: nodeBreakdownAoa(rollup) },
                ],
                `${node.id}-breakdown.xlsx`,
              )
            }
          >
            Export Excel
          </button>
          <button className="btn-ghost no-print" onClick={() => window.print()}>Print brief</button>
          <RagThresholds />
          <RagBadge rag={totals.rag} />
        </div>
      </div>

      <FilterBar />
      <RagFilterChips projects={scopeProjects} />
      {filterActive && (
        <p className="muted small filter-note">
          Filtered view — {totals.projectCount} project{totals.projectCount === 1 ? '' : 's'} match; all figures re-aggregated.
        </p>
      )}

      <div className="kpi-grid">
        <KpiCard label="Projects" value={String(totals.projectCount)} />
        <KpiCard label="Contract value" value={formatMoney(totals.contractValue)} />
        <KpiCard label="Billed to date" value={formatMoney(totals.billed)} />
        <KpiCard label="Received" value={formatMoney(totals.received)} />
        <KpiCard
          label="Progress (weighted)"
          value={formatPct(totals.actualPct)}
          sub={
            <span className={totals.slippage < 0 ? 'neg' : 'pos'}>
              {totals.slippage >= 0 ? '+' : ''}
              {formatPct(totals.slippage)} vs plan
            </span>
          }
        />
      </div>

      <CollapsibleCard id="dash-breakdown" title={`${node.name} — breakdown`} focusable dockable>
        <table className="data-table" aria-label="Breakdown">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Contract</th>
              <th className="num">Billed</th>
              <th className="num">Received</th>
              <th className="num">Planned</th>
              <th className="num">Actual</th>
              <th className="num">Slippage</th>
              <th className="num" title="Composite 0–100: schedule 40% · billing alignment 30% · collection 30%">Score</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => navigate(`/node/${c.id}`)}>
                <td>{c.name}</td>
                <td className="num">{formatMoney(c.contractValue)}</td>
                <td className="num">{formatMoney(c.billed)}</td>
                <td className="num">{formatMoney(c.received)}</td>
                <td className="num">{formatPct(c.plannedPct)}</td>
                <td className="num">{formatPct(c.actualPct)}</td>
                <td className={`num ${c.slippage < 0 ? 'neg' : 'pos'}`}>
                  {c.slippage >= 0 ? '+' : ''}
                  {formatPct(c.slippage)}
                </td>
                <td className="num">
                  {(() => { const h = healthScore({ plannedPct: c.plannedPct, actualPct: c.actualPct, contractValue: c.contractValue, billed: c.billed, received: c.received });
                    return <span className={`health-score hs-${h.band}`} title={healthLabel(h)} aria-label={`Health score ${c.name}`}>{h.score}</span>; })()}
                </td>
                <td><RagBadge rag={c.rag} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{formatMoney(totals.contractValue)}</td>
              <td className="num">{formatMoney(totals.billed)}</td>
              <td className="num">{formatMoney(totals.received)}</td>
              <td className="num">{formatPct(totals.plannedPct)}</td>
              <td className="num">{formatPct(totals.actualPct)}</td>
              <td className={`num ${totals.slippage < 0 ? 'neg' : 'pos'}`}>
                {totals.slippage >= 0 ? '+' : ''}
                {formatPct(totals.slippage)}
              </td>
              <td><RagBadge rag={totals.rag} /></td>
            </tr>
          </tfoot>
        </table>
      </CollapsibleCard>

      <div className="panel-grid">
        <LeagueTable
          rows={children}
          projectIds={new Set(projects.map((p) => p.id))}
          onDetails={(id) => window.dispatchEvent(new CustomEvent('nlc:project-drawer', { detail: { projectId: id } }))}
        />
        <Exceptions nodeId={nodeId} projects={filtered} />
      </div>
      <BillingFunnel totals={totals} />
      <PortfolioSCurve nodeId={nodeId} projects={filtered} />
      <PortfolioPerformance projects={scopeProjects.filter((p) => filtered.some((f) => f.id === p.id))} />
      <HrCockpit nodeId={nodeId} nodes={nodes} />
      <ActivityFeed nodeId={nodeId} scopeIds={[nodeId, ...descendantNodes(nodes, nodeId).map((n) => n.id)]} />
      <NodeMap nodeId={nodeId} nodes={nodes} projects={projects} onSaved={refresh} hero={node.type === 'hq'} />
    </section>
  );
}

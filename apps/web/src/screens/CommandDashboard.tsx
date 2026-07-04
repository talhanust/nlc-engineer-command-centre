import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { useUiState } from '../state/UiState';
import { computeNodeRollup } from '../domain/rollup';
import { healthScore, healthLabel } from '../domain/health';
import { hrCostRollup } from '../domain/hrrollup';
import { useDashPrefs, DASH_PREF_LABEL, type DashPrefs } from '../state/dashPrefs';
import { nodeInScope } from '../domain/access';
import { DirectivesPanel } from '../components/DirectivesPanel';
import { SectionDashboards } from './SectionDashboards';
import { useRole } from '../state/Role';
import { useData as useDataCtx } from '../data/DataContext';
import type { HrUnit } from '../data/types';
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
  const { provider } = useDataCtx();
  const navigate = useNavigate();
  const [newProject, setNewProject] = useState(false);
  const [hrUnits, setHrUnits] = useState<HrUnit[]>([]);
  const { role, user } = useRole();
  const [prefs, patchPrefs] = useDashPrefs(role);
  const [customizing, setCustomizing] = useState(false);
  useEffect(() => {
    let a = true;
    provider.listAllHrUnits().then((u) => a && setHrUnits(u));
    return () => { a = false; };
  }, [provider]);

  // True re-aggregation: filter the project set, then roll up over it.
  const filtered = applyFilter(projects, nodes, filter, rag);
  const scopeIds = new Set(descendantProjectIds(nodes, nodeId));
  const scopeProjects = projects.filter((p) => scopeIds.has(p.id));
  const rollup = computeNodeRollup(nodes, filtered, nodeId, { rag });
  // Organisational scoping (req 3j(3)): a signed-in user sees only their subtree.
  if (user && !nodeInScope(nodes, user.nodeId, nodeId)) {
    return (
      <section className="card" role="alert" aria-label="Out of scope" style={{ padding: 24 }}>
        <h3>Outside your scope</h3>
        <p className="muted">Signed in as <strong>{user.name}</strong> — your access covers <strong>{nodes.find((n) => n.id === user.nodeId)?.name ?? user.nodeId}</strong> and below.</p>
        <button className="btn" onClick={() => navigate(`/node/${user.nodeId}`)}>Go to my dashboard</button>
      </section>
    );
  }
  if (!rollup) return <p>Node not found.</p>;
  const { totals, children, node } = rollup;
  const underCommand = filtered.filter((p) => nodeInScope(nodes, node.id, p.id));
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
          <button className="btn-ghost btn-mini" aria-label="Customize dashboard" onClick={() => setCustomizing((c) => !c)}>⚙ Customize</button>
          {customizing && (
            <div className="card" role="dialog" aria-label="Dashboard metrics" style={{ position: 'absolute', right: 0, top: 28, zIndex: 30, padding: '10px 14px', minWidth: 230 }}>
              <p className="muted small" style={{ marginTop: 0 }}>Metrics shown for <strong>{role}</strong> (saved per role):</p>
              {(Object.keys(DASH_PREF_LABEL) as Array<keyof DashPrefs>).map((k) => (
                <label key={k} className="small" style={{ display: 'block', margin: '4px 0' }}>
                  <input type="checkbox" checked={prefs[k]} onChange={(e) => patchPrefs({ [k]: e.target.checked })} /> {DASH_PREF_LABEL[k]}
                </label>
              ))}
              <p className="muted small" style={{ marginBottom: 0 }}>RAG thresholds are configured in the filter bar.</p>
            </div>
          )}
        </div>
        <table className="data-table" aria-label="Breakdown">
          <thead>
            <tr>
              <th>Name</th>
              {prefs.contract && <th className="num">Contract</th>}
              {prefs.billed && <th className="num">Billed</th>}
              {prefs.received && <th className="num">Received</th>}
              {prefs.planned && <th className="num">Planned</th>}
              {prefs.actual && <th className="num">Actual</th>}
              {prefs.slippage && <th className="num">Slippage</th>}
              {prefs.score && <th className="num" title="Composite 0–100: schedule 40% · billing alignment 30% · collection 30%">Score</th>}
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => navigate(`/node/${c.id}`)}>
                <td>{c.name}</td>
                {prefs.contract && <td className="num">{formatMoney(c.contractValue)}</td>}
                {prefs.billed && <td className="num">{formatMoney(c.billed)}</td>}
                {prefs.received && <td className="num">{formatMoney(c.received)}</td>}
                {prefs.planned && <td className="num">{formatPct(c.plannedPct)}</td>}
                {prefs.actual && <td className="num">{formatPct(c.actualPct)}</td>}
                {prefs.slippage && (
                <td className={`num ${c.slippage < 0 ? 'neg' : 'pos'}`}>
                  {c.slippage >= 0 ? '+' : ''}
                  {formatPct(c.slippage)}
                </td>
                )}
                {prefs.score && (
                <td className="num">
                  {(() => { const h = healthScore({ plannedPct: c.plannedPct, actualPct: c.actualPct, contractValue: c.contractValue, billed: c.billed, received: c.received });
                    return <span className={`health-score hs-${h.band}`} title={healthLabel(h)} aria-label={`Health score ${c.name}`}>{h.score}</span>; })()}
                </td>
                )}
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

      <CollapsibleCard id="dash-directives" title="Command directives" focusable dockable>
        <DirectivesPanel node={node} nodes={nodes} projectIds={underCommand.map((p) => p.id)} />
      </CollapsibleCard>

      {node.type !== 'project' && (
        <CollapsibleCard id="dash-sections" title="Staff sections — under-command drill-down" focusable dockable>
          <SectionDashboards node={node} nodes={nodes} projects={underCommand} />
        </CollapsibleCard>
      )}

      {prefs.hrRollup && (
      <CollapsibleCard id="dash-hr-rollup" title="Manpower cost roll-up (monthly)" focusable dockable>
        {(() => {
          const roll = hrCostRollup(nodes, hrUnits);
          const here = roll.get(node.id);
          if (!here) return <p className="muted">No establishment data.</p>;
          return (
            <div>
              <table className="data-table" aria-label="Manpower cost roll-up">
                <thead><tr><th>Node</th><th className="num">Own HR</th><th className="num">From children</th><th className="num">Reported total</th></tr></thead>
                <tbody>
                  <tr>
                    <td><strong>{node.name}</strong>{node.type === 'hq' && <span className="muted small"> (own HR shown, excluded from total)</span>}</td>
                    <td className="num">{formatMoney(here.own)}</td>
                    <td className="num">{formatMoney(here.fromChildren)}</td>
                    <td className="num"><strong>{formatMoney(here.total)}</strong></td>
                  </tr>
                  {children.map((c) => {
                    const r = roll.get(c.id);
                    if (!r) return null;
                    return (
                      <tr key={c.id} className="row-link" onClick={() => navigate(`/node/${c.id}`)}>
                        <td style={{ paddingLeft: 18 }}>{c.name}</td>
                        <td className="num">{formatMoney(r.own)}</td>
                        <td className="num">{formatMoney(r.fromChildren)}</td>
                        <td className="num">{formatMoney(r.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted small" style={{ marginTop: 6 }}>
                Rule: project = own HR · HQ-PD and HQ-Engrs include their own HR · top HQ reports children only, excluding its own HR. Seats × pay band, held basis.
              </p>
            </div>
          );
        })()}
      </CollapsibleCard>
      )}

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

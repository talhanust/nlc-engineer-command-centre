import { useSearchParams } from 'react-router-dom';
import { BoqRegister } from './BoqRegister';
import { IpcRegister } from './IpcRegister';
import { RarRegister } from './RarRegister';
import { EscalationTab } from './EscalationTab';
import { RetentionTab } from './RetentionTab';
import { ReconciliationTab } from './ReconciliationTab';
import { DistributionsTab } from './DistributionsTab';
import { DistributionPlanner } from './DistributionPlanner';
import { ExecutionTracker } from './ExecutionTracker';
import { GenerateIpc } from './GenerateIpc';
import { GenerateRar } from './GenerateRar';
import { AgingTab } from './AgingTab';
import { MarginAnalyticsTab } from './MarginAnalyticsTab';
import { CashFlowTab } from './CashFlowTab';
import { AlertCentre } from './AlertCentre';
import { CommercialDashboard } from './CommercialDashboard';
import { VariationsTab } from './VariationsTab';
import { EvmTab } from './EvmTab';
import { NewSubletContract } from './NewSubletContract';
import { ContractsRegister } from './ContractsRegister';
import { CommercialConfigTab } from './CommercialConfigTab';
import { RevenueComposition } from './RevenueComposition';
import { CommercialAlerts } from './CommercialAlerts';
import { CalendarTab } from './CalendarTab';
import { ContractorProfiles } from './ContractorProfiles';
import { AdvancesTab } from './AdvancesTab';

const SUBS = [
  ['dashboard', 'Dashboard'],
  ['alerts', 'Alert centre'],
  ['boq', 'Bill of Quantities'],
  ['genipc', 'Generate IPC'],
  ['ipc', 'IPC register'],
  ['genrar', 'Generate RAR'],
  ['rar', 'RAR Register'],
  ['recon', 'Reconciliation'],
  ['revenue', 'Revenue composition'],
  ['cashflow', 'Cash flow'],
  ['retention', 'Retention'],
  ['calendar', 'Calendar'],
  ['epc', 'Escalation'],
  ['subs', 'Contractors'],
  ['contracts', 'Contracts'],
  ['newsublet', 'New sublet contract'],
  ['config', 'Deductions & retention'],
  ['planner', 'Distribution planner'],
  ['exectrack', 'Execution tracker'],
  ['variations', 'Variations'],
  ['dist', 'Distributions'],
  ['adv', 'Advances'],
  ['aging', 'Aging'],
  ['margin', 'Margin analytics'],
  ['evm', 'Earned value'],
] as const;
type Sub = (typeof SUBS)[number][0];

const SUB_IDS = new Set<string>(SUBS.map(([id]) => id));

export function CommercialTab({ projectId, onNavigateTab }: { projectId: string; onNavigateTab?: (tab: string) => void }) {
  const [params, setParams] = useSearchParams();
  // The sub-tab lives in the URL (?sub=aging), so an alert — or a bookmark, or a
  // shared link — can land directly on the screen that holds the fix, not just the
  // commercial tab. Falls back to the BOQ register for a missing/unknown value.
  const raw = params.get('sub');
  // No param → the BOQ register (the default landing). A param that names a real
  // sub-tab → that tab. An unknown param → the overview, which is the safe home
  // for an alert whose target isn't a commercial sub-tab (e.g. a directive).
  const sub = (raw == null ? 'boq' : SUB_IDS.has(raw) ? raw : 'dashboard') as Sub;
  const setSub = (next: Sub) => setParams((p) => { p.set('sub', next); return p; }, { replace: true });
  return (
    <div>
      <CommercialAlerts projectId={projectId} onNavigate={(s) => {
        // Some alerts point at a DIFFERENT top-level tab (mapping), not a
        // commercial sub-tab. Route those up; keep sub-tab targets local.
        if (s === 'mapping' && onNavigateTab) { onNavigateTab('mapping'); return; }
        if (SUB_IDS.has(s)) setSub(s as Sub);
      }} />
      <div className="subtabs" role="tablist">
        {SUBS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={sub === id}
            className={`subtab${sub === id ? ' active' : ''}`}
            onClick={() => setSub(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === 'boq' && <BoqRegister projectId={projectId} />}
      {sub === 'dashboard' && <CommercialDashboard projectId={projectId} onNavigate={(s) => setSub(s as Sub)} />}
      {sub === 'alerts' && <AlertCentre projectId={projectId} />}
      {sub === 'cashflow' && <CashFlowTab projectId={projectId} />}
      {sub === 'genipc' && <GenerateIpc projectId={projectId} onGenerated={() => setSub('ipc')} />}
      {sub === 'ipc' && <IpcRegister projectId={projectId} />}
      {sub === 'rar' && <RarRegister projectId={projectId} />}
      {sub === 'genrar' && <GenerateRar projectId={projectId} onGenerated={() => setSub('rar')} />}
      {sub === 'recon' && <ReconciliationTab projectId={projectId} />}
      {sub === 'revenue' && <RevenueComposition projectId={projectId} />}
      {sub === 'retention' && <RetentionTab projectId={projectId} />}
      {sub === 'calendar' && <CalendarTab projectId={projectId} onNavigate={(s) => setSub(s as Sub)} />}
      {sub === 'epc' && <EscalationTab projectId={projectId} />}
      {sub === 'subs' && <ContractorProfiles projectId={projectId} />}
      {sub === 'contracts' && <ContractsRegister projectId={projectId} />}
      {sub === 'newsublet' && <NewSubletContract projectId={projectId} onCreated={() => setSub('contracts')} />}
      {sub === 'config' && <CommercialConfigTab projectId={projectId} />}
      {sub === 'planner' && <DistributionPlanner projectId={projectId} />}
      {sub === 'exectrack' && <ExecutionTracker projectId={projectId} onManageDistribution={() => setSub('dist')} />}
      {sub === 'dist' && <DistributionsTab projectId={projectId} />}
      {sub === 'adv' && <AdvancesTab projectId={projectId} />}
      {sub === 'variations' && <VariationsTab projectId={projectId} />}
      {sub === 'aging' && <AgingTab projectId={projectId} />}
      {sub === 'margin' && <MarginAnalyticsTab projectId={projectId} />}
      {sub === 'evm' && <EvmTab projectId={projectId} />}
    </div>
  );
}

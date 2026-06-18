import { useState } from 'react';
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
import { ContractorProfiles } from './ContractorProfiles';
import { AdvancesTab } from './AdvancesTab';

const SUBS = [
  ['boq', 'Bill of Quantities'],
  ['genipc', 'Generate IPC'],
  ['ipc', 'IPC register'],
  ['rar', 'RAR & recovery'],
  ['recon', 'Reconciliation'],
  ['retention', 'Retention'],
  ['epc', 'Escalation'],
  ['subs', 'Contractors'],
  ['planner', 'Distribution planner'],
  ['exectrack', 'Execution tracker'],
  ['dist', 'Distributions'],
  ['adv', 'Advances'],
] as const;
type Sub = (typeof SUBS)[number][0];

export function CommercialTab({ projectId }: { projectId: string }) {
  const [sub, setSub] = useState<Sub>('boq');
  return (
    <div>
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
      {sub === 'genipc' && <GenerateIpc projectId={projectId} onGenerated={() => setSub('ipc')} />}
      {sub === 'ipc' && <IpcRegister projectId={projectId} />}
      {sub === 'rar' && <RarRegister projectId={projectId} />}
      {sub === 'recon' && <ReconciliationTab projectId={projectId} />}
      {sub === 'retention' && <RetentionTab projectId={projectId} />}
      {sub === 'epc' && <EscalationTab projectId={projectId} />}
      {sub === 'subs' && <ContractorProfiles projectId={projectId} />}
      {sub === 'planner' && <DistributionPlanner projectId={projectId} />}
      {sub === 'exectrack' && <ExecutionTracker projectId={projectId} onManageDistribution={() => setSub('dist')} />}
      {sub === 'dist' && <DistributionsTab projectId={projectId} />}
      {sub === 'adv' && <AdvancesTab projectId={projectId} />}
    </div>
  );
}

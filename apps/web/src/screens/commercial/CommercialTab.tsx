import { useState } from 'react';
import { BoqRegister } from './BoqRegister';
import { IpcRegister } from './IpcRegister';
import { RarRegister } from './RarRegister';
import { EpcRegister } from './EpcRegister';
import { RetentionTab } from './RetentionTab';
import { ReconciliationTab } from './ReconciliationTab';
import { SubcontractorsTab } from './SubcontractorsTab';
import { DistributionsTab } from './DistributionsTab';
import { AdvancesTab } from './AdvancesTab';

const SUBS = [
  ['boq', 'Bill of Quantities'],
  ['ipc', 'IPC register'],
  ['rar', 'RAR & recovery'],
  ['recon', 'Reconciliation'],
  ['retention', 'Retention'],
  ['epc', 'Escalation'],
  ['subs', 'Subcontractors'],
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
      {sub === 'ipc' && <IpcRegister projectId={projectId} />}
      {sub === 'rar' && <RarRegister projectId={projectId} />}
      {sub === 'recon' && <ReconciliationTab projectId={projectId} />}
      {sub === 'retention' && <RetentionTab projectId={projectId} />}
      {sub === 'epc' && <EpcRegister projectId={projectId} />}
      {sub === 'subs' && <SubcontractorsTab projectId={projectId} />}
      {sub === 'dist' && <DistributionsTab projectId={projectId} />}
      {sub === 'adv' && <AdvancesTab projectId={projectId} />}
    </div>
  );
}

import { useState } from 'react';
import { ROLE_LABEL, chainStages } from '../../domain/chains';
import type { ProcChainType } from '../../data/types';
import { DemandsTab } from './DemandsTab';
import { InboxTab } from './InboxTab';
import { PoCrvTab } from './PoCrvTab';
import { ProcPaymentsTab } from './ProcPaymentsTab';
import { SuppliersHiresTab } from './SuppliersHiresTab';
import { InventoryTab, PolTab, FixedAssetsTab, MaintenanceTab } from './AssetsTabs';
import { MachineryTab } from './MachineryTab';
import { LeadTimesTab } from './LeadTimesTab';

const ROLES = ['pic', 'pm', 'pd', 'comd_engrs', 'dir_sp', 'dg', 'preaudit', 'fm', 'fh', 'manager_procurement'];
const SUB = ['inbox', 'demands', 'pocrv', 'leadtimes', 'payments', 'vendors', 'inventory', 'machinery', 'pol', 'fixedassets', 'maintenance'] as const;
type Sub = (typeof SUB)[number];
const LABEL: Record<Sub, string> = {
  inbox: 'Approval inbox', demands: 'Demands', pocrv: 'POs & CRVs', payments: 'Payments', vendors: 'Suppliers & hires',
  inventory: 'Inventory', machinery: 'Machinery hire', pol: 'POL', fixedassets: 'Fixed assets', maintenance: 'Maintenance', leadtimes: 'Lead times',
};

/** Stage progress chips for a chain document. */
export function ChainProgress({ chainType, currentStage }: { chainType: ProcChainType; currentStage: number }) {
  const stages = chainStages(chainType);
  return (
    <div className="chain">
      {stages.map((s) => (
        <span
          key={s.index}
          className={`chain-step ${s.index <= currentStage ? 'done' : s.index === currentStage + 1 ? 'next' : 'todo'}`}
          title={`${s.name} — ${ROLE_LABEL[s.role]}`}
        >
          {ROLE_LABEL[s.role]}
        </span>
      ))}
    </div>
  );
}

export function ProcurementTab({ projectId }: { projectId: string }) {
  const [sub, setSub] = useState<Sub>('inbox');
  // Local mode has no RBAC, so the acting role is chosen explicitly.
  const [role, setRole] = useState('pd');

  return (
    <div>
      <div className="proc-rolebar">
        <label>
          Acting as:{' '}
          <select aria-label="Acting role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (<option key={r} value={r}>{ROLE_LABEL[r]}</option>))}
          </select>
        </label>
        <span className="muted small">Demo only — production derives your role from sign-in (RBAC).</span>
      </div>

      <div className="subtabs" role="tablist">
        {SUB.map((s) => (
          <button key={s} role="tab" aria-selected={sub === s} className={`subtab${sub === s ? ' active' : ''}`} onClick={() => setSub(s)}>
            {LABEL[s]}
          </button>
        ))}
      </div>

      {sub === 'inbox' && <InboxTab projectId={projectId} role={role} />}
      {sub === 'demands' && <DemandsTab projectId={projectId} role={role} />}
      {sub === 'pocrv' && <PoCrvTab projectId={projectId} />}
      {sub === 'payments' && <ProcPaymentsTab projectId={projectId} role={role} />}
      {sub === 'vendors' && <SuppliersHiresTab projectId={projectId} />}
      {sub === 'inventory' && <InventoryTab projectId={projectId} />}
      {sub === 'pol' && <PolTab projectId={projectId} />}
      {sub === 'machinery' && <MachineryTab projectId={projectId} />}
      {sub === 'leadtimes' && <LeadTimesTab projectId={projectId} />}
      {sub === 'fixedassets' && <FixedAssetsTab projectId={projectId} />}
      {sub === 'maintenance' && <MaintenanceTab projectId={projectId} role={role} />}
    </div>
  );
}

import type { MachineryUsage } from '../data/types';

export interface MachineryRecoveryRow {
  contractorId: string;
  usageValue: number;  // Σ hours × rate
  recovered: number;
  balance: number;     // usageValue − recovered (to recover)
  logs: number;
}

export function usageValue(m: MachineryUsage): number {
  return (m.rate ?? 0) * m.hours;
}

/** Per-contractor machinery hired → recovered → balance to recover. */
export function machineryRecovery(usage: MachineryUsage[]): MachineryRecoveryRow[] {
  const byContractor = new Map<string, MachineryRecoveryRow>();
  for (const m of usage) {
    if (!m.contractorId) continue;
    const row = byContractor.get(m.contractorId)
      ?? { contractorId: m.contractorId, usageValue: 0, recovered: 0, balance: 0, logs: 0 };
    row.usageValue += usageValue(m);
    row.recovered += m.recovered ?? 0;
    row.logs += 1;
    row.balance = +(row.usageValue - row.recovered).toFixed(2);
    byContractor.set(m.contractorId, row);
  }
  return [...byContractor.values()];
}

export function totalMachineryToRecover(usage: MachineryUsage[]): number {
  return machineryRecovery(usage).reduce((s, r) => s + r.balance, 0);
}

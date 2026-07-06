import type { MaterialIssue } from '../data/types';

export interface MaterialRecoveryRow {
  contractorId: string;
  issuedValue: number;  // Σ qty × rate
  recovered: number;    // Σ recovered
  balance: number;      // issuedValue − recovered (to recover)
  issues: number;
}

export function issueValue(i: MaterialIssue): number {
  return (i.rate ?? 0) * i.qty;
}

/** Per-contractor material issued → recovered → balance to recover. */
export function materialRecovery(issues: MaterialIssue[]): MaterialRecoveryRow[] {
  const byContractor = new Map<string, MaterialRecoveryRow>();
  for (const i of issues) {
    if (!i.contractorId) continue;
    const row = byContractor.get(i.contractorId)
      ?? { contractorId: i.contractorId, issuedValue: 0, recovered: 0, balance: 0, issues: 0 };
    row.issuedValue += issueValue(i);
    row.recovered += i.recovered ?? 0;
    row.issues += 1;
    row.balance = +(row.issuedValue - row.recovered).toFixed(2);
    byContractor.set(i.contractorId, row);
  }
  return [...byContractor.values()];
}

export function totalBalanceToRecover(issues: MaterialIssue[]): number {
  return materialRecovery(issues).reduce((s, r) => s + r.balance, 0);
}

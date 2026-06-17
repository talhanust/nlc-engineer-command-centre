import type { Crv, MaterialIssue } from '../data/types';

export interface MaterialReconRow {
  code: string;
  received: number; // cumulative from CRVs
  issued: number; // cumulative from material issues
  balance: number; // on hand
}

/**
 * Reconcile materials: CRVs record receipts into store, material issues record
 * consumption to work. Balance on hand = received − issued, per material code.
 */
export function reconcileMaterials(crvs: Crv[], issues: MaterialIssue[]): MaterialReconRow[] {
  const received = new Map<string, number>();
  for (const c of crvs) {
    for (const line of c.received) {
      received.set(line.code, (received.get(line.code) ?? 0) + line.qtyReceived);
    }
  }
  const issued = new Map<string, number>();
  for (const i of issues) {
    issued.set(i.materialCode, (issued.get(i.materialCode) ?? 0) + i.qty);
  }
  const codes = new Set<string>([...received.keys(), ...issued.keys()]);
  return Array.from(codes)
    .sort()
    .map((code) => {
      const r = received.get(code) ?? 0;
      const iss = issued.get(code) ?? 0;
      return { code, received: r, issued: iss, balance: r - iss };
    });
}

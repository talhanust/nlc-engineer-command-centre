// Contractors, sublet/labor contracts, RARs and variation orders are no longer
// seeded — a project starts as NLC self-execution and the user creates these
// through the real flows. Tests that exercise the DOWNSTREAM behaviour (contract
// detail, RAR pipeline, distribution freeze, recoveries) need those records to
// exist first, so this helper builds them through the provider exactly as a user
// would, then lets the test drive the UI.
//
// Crucially it runs the one-per-version seed reconciliation FIRST (via listNodes),
// which purges cached entities for seeded projects and stamps the version — so the
// app's own boot afterwards leaves the records seeded here intact.

import { LocalDataProvider } from './data/LocalDataProvider';
import type { ContractLine } from './data/types';

const RAR_WALK: Record<string, string[]> = {
  draft: [],
  submitted: ['submit'],
  verified: ['submit', 'verify'],
  approved: ['submit', 'verify', 'approve'],
  marked_payment: ['submit', 'verify', 'approve', 'mark_payment'],
  paid: ['submit', 'verify', 'approve', 'mark_payment', 'pay'],
};

const VO_WALK: Record<string, string[]> = {
  draft: [],
  submitted: ['submit'],
  recommended: ['submit', 'recommend'],
  approved: ['submit', 'recommend', 'approve'],
};

export interface SeedCommercialOptions {
  /** Contractor name (default 'Husnain Cotex'). */
  contractor?: string;
  /** How many BOQ items the contract's BOQ covers (default 3). */
  lines?: number;
  /** Distribute each contract line as sublet work so RAR/exec screens see it. */
  distribute?: boolean;
  /** RAR target statuses, one per RAR to create. */
  rarStatuses?: string[];
  /** Also record executed progress against the contract's items. */
  execute?: boolean;
  /** Variation target statuses, one per VO to create. */
  variationStatuses?: string[];
}

export interface SeededCommercial {
  provider: LocalDataProvider;
  contractId: string;
  contractNo: string;
  subcontractorId: string;
  itemIds: string[];
  rarNos: string[];
  voNos: string[];
}

export async function seedCommercial(projectId: string, opts: SeedCommercialOptions = {}): Promise<SeededCommercial> {
  const p = new LocalDataProvider();
  await p.listNodes(); // run + stamp seed reconciliation before we write anything
  const boq = await p.listBoq(projectId);
  const n = Math.max(1, opts.lines ?? 3);
  const items = boq.slice(0, n);

  const lines: ContractLine[] = items.map((it) => ({
    boqItemId: it.id, qty: Math.max(1, Math.floor(it.qty * 0.4)), rate: Math.round(it.rate * 0.88),
  }));
  const contract = await p.createSubletContract(projectId, {
    title: 'Earthworks — Zone 1', kind: 'sublet',
    subcontractor: { name: opts.contractor ?? 'Husnain Cotex', trade: 'Earthworks', pecCategory: 'C-3' },
    lines,
  });

  if (opts.distribute || opts.rarStatuses || opts.execute) {
    for (const l of lines) {
      await p.setDistribution(projectId, {
        boqItemId: l.boqItemId, projectId, mode: 'sublet', subcontractorId: contract.subcontractorId, allocatedQty: l.qty,
      });
    }
  }

  if (opts.execute) {
    for (const l of lines) {
      await p.upsertProgress(projectId, { boqItemId: l.boqItemId, period: 'M1', executedQty: Math.floor(l.qty * 0.6), role: 'qs' });
    }
  }

  const rarNos: string[] = [];
  for (const status of opts.rarStatuses ?? []) {
    const first = items[0];
    const gross = Math.round(first.qty * 0.1 * first.rate);
    const rar = await p.createRar(projectId, {
      period: `Month ${rarNos.length + 1}`, subcontractorId: contract.subcontractorId, contractId: contract.id, gross,
      lines: items.map((it) => ({ boqItemId: it.id, qty: Math.floor(it.qty * 0.05), rate: Math.round(it.rate * 0.88), amount: Math.round(it.qty * 0.05 * it.rate * 0.88) })),
    });
    for (const action of RAR_WALK[status] ?? ['submit']) await p.transitionRar(projectId, rar.rarNo, action);
    rarNos.push(rar.rarNo);
  }

  const voNos: string[] = [];
  for (const status of opts.variationStatuses ?? []) {
    const vo = await p.createVariation(projectId, { title: `Variation ${voNos.length + 1}`, type: 'addition', amount: 1_000_000 });
    for (const action of VO_WALK[status] ?? []) await p.transitionVariation(projectId, vo.voNo, action);
    voNos.push(vo.voNo);
  }

  return {
    provider: p, contractId: contract.id, contractNo: contract.contractNo,
    subcontractorId: contract.subcontractorId, itemIds: items.map((i) => i.id), rarNos, voNos,
  };
}

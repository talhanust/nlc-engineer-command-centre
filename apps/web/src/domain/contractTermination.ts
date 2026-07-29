// Terminating a subcontract, the way a real one ends early.
//
// An awarded contract is a commitment that has partly been performed. You cannot
// delete it — work has been measured and paid, and the record of what was built
// under it must survive. What you can do is DETERMINE it (complete it normally) or
// TERMINATE it (end it early). On termination:
//
//   - executed quantities stay LOCKED to this contract — that work is done and
//     payable, and re-awarding it to someone else would be fiction;
//   - unexecuted quantities are RELEASED back to the plan, free to be re-awarded
//     to another contractor, exactly as they were before this contract took them.
//
// So a termination rewrites the contract's own lines down to what was executed,
// and reports the value released so the planner can offer it again.

import type { Contract, ContractLine, ProgressUpdate } from '../data/types';

export interface TerminationLine {
  boqItemId: string;
  awardedQty: number;
  executedQty: number;
  releasedQty: number;
  rate: number;
  executedValue: number;
  releasedValue: number;
}

export interface TerminationResult {
  /** Lines rewritten to the executed quantity (what stays with the contract). */
  keptLines: ContractLine[];
  perLine: TerminationLine[];
  executedValue: number;
  releasedValue: number;
  /** True when nothing was executed — the whole contract is released. */
  fullyReleased: boolean;
}

/**
 * Work out what a contract keeps and what it releases if terminated now.
 * `executedByItem` is the validated executed quantity per BOQ item; a line keeps
 * min(executed, awarded) and releases the rest.
 */
export function computeTermination(contract: Contract, executedByItem: Map<string, number>): TerminationResult {
  const perLine: TerminationLine[] = [];
  const keptLines: ContractLine[] = [];
  let executedValue = 0;
  let releasedValue = 0;

  for (const l of contract.lines ?? []) {
    const executed = Math.max(0, Math.min(executedByItem.get(l.boqItemId) ?? 0, l.qty));
    const released = Math.max(0, l.qty - executed);
    const eVal = executed * l.rate;
    const rVal = released * l.rate;
    executedValue += eVal;
    releasedValue += rVal;
    perLine.push({
      boqItemId: l.boqItemId, awardedQty: l.qty, executedQty: executed, releasedQty: released,
      rate: l.rate, executedValue: eVal, releasedValue: rVal,
    });
    // Only executed work stays on the contract. A line executed to zero drops off
    // entirely — it releases in full.
    if (executed > 0) keptLines.push({ boqItemId: l.boqItemId, qty: executed, rate: l.rate });
  }

  return {
    keptLines, perLine, executedValue, releasedValue,
    fullyReleased: executedValue === 0,
  };
}

/** Sum validated executed quantity per BOQ item, for the map above. */
export function executedByItem(progress: ProgressUpdate[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of progress) {
    if (p.status !== 'validated') continue; // only measured, validated work locks
    m.set(p.boqItemId, (m.get(p.boqItemId) ?? 0) + p.executedQty);
  }
  return m;
}

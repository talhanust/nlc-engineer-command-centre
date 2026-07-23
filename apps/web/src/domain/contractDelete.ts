// When a contract may be deleted from the register.
//
// Deleting a contract is not the same as ending one. A contract that has been
// billed against carries financial history — RARs recording work measured and
// money paid — and removing it would orphan those records, leaving payments
// attached to a contract that no longer exists. That is never a correction; it
// is a hole in the audit trail. So billing is a HARD block, and the remedy is to
// remove the RARs first or to close the contract instead.
//
// Everything else is a warning, not a block. A contract awarded to the wrong
// subcontractor, a duplicate raised in error — these are real mistakes that need
// a real way out, and refusing outright would leave a wrong record permanently in
// the register, which is worse than a recorded deletion.

import type { Contract, Rar } from '../data/types';

export interface DeleteContractCheck {
  /** False only when deleting would orphan financial records. */
  allowed: boolean;
  /** Why it is blocked — present only when `allowed` is false. */
  blockedReason?: string;
  /** Consequences the user should see before confirming. */
  warnings: string[];
  /** RARs billed against this contract. */
  rarCount: number;
  /** BOQ quantity that will be released back to the planner. */
  releasedLines: number;
}

export function canDeleteContract(contract: Contract, rars: Rar[]): DeleteContractCheck {
  const linked = rars.filter((r) => r.contractId === contract.id);
  const warnings: string[] = [];

  const lineCount = contract.lines?.length ?? 0;
  if (lineCount > 0) {
    warnings.push(`${lineCount} BOQ line(s) will be released — those quantities become unallocated in the distribution planner.`);
  }
  if (contract.status !== 'draft') {
    // An award is an act with a date and an approval chain behind it.
    warnings.push(`This contract is ${contract.status.replace('_', ' ')}, not a draft — it records a commitment that was actually made.`);
  }
  if (contract.chain) {
    warnings.push('Its appointment-approval chain will be deleted with it.');
  }

  if (linked.length > 0) {
    return {
      allowed: false,
      blockedReason: `${linked.length} RAR(s) are billed against this contract (${linked.map((r) => r.rarNo).slice(0, 5).join(', ')}${linked.length > 5 ? '…' : ''}). Deleting it would leave those payment records without a contract. Remove the RARs first, or close the contract instead.`,
      warnings, rarCount: linked.length, releasedLines: lineCount,
    };
  }
  return { allowed: true, warnings, rarCount: 0, releasedLines: lineCount };
}

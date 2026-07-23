// Revising a contract's BOQ, rather than deleting the contract and starting over.
//
// Re-uploading a corrected sheet is the normal case: a rate column was read from
// the wrong block, quantities were provisional, an item was missed. Deleting the
// contract to fix that throws away its number, its approval chain and its audit
// history — and if anything has been billed, it is not even possible.
//
// So a revision is a DIFF the user approves: what is being added, removed and
// changed, and what it does to the contract value. Showing the delta before it is
// applied is the difference between an informed correction and a hopeful one.

import type { BoqItem, ContractLine } from '../data/types';

export interface LineChange {
  boqItemId: string;
  code: string;
  description: string;
  unit: string;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
  /** Present for removed / changed / unchanged. */
  fromQty?: number;
  fromRate?: number;
  /** Present for added / changed / unchanged. */
  toQty?: number;
  toRate?: number;
  fromAmount: number;
  toAmount: number;
  /** toAmount − fromAmount. */
  delta: number;
}

export interface ContractLineDiff {
  changes: LineChange[];
  added: LineChange[];
  removed: LineChange[];
  changed: LineChange[];
  unchanged: LineChange[];
  fromValue: number;
  toValue: number;
  delta: number;
  /** True when nothing at all would change. */
  identical: boolean;
}

const EPS = 1e-6;
const amt = (q?: number, r?: number) => (q ?? 0) * (r ?? 0);

export function diffContractLines(current: ContractLine[], next: ContractLine[], items: BoqItem[]): ContractLineDiff {
  const itemById = new Map(items.map((i) => [i.id, i]));
  // Fold repeated lines for the same item so a diff never double-counts.
  const fold = (ls: ContractLine[]) => {
    const m = new Map<string, ContractLine>();
    for (const l of ls) {
      const prev = m.get(l.boqItemId);
      m.set(l.boqItemId, prev ? { ...l, qty: prev.qty + l.qty } : { ...l });
    }
    return m;
  };
  const cur = fold(current);
  const nxt = fold(next);

  const changes: LineChange[] = [];
  for (const id of new Set([...cur.keys(), ...nxt.keys()])) {
    const a = cur.get(id);
    const b = nxt.get(id);
    const item = itemById.get(id);
    const base = {
      boqItemId: id,
      code: item?.code ?? id,
      description: item?.description ?? '(item no longer in the BOQ)',
      unit: item?.unit ?? '',
    };
    const fromAmount = amt(a?.qty, a?.rate);
    const toAmount = amt(b?.qty, b?.rate);

    let kind: LineChange['kind'];
    if (a && !b) kind = 'removed';
    else if (!a && b) kind = 'added';
    else if (Math.abs((a!.qty - b!.qty)) > EPS || Math.abs((a!.rate - b!.rate)) > EPS) kind = 'changed';
    else kind = 'unchanged';

    changes.push({
      ...base, kind,
      fromQty: a?.qty, fromRate: a?.rate, toQty: b?.qty, toRate: b?.rate,
      fromAmount, toAmount, delta: toAmount - fromAmount,
    });
  }

  // Most consequential first: biggest absolute money movement.
  changes.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.code.localeCompare(y.code));

  const fromValue = changes.reduce((s, c) => s + c.fromAmount, 0);
  const toValue = changes.reduce((s, c) => s + c.toAmount, 0);
  const added = changes.filter((c) => c.kind === 'added');
  const removed = changes.filter((c) => c.kind === 'removed');
  const changed = changes.filter((c) => c.kind === 'changed');
  const unchanged = changes.filter((c) => c.kind === 'unchanged');

  return {
    changes, added, removed, changed, unchanged,
    fromValue, toValue, delta: toValue - fromValue,
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

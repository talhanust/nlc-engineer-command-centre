import type { HrUnit } from '../data/types';

export interface UnitDelta {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed';
  authFrom?: number; authTo?: number;
  heldFrom?: number; heldTo?: number;
}

export interface EstablishmentDiff {
  added: UnitDelta[];
  removed: UnitDelta[];
  changed: UnitDelta[];
  authDelta: number;   // current − base (authorised)
  heldDelta: number;
}

/**
 * Diff a base snapshot against the current establishment. Units are matched by
 * id; a change is reported when auth or held differ.
 */
export function diffEstablishment(base: HrUnit[], current: HrUnit[]): EstablishmentDiff {
  const baseById = new Map(base.map((u) => [u.id, u]));
  const curById = new Map(current.map((u) => [u.id, u]));
  const added: UnitDelta[] = [];
  const removed: UnitDelta[] = [];
  const changed: UnitDelta[] = [];

  for (const u of current) {
    const b = baseById.get(u.id);
    if (!b) { added.push({ id: u.id, title: u.title, kind: 'added', authTo: u.auth, heldTo: u.held }); }
    else if (b.auth !== u.auth || b.held !== u.held) {
      changed.push({ id: u.id, title: u.title, kind: 'changed', authFrom: b.auth, authTo: u.auth, heldFrom: b.held, heldTo: u.held });
    }
  }
  for (const b of base) {
    if (!curById.has(b.id)) removed.push({ id: b.id, title: b.title, kind: 'removed', authFrom: b.auth, heldFrom: b.held });
  }

  const sum = (list: HrUnit[], k: 'auth' | 'held') => list.reduce((a, u) => a + u[k], 0);
  return {
    added, removed, changed,
    authDelta: sum(current, 'auth') - sum(base, 'auth'),
    heldDelta: sum(current, 'held') - sum(base, 'held'),
  };
}

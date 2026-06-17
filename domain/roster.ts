import type { HrPerson, HrPersonStatus } from '../data/types';

export const STATUS_LABEL: Record<HrPersonStatus, string> = {
  present: 'Present', leave: 'On leave', detached: 'Detached', training: 'Training',
};

export interface Occupancy { named: number; present: number }

/** Named + present headcount per unit id. */
export function occupancyByUnit(people: HrPerson[]): Map<string, Occupancy> {
  const m = new Map<string, Occupancy>();
  for (const p of people) {
    if (!p.unitId) continue;
    const cur = m.get(p.unitId) ?? { named: 0, present: 0 };
    cur.named += 1;
    if (p.status === 'present') cur.present += 1;
    m.set(p.unitId, cur);
  }
  return m;
}

export function statusCounts(people: HrPerson[]): Record<HrPersonStatus, number> {
  const out: Record<HrPersonStatus, number> = { present: 0, leave: 0, detached: 0, training: 0 };
  for (const p of people) out[p.status] += 1;
  return out;
}

export const presentStrength = (people: HrPerson[]): number =>
  people.filter((p) => p.status === 'present').length;

export const benchPeople = (people: HrPerson[]): HrPerson[] =>
  people.filter((p) => !p.unitId);

export const peopleInUnit = (people: HrPerson[], unitId: string): HrPerson[] =>
  people.filter((p) => p.unitId === unitId);

/** Up to two initials for an avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic hue from a string, for avatar tints. */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

import { describe, it, expect } from 'vitest';
import {
  occupancyByUnit, statusCounts, presentStrength, benchPeople, peopleInUnit, initials,
} from './roster';
import {
  scaleLevel, bandForScale, costBySection, totalMonthlyCost,
} from './hrcost';
import type { HrPerson, HrUnit } from '../data/types';

const people: HrPerson[] = [
  { id: 'p1', nodeId: 'n', unitId: 'u1', name: 'Asad Khan', status: 'present' },
  { id: 'p2', nodeId: 'n', unitId: 'u1', name: 'Bilal Ahmed', status: 'leave' },
  { id: 'p3', nodeId: 'n', unitId: 'u2', name: 'Zara Malik', status: 'present' },
  { id: 'p4', nodeId: 'n', unitId: null, name: 'Reserve One', status: 'present' },
];

describe('roster domain', () => {
  it('counts occupancy and present per unit', () => {
    const occ = occupancyByUnit(people);
    expect(occ.get('u1')).toEqual({ named: 2, present: 1 });
    expect(occ.get('u2')).toEqual({ named: 1, present: 1 });
  });
  it('summarises status and present strength', () => {
    expect(statusCounts(people)).toEqual({ present: 3, leave: 1, detached: 0, training: 0 });
    expect(presentStrength(people)).toBe(3);
  });
  it('finds bench and unit members', () => {
    expect(benchPeople(people).map((p) => p.id)).toEqual(['p4']);
    expect(peopleInUnit(people, 'u1').map((p) => p.id)).toEqual(['p1', 'p2']);
  });
  it('derives initials', () => {
    expect(initials('Asad Khan')).toBe('AK');
    expect(initials('Zara')).toBe('ZA');
  });
});

const units: HrUnit[] = [
  { id: 'head', nodeId: 'n', parentId: null, title: 'PM', scale: 'NLC-18', auth: 1, held: 1, order: 0 },
  { id: 's1', nodeId: 'n', parentId: 'head', title: 'Contract Sec', auth: 4, held: 3, order: 0 },
  { id: 's1a', nodeId: 'n', parentId: 's1', title: 'QS', scale: 'NLC-17', auth: 2, held: 2, order: 0 },
  { id: 's1b', nodeId: 'n', parentId: 's1', title: 'AQS', scale: 'NLC-14-15', auth: 2, held: 1, order: 1 },
  { id: 's2', nodeId: 'n', parentId: 'head', title: 'Security', scale: 'NLC-1-7', auth: 6, held: 5, order: 1 },
];

describe('hr cost domain', () => {
  it('reads the top scale number', () => {
    expect(scaleLevel('NLC-14-16')).toBe(16);
    expect(scaleLevel('NLC-17')).toBe(17);
    expect(scaleLevel(undefined)).toBeNull();
  });
  it('maps scales to monthly bands', () => {
    expect(bandForScale('NLC-17')).toBe(210_000);
    expect(bandForScale('NLC-1-7')).toBe(60_000);
    expect(bandForScale('Lt Col')).toBe(300_000);
  });
  it('costs by section on held basis', () => {
    const rows = costBySection(units, 'held');
    const contract = rows.find((r) => r.title === 'Contract Sec')!;
    // QS 2×210k + AQS 1×160k = 580k
    expect(contract.monthly).toBe(580_000);
    const security = rows.find((r) => r.title === 'Security')!;
    expect(security.monthly).toBe(5 * 60_000);
  });
  it('totals monthly cost from leaf posts', () => {
    // Leaves only: QS 420k + AQS 160k + Security 300k = 880k (head/sections are groupings).
    expect(totalMonthlyCost(units, 'held')).toBe(420_000 + 160_000 + 300_000);
  });
});

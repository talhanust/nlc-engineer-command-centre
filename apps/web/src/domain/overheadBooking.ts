import type { MachineryUsage, PolRecord, OverheadLine } from '../data/types';

/**
 * Overhead sub-head auto-booking (spec §6): operational costs that are NOT
 * direct works cost are posted to Overheads under standard sub-heads —
 * vehicle running, office generators, and the maintenance of both — alongside
 * the HR/camp/utility bookings already handled. This derives those sub-head
 * actuals from operational data so one running-log or POL entry updates the
 * overhead position with no re-entry.
 */

export type OverheadSubhead =
  | 'Vehicle running'
  | 'Generator running'
  | 'Vehicle & plant maintenance'
  | 'POL'
  | 'HR / establishment'
  | 'Camp & utilities'
  | 'Other';

export interface SubheadBooking {
  subhead: OverheadSubhead;
  amount: number;
  source: 'derived' | 'planned' | 'actual';
}

/** POL diesel/petrol rate assumptions (PKR/litre) for costing issued fuel. */
const POL_RATE = { diesel: 285, petrol: 290 } as const;

/** Vehicles (not works plant) whose running cost is an overhead, not direct cost. */
function isOverheadVehicle(m: MachineryUsage): boolean {
  const c = m.machineryCode.toUpperCase();
  return c.startsWith('VEH') || c.startsWith('LV-') || c.startsWith('GEN') || /GENERATOR|PICKUP|CAR|JEEP/.test(m.description.toUpperCase());
}

function isGenerator(m: MachineryUsage): boolean {
  return m.machineryCode.toUpperCase().startsWith('GEN') || /GENERATOR/.test(m.description.toUpperCase());
}

/**
 * Derive overhead sub-head bookings from operational data. `maintenancePct`
 * approximates maintenance as a fraction of running cost when no explicit
 * maintenance ledger exists.
 */
export function deriveOverheadSubheads(
  machinery: MachineryUsage[],
  pol: PolRecord[],
  opts: { maintenancePct?: number } = {},
): SubheadBooking[] {
  const maintenancePct = opts.maintenancePct ?? 0.12;
  let vehicleRunning = 0;
  let generatorRunning = 0;
  for (const m of machinery) {
    if (!isOverheadVehicle(m)) continue;
    const cost = m.hours * m.rate;
    if (isGenerator(m)) generatorRunning += cost;
    else vehicleRunning += cost;
  }
  const polCost = pol.reduce((s, p) => s + p.issued * POL_RATE[p.fuel], 0);
  const maintenance = (vehicleRunning + generatorRunning) * maintenancePct;

  const out: SubheadBooking[] = [];
  if (vehicleRunning > 0) out.push({ subhead: 'Vehicle running', amount: +vehicleRunning.toFixed(0), source: 'derived' });
  if (generatorRunning > 0) out.push({ subhead: 'Generator running', amount: +generatorRunning.toFixed(0), source: 'derived' });
  if (maintenance > 0) out.push({ subhead: 'Vehicle & plant maintenance', amount: +maintenance.toFixed(0), source: 'derived' });
  if (polCost > 0) out.push({ subhead: 'POL', amount: +polCost.toFixed(0), source: 'derived' });
  return out;
}

/** Roll planned overhead lines up by inferred sub-head (from the category text). */
export function plannedBySubhead(lines: OverheadLine[]): Map<OverheadSubhead, number> {
  const map = new Map<OverheadSubhead, number>();
  for (const l of lines) {
    const c = l.category.toLowerCase();
    const sub: OverheadSubhead =
      /mainten/.test(c) ? 'Vehicle & plant maintenance'
      : /generator/.test(c) ? 'Generator running'
      : /vehicle|light-vehicle|pol|fuel/.test(c) ? 'Vehicle running'
      : /salar|manpower|establish|hr/.test(c) ? 'HR / establishment'
      : /camp|utility|utilit|electric|water/.test(c) ? 'Camp & utilities'
      : 'Other';
    map.set(sub, (map.get(sub) ?? 0) + l.plannedCost);
  }
  return map;
}

export function subheadTotal(bookings: SubheadBooking[]): number {
  return bookings.reduce((s, b) => s + b.amount, 0);
}

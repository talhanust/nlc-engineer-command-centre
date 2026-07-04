export interface EvmInput { bac: number; pv: number; ev: number; ac: number }

export interface EvmResult extends EvmInput {
  sv: number;   // schedule variance EV − PV
  cv: number;   // cost variance EV − AC
  spi: number;  // schedule performance EV / PV
  cpi: number;  // cost performance EV / AC
  eac: number;  // estimate at completion BAC / CPI
  etc: number;  // estimate to complete EAC − AC
  vac: number;  // variance at completion BAC − EAC
  pctComplete: number; // EV / BAC
  pctPlanned: number;  // PV / BAC
}

export function evm(i: EvmInput): EvmResult {
  const sv = i.ev - i.pv;
  const cv = i.ev - i.ac;
  const spi = i.pv > 0 ? i.ev / i.pv : 0;
  const cpi = i.ac > 0 ? i.ev / i.ac : 0;
  const eac = cpi > 0 ? i.bac / cpi : i.bac;
  return {
    ...i, sv, cv, spi, cpi, eac,
    etc: eac - i.ac,
    vac: i.bac - eac,
    pctComplete: i.bac > 0 ? i.ev / i.bac : 0,
    pctPlanned: i.bac > 0 ? i.pv / i.bac : 0,
  };
}

export type PerfStatus = 'ahead' | 'on' | 'behind';

/** Index ≥ 1 is favourable (ahead of schedule / under cost). */
export function indexStatus(idx: number, tol = 0.02): PerfStatus {
  if (idx >= 1 + tol) return 'ahead';
  if (idx <= 1 - tol) return 'behind';
  return 'on';
}

export const SCHEDULE_LABEL: Record<PerfStatus, string> = { ahead: 'Ahead of schedule', on: 'On schedule', behind: 'Behind schedule' };
export const COST_LABEL: Record<PerfStatus, string> = { ahead: 'Under budget', on: 'On budget', behind: 'Over budget' };

/** Fraction of earned value NLC self-performs is costed at this of its value (margin retained on self work). */
export const SELF_COST_FACTOR = 0.85;

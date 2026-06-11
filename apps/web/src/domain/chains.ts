import type { ProcChainType, DemandType } from '../data/types';

export interface ChainStage {
  index: number;
  name: string;
  role: string;
  action: string;
  label: string;
}

export const ROLE_LABEL: Record<string, string> = {
  pic: 'Project In-Charge',
  pm: 'Project Manager',
  pd: 'Project Director',
  comd_engrs: 'Comd Engineers',
  dir_sp: 'Director (Sp)',
  dg: 'Director General',
  preaudit: 'Pre-Audit',
  fm: 'Finance Manager',
  fh: 'Finance HQ',
};

/**
 * The six approval chains as definition data. Note the mid-chain divergence:
 * material/machinery demands pass through an `endorse` (Comd Engrs) stage that
 * the machinery-hire demand SKIPS, and the three payment chains differ in
 * length (9 / 6 / 5 stages).
 */
export const CHAINS: Record<ProcChainType, ChainStage[]> = {
  proc_demand_material: [
    { index: 0, name: 'initiated', role: 'pic', action: 'raise', label: 'Raise' },
    { index: 1, name: 'validated', role: 'pm', action: 'validate', label: 'Validate' },
    { index: 2, name: 'recommended', role: 'pd', action: 'recommend', label: 'Recommend' },
    { index: 3, name: 'endorsed', role: 'comd_engrs', action: 'endorse', label: 'Endorse' },
    { index: 4, name: 'approved', role: 'dir_sp', action: 'approve', label: 'Approve' },
  ],
  proc_demand_machinery: [
    { index: 0, name: 'initiated', role: 'pic', action: 'raise', label: 'Raise' },
    { index: 1, name: 'validated', role: 'pm', action: 'validate', label: 'Validate' },
    { index: 2, name: 'recommended', role: 'pd', action: 'recommend', label: 'Recommend' },
    { index: 3, name: 'endorsed', role: 'comd_engrs', action: 'endorse', label: 'Endorse' },
    { index: 4, name: 'approved', role: 'dir_sp', action: 'approve', label: 'Approve' },
  ],
  machinery_demand: [
    { index: 0, name: 'initiated', role: 'pic', action: 'raise', label: 'Raise' },
    { index: 1, name: 'validated', role: 'pm', action: 'validate', label: 'Validate' },
    { index: 2, name: 'recommended', role: 'pd', action: 'recommend', label: 'Recommend' },
    { index: 3, name: 'approved', role: 'comd_engrs', action: 'approve', label: 'Approve' }, // SKIPS endorse
  ],
  proc_payment_material: [
    { index: 0, name: 'raised', role: 'pic', action: 'raise', label: 'Raise' },
    { index: 1, name: 'preaudited', role: 'preaudit', action: 'preaudit', label: 'Pre-audit' },
    { index: 2, name: 'validated', role: 'pm', action: 'validate', label: 'Validate' },
    { index: 3, name: 'approved_pd', role: 'pd', action: 'approve', label: 'Approve (PD)' },
    { index: 4, name: 'approved_ce', role: 'comd_engrs', action: 'approve', label: 'Approve (CE)' },
    { index: 5, name: 'approved_ds', role: 'dir_sp', action: 'approve', label: 'Approve (Dir Sp)' },
    { index: 6, name: 'approved_dg', role: 'dg', action: 'approve', label: 'Approve (DG)' },
    { index: 7, name: 'paid', role: 'fm', action: 'pay', label: 'Pay' },
    { index: 8, name: 'recorded', role: 'fh', action: 'record', label: 'Record' },
  ],
  proc_payment_machinery: [
    { index: 0, name: 'raised', role: 'pic', action: 'raise', label: 'Raise' },
    { index: 1, name: 'preaudited', role: 'preaudit', action: 'preaudit', label: 'Pre-audit' },
    { index: 2, name: 'validated', role: 'pm', action: 'validate', label: 'Validate' },
    { index: 3, name: 'approved_pd', role: 'pd', action: 'approve', label: 'Approve (PD)' },
    { index: 4, name: 'paid', role: 'fm', action: 'pay', label: 'Pay' },
    { index: 5, name: 'recorded', role: 'fh', action: 'record', label: 'Record' },
  ],
  machinery_payment: [
    { index: 0, name: 'raised', role: 'pic', action: 'raise', label: 'Raise' },
    { index: 1, name: 'preaudited', role: 'preaudit', action: 'preaudit', label: 'Pre-audit' },
    { index: 2, name: 'validated', role: 'pm', action: 'validate', label: 'Validate' },
    { index: 3, name: 'approved_pd', role: 'pd', action: 'approve', label: 'Approve (PD)' },
    { index: 4, name: 'paid', role: 'fm', action: 'pay', label: 'Pay' },
  ],
};

/** Default financial powers (PKR ceilings). null = unlimited; absent = no ceiling. */
export const DEFAULT_POWERS: Record<string, number | null> = {
  pm: 1_000_000,
  pd: 25_000_000,
  comd_engrs: 100_000_000,
  dir_sp: 500_000_000,
  dg: null,
};

const POWERS_KEY = 'nlc-ecc.financialPowers';
let powersCache: Record<string, number | null> | null = null;

export function getPowers(): Record<string, number | null> {
  if (powersCache) return powersCache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(POWERS_KEY) : null;
    powersCache = raw ? (JSON.parse(raw) as Record<string, number | null>) : { ...DEFAULT_POWERS };
  } catch {
    powersCache = { ...DEFAULT_POWERS };
  }
  return powersCache;
}

export function setPowers(next: Record<string, number | null>): void {
  powersCache = next;
  try {
    localStorage.setItem(POWERS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** @deprecated read via getPowers(); kept for back-compat in tests. */
export const FINANCIAL_POWERS = DEFAULT_POWERS;

export const DEMAND_CHAIN: Record<DemandType, ProcChainType> = {
  material: 'proc_demand_material',
  machinery: 'proc_demand_machinery',
  machinery_hire: 'machinery_demand',
};

export function chainStages(chainType: ProcChainType): ChainStage[] {
  return CHAINS[chainType];
}

/** The stage a document is awaiting action at (the one after currentStage). */
export function pendingStage(chainType: ProcChainType, currentStage: number): ChainStage | null {
  return CHAINS[chainType][currentStage + 1] ?? null;
}

export function isFinal(chainType: ProcChainType, currentStage: number): boolean {
  return currentStage >= CHAINS[chainType].length - 1;
}

/** Does a role's financial power cover an amount? Roles with no ceiling pass. */
export function roleHasPower(role: string, amount: number): boolean {
  const powers = getPowers();
  if (!(role in powers)) return true; // operational roles, no ceiling
  const ceiling = powers[role];
  return ceiling === null || amount <= ceiling;
}

export interface AdvanceCheck {
  ok: boolean;
  stage?: ChainStage;
  error?: string;
}

/** Validate that `role` may advance a document of `amount` from currentStage. */
export function checkAdvance(
  chainType: ProcChainType,
  currentStage: number,
  role: string,
  amount: number,
): AdvanceCheck {
  const stage = pendingStage(chainType, currentStage);
  if (!stage) return { ok: false, error: 'Already at final stage.' };
  if (stage.role !== role) {
    return { ok: false, error: `Awaiting ${ROLE_LABEL[stage.role]}, not ${ROLE_LABEL[role] ?? role}.` };
  }
  if (!roleHasPower(role, amount)) {
    return { ok: false, error: `Amount exceeds ${ROLE_LABEL[role]} financial power.` };
  }
  return { ok: true, stage };
}

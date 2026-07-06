/**
 * Appointment catalogue — the organisation's real appointment structure as
 * data (Requirements v2 §1). This is the foundation for per-appointment
 * chains, dashboards and access; it deliberately carries reporting lines and
 * command levels so chain engines can compute "through proper channel".
 *
 * Existing simplified roles map onto appointments via LEGACY_ROLE_MAP until
 * migration (spec §9 Q8) is confirmed.
 */

export type CommandLevel = 'project' | 'pd_hq' | 'hq_engrs' | 'hq_nlc';

export interface Appointment {
  id: string;
  title: string;
  level: CommandLevel;
  /** Immediate superior appointment id (the "proper channel"). */
  reportsTo: string | null;
  /** Staff section, where applicable — drives section dashboards. */
  section?: 'plans' | 'contracts' | 'monitoring' | 'procurement' | 'recovery' | 'finance' | 'hr' | 'audit' | 'command';
}

export const APPOINTMENTS: Appointment[] = [
  // ---- HQ NLC ----
  { id: 'dg', title: 'Director General (DG NLC)', level: 'hq_nlc', reportsTo: null, section: 'command' },
  { id: 'coo_ops', title: 'COO Ops', level: 'hq_nlc', reportsTo: 'dg', section: 'command' },
  { id: 'dir_ops', title: 'Dir Ops', level: 'hq_nlc', reportsTo: 'coo_ops', section: 'monitoring' },
  { id: 'dir_plans', title: 'Dir Plans', level: 'hq_nlc', reportsTo: 'coo_ops', section: 'plans' },
  { id: 'dir_sp', title: 'Dir Procurement (Dir Sp)', level: 'hq_nlc', reportsTo: 'coo_ops', section: 'procurement' },
  { id: 'dir_lar', title: 'Dir LAR (Legal, Audit & Recovery)', level: 'hq_nlc', reportsTo: 'coo_ops', section: 'recovery' },
  { id: 'cfo', title: 'CFO', level: 'hq_nlc', reportsTo: 'coo_ops', section: 'finance' },
  { id: 'dir_hr', title: 'Dir HR', level: 'hq_nlc', reportsTo: 'coo_ops', section: 'hr' },

  // ---- HQ Engineers ----
  { id: 'comd_engrs', title: 'Comd Engineers', level: 'hq_engrs', reportsTo: 'coo_ops', section: 'command' },
  { id: 'dy_comd_engrs', title: 'Deputy Comd Engineers', level: 'hq_engrs', reportsTo: 'comd_engrs', section: 'command' },
  { id: 'gm_ops_mon', title: 'GM Ops & Monitoring', level: 'hq_engrs', reportsTo: 'dy_comd_engrs', section: 'monitoring' },
  { id: 'sm_mon_engrs', title: 'SM Monitoring (HQ Engrs)', level: 'hq_engrs', reportsTo: 'gm_ops_mon', section: 'monitoring' },
  { id: 'mgr_mon_engrs', title: 'Manager Monitoring (HQ Engrs)', level: 'hq_engrs', reportsTo: 'sm_mon_engrs', section: 'monitoring' },
  { id: 'am_mon_engrs', title: 'Assistant Manager Monitoring (HQ Engrs)', level: 'hq_engrs', reportsTo: 'mgr_mon_engrs', section: 'monitoring' },
  { id: 'sm_plans_engrs', title: 'SM Plans (HQ Engrs)', level: 'hq_engrs', reportsTo: 'dy_comd_engrs', section: 'plans' },
  { id: 'mgr_plans_engrs', title: 'Manager Plans (HQ Engrs)', level: 'hq_engrs', reportsTo: 'sm_plans_engrs', section: 'plans' },
  { id: 'sm_contracts_engrs', title: 'SM Contracts (HQ Engrs)', level: 'hq_engrs', reportsTo: 'dy_comd_engrs', section: 'contracts' },
  { id: 'mgr_contracts_engrs', title: 'Manager Contracts (HQ Engrs)', level: 'hq_engrs', reportsTo: 'sm_contracts_engrs', section: 'contracts' },
  { id: 'sm_proc_engrs', title: 'SM Procurement (HQ Engrs)', level: 'hq_engrs', reportsTo: 'dy_comd_engrs', section: 'procurement' },
  { id: 'mgr_proc_engrs', title: 'Manager Procurement (HQ Engrs)', level: 'hq_engrs', reportsTo: 'sm_proc_engrs', section: 'procurement' },
  { id: 'sm_recovery_engrs', title: 'SM Recovery (HQ Engrs)', level: 'hq_engrs', reportsTo: 'dy_comd_engrs', section: 'recovery' },
  { id: 'sm_fin_engrs', title: 'SM Finance (HQ Engrs)', level: 'hq_engrs', reportsTo: 'dy_comd_engrs', section: 'finance' },
  { id: 'mgr_fin_engrs', title: 'Manager Finance (HQ Engrs)', level: 'hq_engrs', reportsTo: 'sm_fin_engrs', section: 'finance' },
  { id: 'sm_hr_engrs', title: 'SM HR (HQ Engrs)', level: 'hq_engrs', reportsTo: 'dy_comd_engrs', section: 'hr' },

  // ---- HQ PD ----
  { id: 'pd', title: 'Projects Director', level: 'pd_hq', reportsTo: 'comd_engrs', section: 'command' },
  { id: 'dpd', title: 'Deputy Projects Director', level: 'pd_hq', reportsTo: 'pd', section: 'command' },
  { id: 'sm_plans_pd', title: 'SM/Manager Plans (HQ PD)', level: 'pd_hq', reportsTo: 'dpd', section: 'plans' },
  { id: 'sm_contracts_pd', title: 'SM/Manager Contracts (HQ PD)', level: 'pd_hq', reportsTo: 'dpd', section: 'contracts' },
  { id: 'sm_mon_pd', title: 'SM/Manager Monitoring (HQ PD)', level: 'pd_hq', reportsTo: 'dpd', section: 'monitoring' },
  { id: 'sm_proc_pd', title: 'SM/Manager Procurement (HQ PD)', level: 'pd_hq', reportsTo: 'dpd', section: 'procurement' },
  { id: 'sm_recovery_pd', title: 'SM/Manager Recovery (HQ PD)', level: 'pd_hq', reportsTo: 'dpd', section: 'recovery' },
  { id: 'sm_fin_pd', title: 'SM/Manager Finance (HQ PD)', level: 'pd_hq', reportsTo: 'dpd', section: 'finance' },
  { id: 'mgr_hr_pd', title: 'Manager HR (HQ PD)', level: 'pd_hq', reportsTo: 'dpd', section: 'hr' },
  { id: 'pre_audit', title: 'Pre-Audit (HQ PD)', level: 'pd_hq', reportsTo: 'pd', section: 'audit' },

  // ---- Project ----
  { id: 'spm', title: 'Senior Project Manager', level: 'project', reportsTo: 'pd', section: 'command' },
  { id: 'dpm', title: 'Deputy Project Manager', level: 'project', reportsTo: 'spm', section: 'command' },
  { id: 'planning_engr', title: 'Planning Engineer', level: 'project', reportsTo: 'dpm', section: 'plans' },
  { id: 'contract_engr', title: 'Contract Engineer', level: 'project', reportsTo: 'dpm', section: 'contracts' },
  { id: 'sqs', title: 'Senior Quantity Surveyor', level: 'project', reportsTo: 'dpm', section: 'contracts' },
  { id: 'proc_engr', title: 'Procurement Engineer', level: 'project', reportsTo: 'dpm', section: 'procurement' },
  { id: 'store_incharge', title: 'Store Incharge', level: 'project', reportsTo: 'dpm', section: 'procurement' },
  { id: 'fm_proj', title: 'Finance Manager (Project)', level: 'project', reportsTo: 'dpm', section: 'finance' },
  { id: 'site_engr', title: 'Site Engineer', level: 'project', reportsTo: 'dpm', section: 'plans' },
];

const byId = new Map(APPOINTMENTS.map((a) => [a.id, a]));

export function appointment(id: string): Appointment | undefined {
  return byId.get(id);
}

/** Upward "proper channel" from an appointment to the top (inclusive of start). */
export function properChannel(fromId: string): Appointment[] {
  const out: Appointment[] = [];
  let cur = byId.get(fromId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    out.push(cur);
    seen.add(cur.id);
    cur = cur.reportsTo ? byId.get(cur.reportsTo) : undefined;
  }
  return out;
}

/** Contract-approval ceilings by contract type (Requirements v2 §4), PKR. */
export const CONTRACT_CEILINGS = {
  labour: { pd: 15_000_000, comd_engrs: 30_000_000 },   // above → DG NLC
  sublet: { pd: 150_000_000, comd_engrs: 300_000_000 }, // above → DG NLC
} as const;

/** Competent authority for a contract of the given type and value. */
export function contractApprover(kind: 'labour' | 'sublet', value: number): 'pd' | 'comd_engrs' | 'dg' {
  const c = CONTRACT_CEILINGS[kind];
  if (value <= c.pd) return 'pd';
  if (value <= c.comd_engrs) return 'comd_engrs';
  return 'dg';
}

/** CONFIRMED mapping of today's simplified roles onto appointments (spec §9 A8). */
export const LEGACY_ROLE_MAP: Record<string, string> = {
  pm: 'spm', qs: 'sqs', fm: 'sm_fin_pd', pd: 'pd',
  manager_contracts: 'sm_contracts_pd', surveyor: 'site_engr', admin: 'dg',
};

/** Acting legacy role for an appointment (until per-appointment gates land). */
export function legacyRoleFor(appointmentId: string): string {
  const direct: Record<string, string> = {
    spm: 'pm', dpm: 'pm', planning_engr: 'pm', site_engr: 'surveyor',
    sqs: 'qs', contract_engr: 'manager_contracts',
    proc_engr: 'pm', store_incharge: 'pm',
    fm_proj: 'fm', sm_fin_pd: 'fm', sm_fin_engrs: 'fm', mgr_fin_engrs: 'fm', cfo: 'fm',
    pd: 'pd', dpd: 'pd',
    sm_contracts_pd: 'manager_contracts', sm_contracts_engrs: 'manager_contracts', mgr_contracts_engrs: 'manager_contracts',
    pre_audit: 'fm',
    dg: 'admin', coo_ops: 'admin', comd_engrs: 'admin', dy_comd_engrs: 'admin',
  };
  if (direct[appointmentId]) return direct[appointmentId];
  const a = appointment(appointmentId);
  // staff sections default to a supervisory role by level
  if (!a) return 'pm';
  return a.level === 'hq_nlc' || a.level === 'hq_engrs' ? 'pd' : a.level === 'pd_hq' ? 'pd' : 'pm';
}

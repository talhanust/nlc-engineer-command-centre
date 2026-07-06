import { contractApprover } from './appointments';

/**
 * Appointment chain engine (Requirements v2 §4, §9 A2/A4/A5):
 *  - every step is a NAMED APPOINTMENT that formally acts in-app (A2 —
 *    intermediates like DPD / Dy Comd are real steps, not visibility);
 *  - any step may RETURN FOR CORRECTION with remarks (A5) — the file goes back
 *    to the originator and, on resubmission, the chain restarts from step one
 *    (so a revised contract value RE-ROUTES to the new competent authority, A4);
 *  - the full history (who, what, when, remarks) is preserved on the state.
 * Pure and serializable — persisted on the owning record.
 */

export type ChainAction = 'validate' | 'recommend' | 'review' | 'audit' | 'endorse' | 'approve';

export interface ApptChainStep {
  appointmentId: string;
  action: ChainAction;
  label: string;
}

export interface ApptChainEvent {
  stepIndex: number;
  appointmentId: string;
  kind: 'acted' | 'returned' | 'resubmitted';
  by: string;
  at: string;
  remarks?: string;
}

export interface ApptChainState {
  steps: ApptChainStep[];
  currentIndex: number;
  status: 'in_progress' | 'returned' | 'approved';
  history: ApptChainEvent[];
}

export function newChain(steps: ApptChainStep[]): ApptChainState {
  return { steps, currentIndex: 0, status: 'in_progress', history: [] };
}

export function currentStep(state: ApptChainState): ApptChainStep | null {
  return state.status === 'in_progress' ? state.steps[state.currentIndex] ?? null : null;
}

/** The current-step appointment acts; the last step's act approves the file. */
export function act(state: ApptChainState, by: string, remarks?: string): ApptChainState {
  const step = currentStep(state);
  if (!step) return state;
  const history = [...state.history, {
    stepIndex: state.currentIndex, appointmentId: step.appointmentId,
    kind: 'acted' as const, by, at: new Date().toISOString(), remarks,
  }];
  const last = state.currentIndex >= state.steps.length - 1;
  return { ...state, history, currentIndex: last ? state.currentIndex : state.currentIndex + 1, status: last ? 'approved' : 'in_progress' };
}

/** Any current step may return the file for correction with remarks (A5). */
export function returnForCorrection(state: ApptChainState, by: string, remarks: string): ApptChainState {
  const step = currentStep(state);
  if (!step) return state;
  return {
    ...state,
    status: 'returned',
    history: [...state.history, {
      stepIndex: state.currentIndex, appointmentId: step.appointmentId,
      kind: 'returned' as const, by, at: new Date().toISOString(), remarks,
    }],
  };
}

/** Resubmission after correction: the chain restarts; steps may be REBUILT
 * (e.g. a revised value routes to a different competent authority, A4). */
export function resubmit(state: ApptChainState, by: string, newSteps?: ApptChainStep[]): ApptChainState {
  if (state.status !== 'returned') return state;
  return {
    steps: newSteps ?? state.steps,
    currentIndex: 0,
    status: 'in_progress',
    history: [...state.history, {
      stepIndex: -1, appointmentId: 'originator', kind: 'resubmitted' as const, by, at: new Date().toISOString(),
    }],
  };
}

/**
 * Contract approval ladder (spec §4): project validation → HQ PD review →
 * competent authority by type & value (labour 15/30 Mn, sublet 150/300 Mn),
 * with every intermediate acting formally through the proper channel.
 */
export function contractApprovalChain(kind: 'labour' | 'sublet', value: number): ApptChainStep[] {
  const steps: ApptChainStep[] = [
    { appointmentId: 'dpm', action: 'validate', label: 'DPM validates' },
    { appointmentId: 'spm', action: 'validate', label: 'SPM validates' },
    { appointmentId: 'sm_contracts_pd', action: 'review', label: 'SM/Manager Contracts (HQ PD) reviews' },
    { appointmentId: 'dpd', action: 'recommend', label: 'DPD recommends' },
  ];
  const authority = contractApprover(kind, value);
  if (authority === 'pd') {
    steps.push({ appointmentId: 'pd', action: 'approve', label: 'Projects Director approves' });
    return steps;
  }
  steps.push({ appointmentId: 'pd', action: 'recommend', label: 'Projects Director recommends' });
  steps.push({ appointmentId: 'sm_contracts_engrs', action: 'review', label: 'SM Contracts (HQ Engrs) reviews' });
  steps.push({ appointmentId: 'dy_comd_engrs', action: 'recommend', label: 'Dy Comd Engrs recommends' });
  if (authority === 'comd_engrs') {
    steps.push({ appointmentId: 'comd_engrs', action: 'approve', label: 'Comd Engineers approves' });
    return steps;
  }
  steps.push({ appointmentId: 'comd_engrs', action: 'endorse', label: 'Comd Engineers endorses' });
  steps.push({ appointmentId: 'dir_ops', action: 'review', label: 'Dir Ops (HQ NLC) reviews' });
  steps.push({ appointmentId: 'coo_ops', action: 'recommend', label: 'COO Ops recommends' });
  steps.push({ appointmentId: 'dg', action: 'approve', label: 'DG NLC approves' });
  return steps;
}


/**
 * RAR approval ladder (spec §5, A7 — EPC subcontractors byte-identical):
 * project scrutiny → HQ PD review → PRE-AUDIT → command approval → payment.
 */
export function rarApprovalChain(): ApptChainStep[] {
  return [
    { appointmentId: 'contract_engr', action: 'review', label: 'Contract Engineer reviews' },
    { appointmentId: 'dpm', action: 'endorse', label: 'DPM endorses' },
    { appointmentId: 'spm', action: 'endorse', label: 'SPM endorses' },
    { appointmentId: 'sm_contracts_pd', action: 'review', label: 'Manager Contracts (HQ PD) reviews' },
    { appointmentId: 'pre_audit', action: 'audit', label: 'Pre-Audit audits' },
    { appointmentId: 'dpd', action: 'recommend', label: 'DPD recommends' },
    { appointmentId: 'pd', action: 'approve', label: 'Projects Director approves' },
    { appointmentId: 'sm_fin_pd', action: 'approve', label: 'SM/Manager Finance pays & issues cheque' },
  ];
}


/**
 * Project HR authorisation ladder (spec §2 step 4, §9 A3):
 * PD recommends → SM HR (HQ Engrs) reviews → then by DELEGATION:
 *   grades 1–16                  → Comd Engineers APPROVES (ends);
 *   grade 17+ or the overall TOHR → Comd Engrs endorses → Dir HR reviews → DG NLC approves.
 */
export function hrApprovalChain(scope: { maxGrade: number } | { kind: 'tohr' }): ApptChainStep[] {
  const steps: ApptChainStep[] = [
    { appointmentId: 'pd', action: 'recommend', label: 'Projects Director recommends' },
    { appointmentId: 'sm_hr_engrs', action: 'review', label: 'SM HR (HQ Engrs) reviews' },
  ];
  const toDg = 'kind' in scope ? true : scope.maxGrade >= 17;
  if (!toDg) {
    steps.push({ appointmentId: 'comd_engrs', action: 'approve', label: 'Comd Engineers approves (delegated, Gr 1–16)' });
    return steps;
  }
  steps.push({ appointmentId: 'comd_engrs', action: 'endorse', label: 'Comd Engineers endorses' });
  steps.push({ appointmentId: 'dir_hr', action: 'review', label: 'Dir HR (HQ NLC) reviews' });
  steps.push({ appointmentId: 'dg', action: 'approve', label: 'DG NLC approves' });
  return steps;
}


/** Central materials procured for a project — the CFO-terminating supplier-bill
 * chain applies (spec §6). Others are LOCAL (PD-terminating). */
export const CENTRAL_MATERIALS = ['CEM', 'STEEL-60', 'BITUMEN'];

export function isCentralMaterial(code: string): boolean {
  return CENTRAL_MATERIALS.includes(code.trim().toUpperCase());
}

/**
 * Supplier-bill approval ladder (spec §6). Generated from CRVs against POs:
 * Procurement Engineer generates → SPM verifies → SM Procurement (HQ PD)
 * reviews → PRE-AUDIT audits → then by material class:
 *   LOCAL   → SM Finance (HQ PD) processes → DPD → PD approves → SM Finance pays;
 *   CENTRAL → SM Finance (HQ PD) processes → DPD → PD → Comd Engrs (via Dir Sp
 *             review) → CFO pays (through Dy Comd, Comd, Dir Sp per §6).
 */
export function supplierBillChain(kind: 'central' | 'local'): ApptChainStep[] {
  const steps: ApptChainStep[] = [
    { appointmentId: 'proc_engr', action: 'recommend', label: 'Procurement Engineer generates bill' },
    { appointmentId: 'spm', action: 'validate', label: 'SPM verifies bill' },
    { appointmentId: 'sm_proc_pd', action: 'review', label: 'SM Procurement (HQ PD) reviews' },
    { appointmentId: 'pre_audit', action: 'audit', label: 'Pre-Audit audits' },
    { appointmentId: 'sm_fin_pd', action: 'review', label: 'SM/Manager Finance (HQ PD) processes' },
    { appointmentId: 'dpd', action: 'recommend', label: 'DPD recommends' },
  ];
  if (kind === 'local') {
    steps.push({ appointmentId: 'pd', action: 'approve', label: 'Projects Director approves' });
    steps.push({ appointmentId: 'sm_fin_pd', action: 'approve', label: 'SM/Manager Finance pays' });
    return steps;
  }
  steps.push({ appointmentId: 'pd', action: 'recommend', label: 'Projects Director recommends' });
  steps.push({ appointmentId: 'sm_proc_engrs', action: 'review', label: 'SM Procurement (HQ Engrs) reviews' });
  steps.push({ appointmentId: 'dy_comd_engrs', action: 'recommend', label: 'Dy Comd Engrs recommends' });
  steps.push({ appointmentId: 'comd_engrs', action: 'endorse', label: 'Comd Engineers endorses' });
  steps.push({ appointmentId: 'dir_sp', action: 'review', label: 'Dir Sp (HQ NLC) reviews' });
  steps.push({ appointmentId: 'cfo', action: 'approve', label: 'CFO pays' });
  return steps;
}


/**
 * Baseline lock ladders (spec §3): a register (BOQ / Schedule / Mapping) is
 * imported, VALIDATED by the project team, then LOCKED at HQ PD. After lock it
 * is editable only through the authorised revision route below.
 */
export type BaselineKind = 'boq' | 'schedule' | 'mapping';

export const BASELINE_LABEL: Record<BaselineKind, string> = {
  boq: 'BOQ', schedule: 'Schedule (XER)', mapping: 'Mapping (BOQ↔WBS / BOQ↔Material)',
};

export function baselineLockChain(kind: BaselineKind): ApptChainStep[] {
  if (kind === 'boq') {
    return [
      { appointmentId: 'planning_engr', action: 'validate', label: 'Planning Engineer validates' },
      { appointmentId: 'dpm', action: 'validate', label: 'DPM validates' },
      { appointmentId: 'spm', action: 'validate', label: 'SPM validates' },
      { appointmentId: 'sm_plans_pd', action: 'approve', label: 'Manager Plans (HQ PD) locks' },
    ];
  }
  if (kind === 'schedule') {
    return [
      { appointmentId: 'dpm', action: 'validate', label: 'DPM validates' },
      { appointmentId: 'spm', action: 'validate', label: 'SPM validates' },
      { appointmentId: 'sm_plans_pd', action: 'approve', label: 'SM/Manager Plans (HQ PD) locks' },
    ];
  }
  // mapping: SQS maps → PE + Proc Mgr + DPM + SPM validate → SM Proc reviews → SM Plans locks
  return [
    { appointmentId: 'planning_engr', action: 'validate', label: 'Planning Engineer validates' },
    { appointmentId: 'proc_engr', action: 'validate', label: 'Procurement Manager validates' },
    { appointmentId: 'dpm', action: 'validate', label: 'DPM validates' },
    { appointmentId: 'spm', action: 'validate', label: 'SPM validates' },
    { appointmentId: 'sm_proc_pd', action: 'review', label: 'SM Procurement (HQ PD) reviews' },
    { appointmentId: 'sm_plans_pd', action: 'approve', label: 'SM/Manager Plans (HQ PD) locks' },
  ];
}

/** Revision after lock needs Comd Engrs authorisation (spec §3). */
export function baselineRevisionChain(kind: BaselineKind): ApptChainStep[] {
  const base: ApptChainStep[] = [
    { appointmentId: 'spm', action: 'recommend', label: 'SPM requests revision' },
    { appointmentId: 'sm_plans_pd', action: 'review', label: 'SM/Manager Plans (HQ PD) reviews' },
    { appointmentId: 'comd_engrs', action: 'approve', label: 'Comd Engineers authorises revision' },
  ];
  void kind;
  return base;
}


/**
 * Machinery inter-project transfer ladder (spec §6): SM Procurement (HQ PD)
 * moves integral plant between projects — locked and booked to the receiving
 * project, technically justified against BOQ quantities. Approval runs DPD →
 * PD → SM Procurement (HQ Engrs).
 */
export function machineryTransferChain(): ApptChainStep[] {
  return [
    { appointmentId: 'sm_proc_pd', action: 'recommend', label: 'SM Procurement (HQ PD) initiates transfer' },
    { appointmentId: 'dpd', action: 'recommend', label: 'DPD recommends' },
    { appointmentId: 'pd', action: 'recommend', label: 'Projects Director recommends' },
    { appointmentId: 'sm_proc_engrs', action: 'approve', label: 'SM Procurement (HQ Engrs) approves transfer' },
  ];
}

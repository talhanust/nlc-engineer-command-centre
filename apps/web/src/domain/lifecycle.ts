import type { Project, ProjectStage } from '../data/types';
import { toNum } from './money';

/**
 * Project lifecycle (civil-works practice):
 *   ONGOING              — works in progress, Taking-Over Certificate not received;
 *   PHYSICALLY COMPLETED — TOC issued → the project moves to the RECOVERY
 *                          section: collect the receivable, release retention,
 *                          clear liabilities;
 *   FINANCIALLY CLOSED   — all payments received and liabilities cleared →
 *                          archived as closed.
 */

export const STAGE_LABEL: Record<ProjectStage, string> = {
  ongoing: 'Ongoing',
  physically_completed: 'Physically completed (Recovery)',
  financially_closed: 'Financially closed',
};

export const STAGES: ProjectStage[] = ['ongoing', 'physically_completed', 'financially_closed'];

export function projectStage(p: Project): ProjectStage {
  return p.stage ?? 'ongoing';
}

export interface StageTotals {
  count: number;
  contractValue: number;
  billed: number;
  received: number;
  receivable: number; // billed − received (the collectible)
}

const empty = (): StageTotals => ({ count: 0, contractValue: 0, billed: 0, received: 0, receivable: 0 });

/** Receivable = certified/billed value not yet collected. */
export function receivable(p: Project): number {
  return Math.max(0, toNum(p.billedToDate) - toNum(p.receivedToDate));
}

/** All-projects total plus a separate total per lifecycle stage. */
export function stageTotals(projects: Project[]): { all: StageTotals } & Record<ProjectStage, StageTotals> {
  const out = { all: empty(), ongoing: empty(), physically_completed: empty(), financially_closed: empty() };
  for (const p of projects) {
    for (const bucket of [out.all, out[projectStage(p)]]) {
      bucket.count += 1;
      bucket.contractValue += toNum(p.contractValue);
      bucket.billed += toNum(p.billedToDate);
      bucket.received += toNum(p.receivedToDate);
      bucket.receivable += receivable(p);
    }
  }
  return out;
}

/** A physically-completed project may financially close only when the
 * receivable is collected and liabilities are cleared. */
export function readyToClose(p: Project, liabilitiesTotal: number): boolean {
  return projectStage(p) === 'physically_completed' && receivable(p) <= 0 && liabilitiesTotal <= 0;
}

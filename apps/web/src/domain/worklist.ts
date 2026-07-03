import type { Ipc, Rar, Demand, ProcPayment } from '../data/types';
import { nextTransition } from './ipc';
import { nextRarTransition } from './rar';
import { pendingStage } from './chains';

/**
 * Unified approver work-list (req 3h(4)): every record whose NEXT approval
 * step belongs to the acting role, across all modules, in one queue. Each item
 * deep-links to the screen where the action is taken. The header bell carries
 * the count as the notification.
 */

export interface WorkItem {
  id: string;
  projectId: string;
  projectName: string;
  kind: 'IPC' | 'RAR' | 'Demand' | 'Payment';
  ref: string;
  action: string;    // the pending step's label
  amount?: number;
  href: string;
}

export function projectWorklist(role: string, args: {
  projectId: string;
  projectName: string;
  ipcs: Ipc[];
  rars: Rar[];
  demands: Demand[];
  procPayments: ProcPayment[];
}): WorkItem[] {
  const { projectId, projectName, ipcs, rars, demands, procPayments } = args;
  const out: WorkItem[] = [];
  for (const i of ipcs) {
    const t = nextTransition(i.status);
    if (t && t.role === role) out.push({
      id: `wl-ipc-${projectId}-${i.ipcNo}`, projectId, projectName,
      kind: 'IPC', ref: i.ipcNo, action: t.label, amount: i.gross, href: `/node/${projectId}/commercial`,
    });
  }
  for (const r of rars) {
    const t = nextRarTransition(r.status);
    if (t && t.role === role) out.push({
      id: `wl-rar-${projectId}-${r.rarNo}`, projectId, projectName,
      kind: 'RAR', ref: r.rarNo, action: t.label, amount: r.gross, href: `/node/${projectId}/commercial`,
    });
  }
  for (const d of demands) {
    const ps = pendingStage(d.chainType, d.currentStage);
    if (ps && ps.role === role) out.push({
      id: `wl-dmd-${projectId}-${d.demandNo}`, projectId, projectName,
      kind: 'Demand', ref: d.demandNo, action: ps.label, amount: d.totalEstimated, href: `/node/${projectId}/procurement`,
    });
  }
  for (const p of procPayments) {
    const ps = pendingStage(p.chainType, p.currentStage);
    if (ps && ps.role === role) out.push({
      id: `wl-pay-${projectId}-${p.paymentNo}`, projectId, projectName,
      kind: 'Payment', ref: p.paymentNo, action: ps.label, amount: p.amount, href: `/node/${projectId}/procurement`,
    });
  }
  return out;
}

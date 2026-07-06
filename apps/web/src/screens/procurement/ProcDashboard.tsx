import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { pendingStage } from '../../domain/chains';
import { totalBalanceToRecover } from '../../domain/materialrecovery';
import { totalMachineryToRecover } from '../../domain/machineryRecovery';
import { materialLeadPlan } from '../../domain/leadtime';
import type { Demand, PurchaseOrder, Crv, ProcPayment, MaterialIssue, MachineryUsage, BoqItem, BoqMaterialLink, BoqWbsLink, ScheduleActivity, ProgressUpdate } from '../../data/types';

/**
 * Procurement dashboard (prototype parity): the committed → incurred → paid
 * pipeline at a glance, plus recovery balances and lead-time exposure.
 */
export function ProcDashboard({ projectId, onNavigate }: { projectId: string; onNavigate?: (sub: string) => void }) {
  const { provider } = useData();
  const [d, setD] = useState<{
    demands: Demand[]; pos: PurchaseOrder[]; crvs: Crv[]; payments: ProcPayment[];
    issues: MaterialIssue[]; machinery: MachineryUsage[]; atRisk: number;
  } | null>(null);

  useEffect(() => {
    let a = true;
    void (async () => {
      const [demands, pos, crvs, payments, issues, machinery, items, matLinks, wbsLinks, sched, progress] = await Promise.all([
        provider.listDemands(projectId), provider.listPurchaseOrders(projectId), provider.listCrvs(projectId),
        provider.listProcPayments(projectId), provider.listMaterialIssues(projectId), provider.listMachineryUsage(projectId),
        provider.listBoq(projectId), provider.listBoqMaterial(projectId), provider.listBoqWbs(projectId),
        provider.listSchedule(projectId), provider.listProgress(projectId),
      ] as [Promise<Demand[]>, Promise<PurchaseOrder[]>, Promise<Crv[]>, Promise<ProcPayment[]>, Promise<MaterialIssue[]>, Promise<MachineryUsage[]>, Promise<BoqItem[]>, Promise<BoqMaterialLink[]>, Promise<BoqWbsLink[]>, Promise<ScheduleActivity[]>, Promise<ProgressUpdate[]>]);
      if (!a) return;
      const plan = materialLeadPlan({ items, matLinks, wbsLinks, sched, progress, crvs, issues, asOf: new Date().toISOString().slice(0, 10) });
      setD({ demands, pos, crvs, payments, issues, machinery, atRisk: plan.filter((r) => r.status !== 'ok').length });
    })();
    return () => { a = false; };
  }, [provider, projectId]);

  const k = useMemo(() => {
    if (!d) return null;
    const pendingApprovals =
      d.demands.filter((x) => pendingStage(x.chainType, x.currentStage)).length +
      d.payments.filter((x) => pendingStage(x.chainType, x.currentStage)).length;
    const committed = d.pos.reduce((s, p) => s + p.totalValue, 0);
    const paid = d.payments.reduce((s, p) => s + p.amount, 0);
    return {
      pendingApprovals,
      demandCount: d.demands.length,
      committed,
      crvCount: d.crvs.length,
      paid,
      matBalance: totalBalanceToRecover(d.issues),
      machBalance: totalMachineryToRecover(d.machinery),
      atRisk: d.atRisk,
    };
  }, [d]);

  if (!k) return null;
  const go = (sub: string) => () => onNavigate?.(sub);

  return (
    <div>
      <div className="kpi-grid" aria-label="Procurement KPIs">
        <button className="kpi-card kpi-click" onClick={go('inbox')}>
          <div className="kpi-label">Pending approvals</div>
          <div className="kpi-value" style={k.pendingApprovals > 0 ? { color: 'var(--rag-amber)' } : undefined}>{k.pendingApprovals}</div>
          <div className="muted small">demands & payments in chain</div>
        </button>
        <button className="kpi-card kpi-click" onClick={go('demands')}>
          <div className="kpi-label">Demands raised</div>
          <div className="kpi-value">{k.demandCount}</div>
          <div className="muted small">requisitions this project</div>
        </button>
        <button className="kpi-card kpi-click" onClick={go('pocrv')}>
          <div className="kpi-label">Committed (POs)</div>
          <div className="kpi-value">{formatMoney(k.committed)}</div>
          <div className="muted small">{k.crvCount} CRVs received</div>
        </button>
        <button className="kpi-card kpi-click" onClick={go('payments')}>
          <div className="kpi-label">Paid to suppliers</div>
          <div className="kpi-value">{formatMoney(k.paid)}</div>
          <div className="muted small">incurred & settled</div>
        </button>
        <button className="kpi-card kpi-click" onClick={go('materials')}>
          <div className="kpi-label">Material to recover</div>
          <div className="kpi-value" style={k.matBalance > 0 ? { color: 'var(--rag-red)' } : undefined}>{formatMoney(k.matBalance)}</div>
          <div className="muted small">issued to contractors, unrecovered</div>
        </button>
        <button className="kpi-card kpi-click" onClick={go('machinery')}>
          <div className="kpi-label">Machinery to recover</div>
          <div className="kpi-value" style={k.machBalance > 0 ? { color: 'var(--rag-red)' } : undefined}>{formatMoney(k.machBalance)}</div>
          <div className="muted small">hire value outstanding</div>
        </button>
        <button className="kpi-card kpi-click" onClick={go('leadtimes')}>
          <div className="kpi-label">Lead times at risk</div>
          <div className="kpi-value" style={k.atRisk > 0 ? { color: 'var(--rag-red)' } : undefined}>{k.atRisk}</div>
          <div className="muted small">order-now / late materials</div>
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        Pipeline: demand → PO (committed) → CRV (incurred) → payment (paid), each through its approval chain. Click a card to drill in.
      </p>
    </div>
  );
}

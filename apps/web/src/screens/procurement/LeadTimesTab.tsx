import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { materialLeadPlan, DEFAULT_LEAD_DAYS, type LeadTimeRow } from '../../domain/leadtime';
import type { BoqItem, BoqMaterialLink, BoqWbsLink, Crv, MaterialIssue, ProgressUpdate, ScheduleActivity } from '../../data/types';

const STATUS: Record<LeadTimeRow['status'], { label: string; cls: string }> = {
  late: { label: 'Late', cls: 'neg' },
  order_now: { label: 'Order now', cls: 'neg' },
  ok: { label: 'OK', cls: '' },
};

/**
 * Procurement timeline derived from the plan (req 3c(6)): remaining BOQ qty ×
 * consumption coeff (BOQ→Material mapping) less stock on hand, with need-by
 * from the execution schedule through the BOQ↔WBS mapping. Latest-order date =
 * need-by − lead time.
 */
export function LeadTimesTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [rows, setRows] = useState<LeadTimeRow[]>([]);
  const [matLinks, setMatLinks] = useState<BoqMaterialLink[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [items, ml, wl, sched, progress, crvs, issues] = await Promise.all([
      provider.listBoq(projectId), provider.listBoqMaterial(projectId), provider.listBoqWbs(projectId),
      provider.listSchedule(projectId), provider.listProgress(projectId),
      provider.listCrvs(projectId), provider.listMaterialIssues(projectId),
    ] as [Promise<BoqItem[]>, Promise<BoqMaterialLink[]>, Promise<BoqWbsLink[]>, Promise<ScheduleActivity[]>, Promise<ProgressUpdate[]>, Promise<Crv[]>, Promise<MaterialIssue[]>]);
    setMatLinks(ml);
    setRows(materialLeadPlan({ items, matLinks: ml, wbsLinks: wl, sched, progress, crvs, issues, asOf: new Date().toISOString().slice(0, 10) }));
    setLoaded(true);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const atRisk = useMemo(() => rows.filter((r) => r.status !== 'ok').length, [rows]);

  async function setLead(materialRef: string, v: string) {
    const days = Math.max(1, Math.min(365, Number(v) || DEFAULT_LEAD_DAYS));
    // lead time is a property of the material — apply to every link carrying it
    for (const l of matLinks.filter((x) => x.materialRef === materialRef)) {
      await provider.setBoqMaterial(projectId, { ...l, leadDays: days });
    }
    await load();
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Procurement lead times</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Requirement = remaining BOQ qty × consumption coeff · need-by from the schedule via BOQ↔WBS mapping · order-by = need-by − lead time.
          </p>
        </div>
        {atRisk > 0 && <span className="status-pill" style={{ background: 'var(--rag-red)' }}>{atRisk} at risk</span>}
      </div>

      {!loaded ? null : rows.length === 0 ? (
        <p className="muted" style={{ padding: 12 }}>
          No derived requirements yet — map BOQ items to materials with consumption coefficients in <strong>Mapping → BOQ → Material</strong>.
        </p>
      ) : (
        <table className="data-table" aria-label="Procurement lead times">
          <thead><tr><th>Material</th><th>Consuming items</th><th className="num">Required</th><th className="num">On hand</th><th className="num">Shortfall</th><th className="num">Lead (days)</th><th>Need by</th><th>Order by</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.materialRef} className={r.status !== 'ok' ? 'row-flag' : ''}>
                <td className="mono small">{r.materialRef}</td>
                <td className="small">{r.items.join(', ')}</td>
                <td className="num">{r.requiredQty.toLocaleString('en-PK')}</td>
                <td className="num">{r.onHand.toLocaleString('en-PK')}</td>
                <td className={`num${r.shortfall > 0 ? ' neg' : ''}`}>{r.shortfall.toLocaleString('en-PK')}</td>
                <td className="num">
                  <input className="qty-input" aria-label={`Lead days ${r.materialRef}`} defaultValue={r.leadDays} style={{ width: 64 }}
                    onBlur={(e) => Number(e.target.value) !== r.leadDays && setLead(r.materialRef, e.target.value)} />
                </td>
                <td className="small">{r.needBy ?? '—'}</td>
                <td className="small">{r.orderBy ?? '—'}</td>
                <td><span className={STATUS[r.status].cls}>{r.status === 'ok' ? 'OK' : `⚠ ${STATUS[r.status].label}`}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { formatMoney, formatPct } from '../domain/money';
import { healthScore } from '../domain/health';
import { pendingStage } from '../domain/chains';
import { totalBalanceToRecover } from '../domain/materialrecovery';
import { totalMachineryToRecover } from '../domain/machineryRecovery';
import { activityDerivedProgress } from '../domain/derivedProgress';
import type { OrgNode, Project } from '../data/types';

/**
 * Staff-section dashboards at HQ levels: Monitoring, Planning, Procurement,
 * Finance and Contracts sections each see their OWN domain rolled up across
 * every under-command project, PD-wise → project-wise, with alarms — and every
 * row deep-links to the project screen where action is taken. The Command
 * section is the main dashboard itself plus the directives register.
 */

type Section = 'monitoring' | 'planning' | 'procurement' | 'finance' | 'contracts';
const SECTIONS: Array<[Section, string]> = [
  ['monitoring', 'Monitoring Sec'], ['planning', 'Planning Sec'], ['procurement', 'Procurement Sec'],
  ['finance', 'Finance Sec'], ['contracts', 'Contracts Sec'],
];

interface Row {
  projectId: string;
  projectName: string;
  pdName: string;
  cells: Record<string, string | number>;
  alarms: string[];
  href: string;
}

export function SectionDashboards({ nodes, projects }: { node?: OrgNode; nodes: OrgNode[]; projects: Project[] }) {
  const { provider } = useData();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('contracts');
  const [rows, setRows] = useState<Row[]>([]);
  const [pdFilter, setPdFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const nameOf = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n.name])), [nodes]);
  const pdOf = (p: Project) => nameOf[p.pdHqId] ?? p.pdHqId;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const out: Row[] = [];
      for (const p of projects) {
        const base = { projectId: p.id, projectName: nameOf[p.id] ?? p.id, pdName: pdOf(p) };
        if (section === 'contracts') {
          const [contracts, rars, subs, issues, machinery] = await Promise.all([
            provider.listContracts(p.id), provider.listRars(p.id), provider.listSubcontractors(p.id),
            provider.listMaterialIssues(p.id), provider.listMachineryUsage(p.id),
          ]);
          const subName = Object.fromEntries(subs.map((s) => [s.id, s.name]));
          const caValue = contracts.reduce((s, c) => s + (c.value ?? 0), 0);
          const rarBilled = rars.reduce((s, r) => s + r.gross, 0);
          const matBal = totalBalanceToRecover(issues);
          const machBal = totalMachineryToRecover(machinery);
          const alarms: string[] = [];
          if (matBal > 0) alarms.push(`material ${formatMoney(matBal)} unrecovered`);
          if (machBal > 0) alarms.push(`machinery ${formatMoney(machBal)} unrecovered`);
          out.push({
            ...base,
            cells: {
              'CAs': contracts.length,
              'Contractors': [...new Set(contracts.map((c) => subName[c.subcontractorId] ?? c.subcontractorId))].join(', ') || '—',
              'CA value': formatMoney(caValue),
              'RAR billed': formatMoney(rarBilled),
              'To recover': formatMoney(matBal + machBal),
            },
            alarms, href: `/node/${p.id}/commercial`,
          });
        } else if (section === 'procurement') {
          const [demands, payments, pos] = await Promise.all([
            provider.listDemands(p.id), provider.listProcPayments(p.id), provider.listPurchaseOrders(p.id),
          ]);
          const dPend = demands.filter((x) => pendingStage(x.chainType, x.currentStage)).length;
          const pPend = payments.filter((x) => pendingStage(x.chainType, x.currentStage)).length;
          const alarms = dPend + pPend > 0 ? [`${dPend + pPend} in approval chain`] : [];
          out.push({
            ...base,
            cells: {
              'Demands': demands.length, 'Pending': dPend + pPend,
              'Committed (POs)': formatMoney(pos.reduce((s, x) => s + x.totalValue, 0)),
              'Paid': formatMoney(payments.reduce((s, x) => s + x.amount, 0)),
            },
            alarms, href: `/node/${p.id}/procurement`,
          });
        } else if (section === 'finance') {
          const [receipts, payments, liabilities] = await Promise.all([
            provider.listReceipts(p.id), provider.listPayments(p.id), provider.listLiabilities(p.id),
          ]);
          const rec = receipts.reduce((s, x) => s + x.amount, 0);
          const pay = payments.reduce((s, x) => s + x.amount, 0);
          const liab = liabilities.reduce((s, x) => s + x.amount, 0);
          const alarms = liab > 0 ? [`${formatMoney(liab)} liabilities`] : [];
          out.push({
            ...base,
            cells: { 'Receipts': formatMoney(rec), 'Payments': formatMoney(pay), 'Net': formatMoney(rec - pay), 'Liabilities': formatMoney(liab) },
            alarms, href: `/node/${p.id}/financial`,
          });
        } else if (section === 'planning') {
          const [sched, boq, links, progress, cfg] = await Promise.all([
            provider.listSchedule(p.id), provider.listBoq(p.id), provider.listBoqWbs(p.id),
            provider.listProgress(p.id), provider.getCommercialConfig(p.id),
          ]);
          const derived = activityDerivedProgress(sched, boq, links, progress, new Date().toISOString().slice(0, 10));
          const tol = cfg.divergenceTolerancePct ?? 10;
          const diverging = derived.filter((r) => r.mapped && Math.abs(r.divergence) > tol).length;
          const slippage = p.actualPct - p.plannedPct;
          const alarms: string[] = [];
          if (slippage < -5) alarms.push(`${formatPct(slippage)} slippage`);
          if (diverging > 0) alarms.push(`${diverging} activities diverging`);
          out.push({
            ...base,
            cells: { 'Planned': formatPct(p.plannedPct), 'Actual': formatPct(p.actualPct), 'Slippage': formatPct(slippage), 'Diverging': diverging },
            alarms, href: `/node/${p.id}/execution`,
          });
        } else {
          // monitoring — stage-aware: completed projects report the recovery position
          const st = p.stage ?? 'ongoing';
          if (st !== 'ongoing') {
            const billed = Number(p.billedToDate), received = Number(p.receivedToDate);
            const pct = billed > 0 ? Math.round((received / billed) * 100) : 100;
            out.push({
              ...base,
              cells: { 'Health': st === 'financially_closed' ? 'closed' : `recv ${pct}%`, 'Sched': '—', 'Billing': '—', 'Cash': pct },
              alarms: st === 'physically_completed' && pct < 100 ? [`${100 - pct}% receivable outstanding`] : [],
              href: `/node/${p.id}`,
            });
          } else {
            const h = healthScore({ plannedPct: p.plannedPct, actualPct: p.actualPct, contractValue: Number(p.contractValue), billed: Number(p.billedToDate), received: Number(p.receivedToDate) });
            const alarms = h.band === 'red' ? ['health red'] : h.band === 'amber' ? ['health amber'] : [];
            out.push({
              ...base,
              cells: { 'Health': h.score, 'Sched': h.schedule, 'Billing': h.billing, 'Cash': h.collection },
              alarms, href: `/node/${p.id}`,
            });
          }
        }
        if (!alive) return;
      }
      if (alive) { setRows(out); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [provider, projects, section, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const pds = useMemo(() => [...new Set(rows.map((r) => r.pdName))].sort(), [rows]);
  const visible = pdFilter === 'all' ? rows : rows.filter((r) => r.pdName === pdFilter);
  const columns = visible[0] ? Object.keys(visible[0].cells) : [];
  const alarmCount = rows.filter((r) => r.alarms.length > 0).length;

  return (
    <div>
      <div className="filter-bar" role="group" aria-label="Section selector" style={{ marginBottom: 8 }}>
        {SECTIONS.map(([id, label]) => (
          <button key={id} className="btn-ghost btn-mini" aria-pressed={section === id}
            onClick={() => setSection(id)} style={section === id ? { borderColor: 'var(--primary)', fontWeight: 600 } : undefined}>
            {label}
          </button>
        ))}
        <select aria-label="Filter by PD" value={pdFilter} onChange={(e) => setPdFilter(e.target.value)}>
          <option value="all">All PDs</option>
          {pds.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {alarmCount > 0 && <span className="muted small">⚠ {alarmCount} project{alarmCount === 1 ? '' : 's'} with alarms</span>}
      </div>

      {loading ? <p className="muted small">Compiling section roll-up…</p> : (
        <table className="data-table" aria-label={`${section} section`}>
          <thead><tr><th>PD</th><th>Project</th>{columns.map((c) => <th key={c} className={c === 'Contractors' ? '' : 'num'}>{c}</th>)}<th>Alarms</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.projectId} className={`row-link${r.alarms.length ? ' row-flag' : ''}`} onClick={() => navigate(r.href)}>
                <td className="small">{r.pdName}</td>
                <td>{r.projectName}</td>
                {columns.map((c) => <td key={c} className={c === 'Contractors' ? 'small' : 'num'}>{r.cells[c]}</td>)}
                <td className="small">{r.alarms.length ? r.alarms.map((a) => <span key={a} className="neg" style={{ display: 'block' }}>⚠ {a}</span>) : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small" style={{ marginTop: 6 }}>
        Each row deep-links to the project screen where the section acts. The Command Section is the dashboard above plus the directives register.
      </p>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney, toNum } from '../../domain/money';
import { retentionSummary } from '../../domain/retention';
import { advanceSummary } from '../../domain/advances';
import type { BoqItem, Ipc, Rar, Epc, Advance } from '../../data/types';

const money = (n: number) => (n !== 0 ? formatMoney(n) : '0');

export function CommercialDashboard({ projectId, onNavigate }: { projectId: string; onNavigate?: (sub: string) => void }) {
  const { provider, projects } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [advs, setAdvs] = useState<Advance[]>([]);

  useEffect(() => {
    let a = true;
    void Promise.all([
      provider.listBoq(projectId), provider.listIpcs(projectId), provider.listRars(projectId),
      provider.listEpcs(projectId), provider.listAdvances(projectId),
    ]).then(([b, i, r, e, ad]) => { if (a) { setBoq(b); setIpcs(i); setRars(r); setEpcs(e); setAdvs(ad); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const k = useMemo(() => {
    const contractValue = toNum(projects.find((p) => p.id === projectId)?.contractValue ?? '0');
    const boqValue = boq.reduce((s, b) => s + b.amount, 0);
    const ipcGross = ipcs.reduce((s, i) => s + i.gross, 0);
    const ipcNet = ipcs.reduce((s, i) => s + i.netPayable, 0);
    const rarBooked = rars.reduce((s, r) => s + r.gross, 0);
    const escalation = epcs.reduce((s, e) => s + e.amount, 0);
    const retention = retentionSummary(ipcs, contractValue).deducted;
    const mob = advanceSummary(advs, 'mob');
    const sec = advanceSummary(advs, 'secure');
    const outstandingAdv = mob.outstandingClient + sec.outstandingClient;
    const coverage = ipcGross > 0 ? rarBooked / ipcGross : 0;
    return { contractValue, boqValue, ipcGross, ipcNet, rarBooked, escalation, retention, outstandingAdv, coverage };
  }, [projects, projectId, boq, ipcs, rars, epcs, advs]);

  const tiles: Array<{ label: string; value: string; sub?: string; to?: string }> = [
    { label: 'Contract value', value: money(k.contractValue), sub: 'FGEHA award' },
    { label: 'BOQ value', value: money(k.boqValue), sub: `${boq.length} items`, to: 'boq' },
    { label: 'IPC gross billed', value: money(k.ipcGross), sub: `${ipcs.length} IPCs`, to: 'ipc' },
    { label: 'IPC net certified', value: money(k.ipcNet), sub: 'after deductions', to: 'genipc' },
    { label: 'RAR booked', value: money(k.rarBooked), sub: `${rars.length} RARs`, to: 'rar' },
    { label: 'Coverage (RAR ÷ IPC)', value: `${(k.coverage * 100).toFixed(1)}%`, sub: 'sub vs client', to: 'recon' },
    { label: 'Retention held', value: money(k.retention), sub: 'cumulative', to: 'retention' },
    { label: 'Escalation (EPC)', value: money(k.escalation), sub: `${epcs.length} EPCs`, to: 'epc' },
    { label: 'Outstanding advances', value: money(k.outstandingAdv), sub: 'recoverable', to: 'adv' },
  ];

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Commercial Dashboard</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>The contract-control position at a glance — billing, recovery, retention, escalation and advances. Tap a tile to drill in.</p>
        </div>
      </div>
      <div className="dash-grid">
        {tiles.map((t) => (
          <button key={t.label} className={`dash-tile${t.to ? ' clickable' : ''}`} disabled={!t.to} onClick={() => t.to && onNavigate?.(t.to)} aria-label={t.label}>
            <div className="kpi-label">{t.label}</div>
            <div className="kpi-value">{t.value}</div>
            {t.sub && <div className="muted small">{t.sub}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney, toNum } from '../../domain/money';
import { retentionSummary } from '../../domain/retention';
import { advanceSummary } from '../../domain/advances';
import { revisedContractValue } from '../../domain/variations';
import { seriesByPeriod, trendDelta } from '../../domain/trends';
import { Sparkline } from '../../components/Sparkline';
import { SkeletonTiles } from '../../components/Skeleton';
import type { BoqItem, Ipc, Rar, Epc, Advance, Variation } from '../../data/types';

const money = (n: number) => (n !== 0 ? formatMoney(n) : '0');

export function CommercialDashboard({ projectId, onNavigate }: { projectId: string; onNavigate?: (sub: string) => void }) {
  const { provider, projects } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [advs, setAdvs] = useState<Advance[]>([]);
  const [vos, setVos] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let a = true;
    void Promise.all([
      provider.listBoq(projectId), provider.listIpcs(projectId), provider.listRars(projectId),
      provider.listEpcs(projectId), provider.listAdvances(projectId), provider.listVariations(projectId),
    ]).then(([b, i, r, e, ad, vo]) => { if (a) { setBoq(b); setIpcs(i); setRars(r); setEpcs(e); setAdvs(ad); setVos(vo); setLoading(false); } });
    return () => { a = false; };
  }, [provider, projectId]);

  const k = useMemo(() => {
    const original = toNum(projects.find((p) => p.id === projectId)?.contractValue ?? '0');
    const contractValue = revisedContractValue(original, vos);
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
    return { contractValue, original, boqValue, ipcGross, ipcNet, rarBooked, escalation, retention, outstandingAdv, coverage };
  }, [projects, projectId, boq, ipcs, rars, epcs, advs, vos]);

  const series = useMemo(() => ({
    ipcGross: seriesByPeriod(ipcs, (i) => i.period, (i) => i.gross),
    ipcNet: seriesByPeriod(ipcs, (i) => i.period, (i) => i.netPayable),
    rar: seriesByPeriod(rars, (r) => r.period, (r) => r.gross),
    epc: seriesByPeriod(epcs, (e) => e.period, (e) => e.amount),
  }), [ipcs, rars, epcs]);

  const tiles: Array<{ label: string; value: string; sub?: string; to?: string; trend?: number[]; delta?: number | null }> = [
    { label: 'Contract value', value: money(k.contractValue), sub: k.contractValue !== k.original ? `revised · award ${money(k.original)}` : 'FGEHA award', to: 'variations' },
    { label: 'BOQ value', value: money(k.boqValue), sub: `${boq.length} items`, to: 'boq' },
    { label: 'IPC gross billed', value: money(k.ipcGross), sub: `${ipcs.length} IPCs`, to: 'ipc', trend: series.ipcGross.map((p) => p.cum), delta: trendDelta(series.ipcGross) },
    { label: 'IPC net certified', value: money(k.ipcNet), sub: 'after deductions', to: 'genipc', trend: series.ipcNet.map((p) => p.cum), delta: trendDelta(series.ipcNet) },
    { label: 'RAR booked', value: money(k.rarBooked), sub: `${rars.length} RARs`, to: 'rar', trend: series.rar.map((p) => p.cum), delta: trendDelta(series.rar) },
    { label: 'Coverage (RAR ÷ IPC)', value: `${(k.coverage * 100).toFixed(1)}%`, sub: 'sub vs client', to: 'recon' },
    { label: 'Retention held', value: money(k.retention), sub: 'cumulative', to: 'retention' },
    { label: 'Escalation (EPC)', value: money(k.escalation), sub: `${epcs.length} EPCs`, to: 'epc', trend: series.epc.map((p) => p.cum), delta: trendDelta(series.epc) },
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
      {loading ? <SkeletonTiles count={9} /> : (
      <div className="dash-grid">
        {tiles.map((t) => (
          <button key={t.label} className={`dash-tile${t.to ? ' clickable' : ''}`} disabled={!t.to} onClick={() => t.to && onNavigate?.(t.to)} aria-label={t.label}>
            <div className="kpi-label">{t.label}</div>
            <div className="kpi-value">{t.value}</div>
            <div className="dash-tile-foot">
              {t.sub && <span className="muted small">{t.sub}</span>}
              {t.delta != null && (
                <span className={`trend-delta ${t.delta >= 0 ? 'up' : 'down'}`}>{t.delta >= 0 ? '▲' : '▼'} {Math.abs(t.delta * 100).toFixed(0)}%</span>
              )}
              {t.trend && t.trend.length > 1 && <Sparkline values={t.trend} />}
            </div>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

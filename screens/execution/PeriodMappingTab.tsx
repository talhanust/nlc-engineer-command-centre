import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney, toNum } from '../../domain/money';
import { TIMELINE } from '../../domain/scurve';
import { coverage, financialCurve, twinSeries, withAutoDefaults, type PeriodMap } from '../../domain/periodmap';
import { TwinSCurveChart } from '../../components/TwinSCurveChart';
import type { Ipc, MonthlySeriesPoint, Project } from '../../data/types';

export function PeriodMappingTab({ projectId }: { projectId: string }) {
  const { provider, projects } = useData();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [series, setSeries] = useState<MonthlySeriesPoint[]>([]);
  const [map, setMap] = useState<PeriodMap>({});
  const project = projects.find((p: Project) => p.id === projectId);

  async function load() {
    const [i, s, m] = await Promise.all([
      provider.listIpcs(projectId),
      provider.listMonthlySeries(projectId),
      provider.getPeriodMap(projectId),
    ]);
    setIpcs(i);
    setSeries(s);
    setMap(withAutoDefaults(i, m));
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  async function setMonth(ipcNo: string, month: string) {
    const next = await provider.setPeriodMapping(projectId, ipcNo, month);
    setMap({ ...next });
  }

  const cov = coverage(ipcs, map);
  const contract = toNum(project?.contractValue ?? '0');
  const fin = financialCurve(ipcs, map, contract);
  const twin = twinSeries(series, fin);

  return (
    <div>
      <div className="section-head">
        <h3>Period mapping</h3>
        <span className="muted">{cov}% of IPCs mapped to schedule months</span>
      </div>
      <p className="muted small">
        Assign each IPC's billing period to a programme month. This builds the financial (billing)
        curve and overlays it on physical progress to expose billing-vs-progress divergence.
      </p>

      {ipcs.length === 0 ? (
        <p className="muted">No IPCs to map yet.</p>
      ) : (
        <>
          <table className="data-table" aria-label="Period mapping">
            <thead><tr><th>IPC</th><th>Period</th><th className="num">Gross</th><th>Mapped month</th></tr></thead>
            <tbody>
              {ipcs.map((i) => (
                <tr key={i.ipcNo}>
                  <td>{i.ipcNo}</td>
                  <td>{i.period}</td>
                  <td className="num">{formatMoney(i.gross)}</td>
                  <td>
                    <select aria-label={`Month for ${i.ipcNo}`} value={map[i.ipcNo] ?? ''} onChange={(e) => setMonth(i.ipcNo, e.target.value)}>
                      <option value="">— unmapped —</option>
                      {TIMELINE.map((m) => (<option key={m} value={m}>{m}</option>))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16 }}>
            <TwinSCurveChart data={twin} />
          </div>
        </>
      )}
    </div>
  );
}

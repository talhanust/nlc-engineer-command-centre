import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { materialRecovery, issueValue } from '../../domain/materialrecovery';
import { consumptionVariance, WASTAGE_TOLERANCE_PCT } from '../../domain/consumption';
import type { MaterialIssue, Subcontractor, BoqItem, BoqMaterialLink, ProgressUpdate, MaterialMaster } from '../../data/types';

/**
 * Material Issues register (prototype parity). NLC material issued to site or
 * to a contractor; issued value = qty × rate. Contractor-linked issues carry a
 * recoverable balance netted via RAR material recovery, and stock consumed
 * here reduces on-hand in the lead-time planner.
 */
export function MaterialIssuesTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [matLinks, setMatLinks] = useState<BoqMaterialLink[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [master, setMaster] = useState<MaterialMaster[]>([]);
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [contractorId, setContractorId] = useState('');

  async function load() {
    const [i, s, b, ml, pr, mm] = await Promise.all([
      provider.listMaterialIssues(projectId), provider.listSubcontractors(projectId),
      provider.listBoq(projectId), provider.listBoqMaterial(projectId), provider.listProgress(projectId),
      provider.listMaterialMaster(projectId),
    ]);
    setIssues(i); setSubs(s); setBoq(b); setMatLinks(ml); setProgress(pr); setMaster(mm);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s.name])), [subs]);
  const recovery = useMemo(() => materialRecovery(issues), [issues]);
  const consumption = useMemo(
    () => consumptionVariance({ items: boq, matLinks, progress, issues }),
    [boq, matLinks, progress, issues],
  );

  async function add() {
    const q = Number(qty), r = Number(rate);
    if (!code.trim() || !Number.isFinite(q) || q <= 0) return;
    await provider.createMaterialIssue(projectId, {
      dated: new Date().toISOString().slice(0, 10), materialCode: code.trim().toUpperCase(),
      qty: q, issuedTo: issuedTo.trim() || 'Site works', rate: Number.isFinite(r) && r > 0 ? r : undefined,
      contractorId: contractorId || undefined, recovered: 0,
    });
    setCode(''); setQty(''); setRate(''); setIssuedTo(''); setContractorId('');
    await load();
    toast({ message: 'Material issue recorded', kind: 'success' });
  }

  async function setRecovered(i: MaterialIssue, v: string) {
    const cap = issueValue(i);
    const n = Math.max(0, Math.min(cap, Number(v) || 0));
    await provider.setMaterialRecovered(projectId, i.id, n);
    await load();
  }

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head"><h3>Material issues</h3>
          <span className="muted small">issued value = qty × rate; contractor balances recover via RAR · issues reduce lead-time stock</span>
        </div>
        <div className="create-row">
          <input aria-label="Issue material code" placeholder="Material code (e.g. CEM)" value={code} list="issue-master-codes"
            onChange={(e) => {
              const v = e.target.value;
              setCode(v);
              const m = master.find((x) => x.code === v.trim().toUpperCase());
              if (m && !rate) setRate(String(m.standardRate)); // default the issue rate from the master
            }} style={{ width: 150 }} />
          <datalist id="issue-master-codes">
            {master.map((m) => <option key={m.code} value={m.code}>{m.name} · {m.standardRate}/{m.unit}</option>)}
          </datalist>
          <input aria-label="Issue qty" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 90 }} />
          <input aria-label="Issue rate" placeholder="Rate (opt.)" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 100 }} />
          <input aria-label="Issued to" placeholder="Activity / WBS / location" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <select aria-label="Issue contractor" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
            <option value="">NLC works (no recovery)</option>
            {subs.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.kind === 'labor' ? ' (labour)' : ''}</option>))}
          </select>
          <button className="btn" onClick={add}>Issue material</button>
        </div>

        {issues.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>No material issued yet.</p>
        ) : (
          <table className="data-table" aria-label="Material issues">
            <thead><tr><th>Date</th><th>Material</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Value</th><th>Issued to</th><th>Contractor</th><th className="num">Recovered</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {issues.map((i) => {
                const val = issueValue(i);
                const rec = i.recovered ?? 0;
                return (
                  <tr key={i.id}>
                    <td className="small">{i.dated}</td>
                    <td className="mono small">{i.materialCode}</td>
                    <td className="num">{i.qty.toLocaleString('en-PK')}</td>
                    <td className="num">{i.rate ? i.rate.toLocaleString('en-PK') : '—'}</td>
                    <td className="num">{val > 0 ? formatMoney(val) : '—'}</td>
                    <td className="small">{i.issuedTo}</td>
                    <td className="small">{i.contractorId ? subName[i.contractorId] ?? '—' : <span className="muted">NLC works</span>}</td>
                    <td className="num">
                      {i.contractorId && val > 0 ? (
                        <input type="number" aria-label={`Recovered ${i.materialCode} ${i.id}`} defaultValue={rec} min={0} max={val} style={{ width: 110 }}
                          onBlur={(e) => Number(e.target.value) !== rec && setRecovered(i, e.target.value)} />
                      ) : '—'}
                    </td>
                    <td className="num">{i.contractorId && val > 0 ? formatMoney(val - rec) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h3>Recovery by contractor</h3>
          <span className="muted small">outstanding issued-material balance, recoverable from RARs</span>
        </div>
        {recovery.length === 0 ? (
          <p className="muted small">No contractor-linked issues.</p>
        ) : (
          <table className="data-table" aria-label="Material recovery by contractor">
            <thead><tr><th>Contractor</th><th className="num">Issued value</th><th className="num">Recovered</th><th className="num">Balance to recover</th></tr></thead>
            <tbody>
              {recovery.map((r) => (
                <tr key={r.contractorId}>
                  <td>{subName[r.contractorId] ?? r.contractorId}</td>
                  <td className="num">{formatMoney(r.issuedValue)}</td>
                  <td className="num">{formatMoney(r.recovered)}</td>
                  <td className={`num${r.balance > 0 ? ' neg' : ''}`}>{formatMoney(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h3>Consumption variance — theoretical vs actual</h3>
          <span className="muted small">theoretical = executed qty × composition coeff · wastage beyond ±{WASTAGE_TOLERANCE_PCT}% flagged</span>
        </div>
        {consumption.length === 0 ? (
          <p className="muted small">Compose BOQ items with materials in Mapping to derive theoretical consumption.</p>
        ) : (
          <table className="data-table" aria-label="Consumption variance">
            <thead><tr><th>Material</th><th>Consuming items</th><th className="num">Theoretical</th><th className="num">Issued</th><th className="num">Variance</th><th className="num">Wastage %</th></tr></thead>
            <tbody>
              {consumption.map((r) => {
                const flag = r.wastagePct !== null && Math.abs(r.wastagePct) > WASTAGE_TOLERANCE_PCT;
                return (
                  <tr key={r.materialRef} className={flag ? 'row-flag' : ''}>
                    <td className="mono small">{r.materialRef}</td>
                    <td className="small">{r.items.join(', ') || '—'}</td>
                    <td className="num">{r.theoreticalQty.toLocaleString('en-PK')}</td>
                    <td className="num">{r.issuedQty.toLocaleString('en-PK')}</td>
                    <td className={`num${r.varianceQty > 0 ? ' neg' : ''}`}>{r.varianceQty.toLocaleString('en-PK')}</td>
                    <td className={`num${flag ? ' neg' : ''}`}>{r.wastagePct === null ? '—' : `${r.wastagePct}%${flag ? ' ⚠' : ''}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

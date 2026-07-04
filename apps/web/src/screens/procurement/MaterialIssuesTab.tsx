import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { materialRecovery, issueValue } from '../../domain/materialrecovery';
import type { MaterialIssue, Subcontractor } from '../../data/types';

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
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [contractorId, setContractorId] = useState('');

  async function load() {
    const [i, s] = await Promise.all([provider.listMaterialIssues(projectId), provider.listSubcontractors(projectId)]);
    setIssues(i); setSubs(s);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s.name])), [subs]);
  const recovery = useMemo(() => materialRecovery(issues), [issues]);

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
          <input aria-label="Issue material code" placeholder="Material code (e.g. CEM)" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 150 }} />
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
    </div>
  );
}

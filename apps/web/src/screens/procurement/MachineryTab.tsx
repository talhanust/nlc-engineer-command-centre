import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { formatMoney } from '../../domain/money';
import { machineryRecovery, usageValue } from '../../domain/machineryRecovery';
import type { MachineryUsage, Subcontractor } from '../../data/types';

/**
 * NLC plant/machinery hired to contractors. Usage value = hours × rate; the
 * outstanding balance (value − recovered) is recoverable from the contractor's
 * RAR (machinery recovery), mirroring material issues.
 */
export function MachineryTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [usage, setUsage] = useState<MachineryUsage[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [contractorId, setContractorId] = useState('');

  async function load() {
    const [u, s] = await Promise.all([provider.listMachineryUsage(projectId), provider.listSubcontractors(projectId)]);
    setUsage(u); setSubs(s);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s.name])), [subs]);
  const recovery = useMemo(() => machineryRecovery(usage), [usage]);

  async function add() {
    const h = Number(hours), r = Number(rate);
    if (!code.trim() || !Number.isFinite(h) || h <= 0 || !Number.isFinite(r) || r <= 0) return;
    const m = await provider.createMachineryUsage(projectId, {
      dated: new Date().toISOString().slice(0, 10), machineryCode: code.trim(), description: desc.trim(),
      hours: h, rate: r, contractorId: contractorId || undefined, recovered: 0,
    });
    setCode(''); setDesc(''); setHours(''); setRate(''); setContractorId('');
    await load();
    toast({ message: `Logged ${m.machineryCode}`, kind: 'success' });
  }

  async function setRecovered(m: MachineryUsage, v: string) {
    const n = Math.max(0, Math.min(usageValue(m), Number(v) || 0));
    await provider.setMachineryRecovered(projectId, m.id, n);
    await load();
  }

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head"><h3>NLC machinery hired to contractors</h3>
          <span className="muted small">usage value = hours × rate; balance is recoverable via RAR</span>
        </div>
        <div className="create-row">
          <input aria-label="Machinery code" placeholder="Plant / reg no." value={code} onChange={(e) => setCode(e.target.value)} />
          <input aria-label="Machinery description" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <input aria-label="Machinery hours" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} style={{ width: 90 }} />
          <input aria-label="Machinery rate" placeholder="Rate/hr" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 100 }} />
          <select aria-label="Machinery contractor" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
            <option value="">Contractor (for recovery)</option>
            {subs.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.kind === 'labor' ? ' (labour)' : ''}</option>))}
          </select>
          <button className="btn" onClick={add}>Log usage</button>
        </div>

        {usage.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>No machinery logged yet.</p>
        ) : (
          <table className="data-table" aria-label="Machinery usage">
            <thead><tr><th>Date</th><th>Plant</th><th>Description</th><th>Contractor</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Value</th><th className="num">Recovered</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {usage.map((m) => {
                const val = usageValue(m);
                const rec = m.recovered ?? 0;
                return (
                  <tr key={m.id}>
                    <td className="small">{m.dated}</td>
                    <td className="mono small">{m.machineryCode}</td>
                    <td>{m.description}</td>
                    <td className="small">{m.contractorId ? subName[m.contractorId] ?? '—' : <span className="muted">— (NLC works)</span>}</td>
                    <td className="num">{m.hours.toLocaleString('en-PK')}</td>
                    <td className="num">{m.rate.toLocaleString('en-PK')}</td>
                    <td className="num">{formatMoney(val)}</td>
                    <td className="num">
                      <input type="number" aria-label={`Recovered ${m.machineryCode}`} defaultValue={rec} min={0} max={val} style={{ width: 110 }}
                        onBlur={(e) => Number(e.target.value) !== rec && setRecovered(m, e.target.value)} />
                    </td>
                    <td className="num">{formatMoney(val - rec)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h3>Recovery by contractor</h3>
          <span className="muted small">outstanding machinery balance, recoverable from RARs</span>
        </div>
        {recovery.length === 0 ? (
          <p className="muted small">No contractor-linked machinery usage.</p>
        ) : (
          <table className="data-table" aria-label="Machinery recovery by contractor">
            <thead><tr><th>Contractor</th><th className="num">Usage value</th><th className="num">Recovered</th><th className="num">Balance to recover</th></tr></thead>
            <tbody>
              {recovery.map((r) => (
                <tr key={r.contractorId}>
                  <td>{subName[r.contractorId] ?? r.contractorId}</td>
                  <td className="num">{formatMoney(r.usageValue)}</td>
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

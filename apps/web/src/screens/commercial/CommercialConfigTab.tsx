import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { useRole } from '../../state/Role';
import { formatMoney } from '../../domain/money';
import { DEFAULT_COMMERCIAL_CONFIG } from '../../domain/ipc';
import type { CommercialConfig, Contract, Subcontractor } from '../../data/types';

const pct = (n: number) => `${(+n || 0).toFixed(n % 1 ? 1 : 0)}%`;

/**
 * Per-project commercial deductions (retention / income tax / GST applied to client
 * IPCs) plus per-contract subcontractor retention. Retention on contracts is the
 * primary lever; taxes apply when IPCs/RARs are generated.
 */
export function CommercialConfigTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const { can } = useRole();
  const editable = can('manager_contracts');

  const [cfg, setCfg] = useState<CommercialConfig>(DEFAULT_COMMERCIAL_CONFIG);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function load() {
    const [c, ctr, sb] = await Promise.all([
      provider.getCommercialConfig(projectId),
      provider.listContracts(projectId),
      provider.listSubcontractors(projectId),
    ]);
    setCfg(c); setContracts(ctr); setSubs(sb); setDirty(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = useMemo(() => Object.fromEntries(subs.map((s) => [s.id, s.name])), [subs]);

  function field(k: keyof CommercialConfig, v: string) {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    setCfg((p) => ({ ...p, [k]: n })); setDirty(true);
  }

  async function save() {
    setBusy(true);
    try { const saved = await provider.setCommercialConfig(projectId, cfg); setCfg(saved); setDirty(false); toast({ message: 'Commercial config saved', kind: 'success' }); }
    finally { setBusy(false); }
  }

  async function setRetention(c: Contract, v: string) {
    const n = Math.max(0, Math.min(5, Number(v) || 0)); // capped at 5% of contract value
    await provider.setContractRetention(projectId, c.id, n);
    setContracts((prev) => prev.map((x) => (x.id === c.id ? { ...x, retentionPct: n } : x)));
    toast({ message: `${c.contractNo} retention → ${pct(n)}`, kind: 'success' });
  }

  const totalTax = cfg.incomeTaxPct + cfg.gstPct;

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head"><h3>Client billing deductions</h3>
          <span className="muted small">applied to every IPC at generation</span>
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Net certified = gross − retention − income tax − GST/stamp. Retention is released against the retention schedule; taxes are withheld at source.
        </p>
        <div className="cfg-grid" role="group" aria-label="Commercial deduction config">
          <label className="cfg-field">
            <span>IPC retention</span>
            <input type="number" aria-label="IPC retention %" min={0} max={100} step={0.5}
              value={cfg.ipcRetentionPct} disabled={!editable}
              onChange={(e) => field('ipcRetentionPct', e.target.value)} />
            <small className="muted">% of IPC gross withheld by client</small>
          </label>
          <label className="cfg-field">
            <span>Income tax</span>
            <input type="number" aria-label="Income tax %" min={0} max={100} step={0.5}
              value={cfg.incomeTaxPct} disabled={!editable}
              onChange={(e) => field('incomeTaxPct', e.target.value)} />
            <small className="muted">withholding at source</small>
          </label>
          <label className="cfg-field">
            <span>GST / stamp</span>
            <input type="number" aria-label="GST stamp %" min={0} max={100} step={0.25}
              value={cfg.gstPct} disabled={!editable}
              onChange={(e) => field('gstPct', e.target.value)} />
            <small className="muted">second statutory line (0 if N/A)</small>
          </label>
        </div>
        <div className="cfg-summary muted small" aria-label="Deduction summary">
          On a PKR 100 IPC: retention {pct(cfg.ipcRetentionPct)} · taxes {pct(totalTax)} →
          net <strong>{formatMoney(100 * (1 - (cfg.ipcRetentionPct + totalTax) / 100))}</strong>
        </div>
        {editable && (
          <button className="btn" disabled={busy || !dirty} onClick={save} style={{ marginTop: 10 }}>
            {dirty ? 'Save deductions' : 'Saved'}
          </button>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h3>Subcontractor retention (per contract)</h3>
          <span className="muted small">capped at 5% of contract value</span>
        </div>
        {contracts.length === 0 ? (
          <p className="muted">No contracts yet. Retention is set when a contract is awarded.</p>
        ) : (
          <table className="data-table" aria-label="Contract retention">
            <thead><tr><th>Contract</th><th>Subcontractor</th><th className="num">Value</th><th className="num">Retention %</th><th className="num">Max held</th></tr></thead>
            <tbody>
              {contracts.map((c) => {
                const r = c.retentionPct ?? 5;
                return (
                  <tr key={c.id}>
                    <td>{c.contractNo}</td>
                    <td>{subName[c.subcontractorId] ?? '—'}</td>
                    <td className="num">{formatMoney(c.value)}</td>
                    <td className="num">
                      <input type="number" aria-label={`Retention for ${c.contractNo}`} min={0} max={5} step={0.5}
                        defaultValue={r} disabled={!editable} style={{ width: 72 }}
                        onBlur={(e) => editable && Number(e.target.value) !== r && setRetention(c, e.target.value)} />
                    </td>
                    <td className="num">{formatMoney(c.value * Math.min(5, r) / 100)}</td>
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

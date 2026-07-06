import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import type { MaterialMaster } from '../../data/types';

/**
 * Material master — the controlled catalogue (code · unit · spec · standard
 * rate · lead days). Compositions, issue rates, rate analysis and lead-time
 * defaults all draw from here instead of free-text codes.
 */
export function MaterialMasterTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [rows, setRows] = useState<MaterialMaster[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [rate, setRate] = useState('');
  const [spec, setSpec] = useState('');
  const [lead, setLead] = useState('');

  async function load() { setRows(await provider.listMaterialMaster(projectId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  async function add() {
    const r = Number(rate);
    if (!code.trim() || !unit.trim() || !Number.isFinite(r) || r <= 0) return;
    setRows(await provider.upsertMaterialMaster(projectId, {
      code: code.trim().toUpperCase(), name: name.trim() || code.trim().toUpperCase(), unit: unit.trim(),
      standardRate: r, spec: spec.trim() || undefined, leadDays: Number(lead) > 0 ? Number(lead) : undefined,
    }));
    setCode(''); setName(''); setUnit(''); setRate(''); setSpec(''); setLead('');
    toast({ message: 'Material saved', kind: 'success' });
  }

  async function patchRate(m: MaterialMaster, v: string) {
    const r = Number(v);
    if (!Number.isFinite(r) || r <= 0 || r === m.standardRate) return;
    setRows(await provider.upsertMaterialMaster(projectId, { ...m, standardRate: r }));
  }

  async function remove(m: MaterialMaster) {
    setRows(await provider.deleteMaterialMaster(projectId, m.code));
  }

  return (
    <section className="card">
      <div className="section-head"><h3>Material master</h3>
        <span className="muted small">controlled catalogue — feeds compositions, rate analysis, issue rates and lead-time defaults</span>
      </div>
      <div className="create-row">
        <input aria-label="Master code" placeholder="Code (CEM)" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 110 }} />
        <input aria-label="Master name" placeholder="Name / description" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <input aria-label="Master unit" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 70 }} />
        <input aria-label="Master rate" placeholder="Rate (PKR)" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 100 }} />
        <input aria-label="Master spec" placeholder="Spec (opt.)" value={spec} onChange={(e) => setSpec(e.target.value)} style={{ width: 150 }} />
        <input aria-label="Master lead days" placeholder="Lead d." value={lead} onChange={(e) => setLead(e.target.value)} style={{ width: 70 }} />
        <button className="btn" onClick={add}>Save material</button>
      </div>
      {rows.length === 0 ? (
        <p className="muted" style={{ padding: 12 }}>No materials in the catalogue yet.</p>
      ) : (
        <table className="data-table" aria-label="Material master">
          <thead><tr><th>Code</th><th>Name</th><th>Unit</th><th>Spec</th><th className="num">Standard rate</th><th className="num">Lead (days)</th><th></th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.code}>
                <td className="mono small">{m.code}</td>
                <td>{m.name}</td>
                <td className="small">{m.unit}</td>
                <td className="small muted">{m.spec ?? '—'}</td>
                <td className="num">
                  <input type="number" aria-label={`Rate ${m.code}`} defaultValue={m.standardRate} min={0} style={{ width: 110 }}
                    onBlur={(e) => patchRate(m, e.target.value)} />
                </td>
                <td className="num">{m.leadDays ?? '—'}</td>
                <td><button className="link-btn" aria-label={`Delete ${m.code}`} onClick={() => remove(m)}>remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

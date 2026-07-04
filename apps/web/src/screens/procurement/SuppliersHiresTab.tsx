import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { getPowers, ROLE_LABEL } from '../../domain/chains';
import { CategoryBar } from '../../components/CategoryCharts';
import type { Supplier, MachineryHire } from '../../data/types';

export function SuppliersHiresTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [hires, setHires] = useState<MachineryHire[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Supplier['kind']>('material');
  const [hireSup, setHireSup] = useState('');
  const [basis, setBasis] = useState<MachineryHire['rateBasis']>('per_day');
  const [rate, setRate] = useState('');
  const [openHire, setOpenHire] = useState<string | null>(null);

  async function reload() {
    const [s, h] = await Promise.all([provider.listSuppliers(projectId), provider.listHires(projectId)]);
    setSuppliers(s); setHires(h);
    if (s[0] && !hireSup) setHireSup(s[0].id);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const supName = useMemo(() => {
    const m = new Map(suppliers.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? id;
  }, [suppliers]);

  async function addSupplier() {
    if (!name.trim()) return;
    await provider.addSupplier(projectId, { name: name.trim(), kind });
    setName(''); await reload();
  }
  async function addHire() {
    const r = Number(rate);
    if (!hireSup || !Number.isFinite(r)) return;
    await provider.createHire(projectId, { supplierId: hireSup, rateBasis: basis, rate: r });
    setRate(''); await reload();
  }

  return (
    <div>
      <div className="section-head"><h3>Suppliers</h3><span className="muted">{suppliers.length}</span></div>
      <div className="card create-row">
        <input aria-label="Supplier name" placeholder="Supplier name" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Supplier kind" value={kind} onChange={(e) => setKind(e.target.value as Supplier['kind'])}>
          <option value="material">Material</option><option value="machinery">Machinery</option><option value="both">Both</option>
        </select>
        <button className="btn" onClick={addSupplier}>Add supplier</button>
      </div>
      {suppliers.length > 0 && (
        <table className="data-table" aria-label="Suppliers">
          <thead><tr><th>Name</th><th>Kind</th></tr></thead>
          <tbody>{suppliers.map((s) => (<tr key={s.id}><td>{s.name}</td><td style={{ textTransform: 'capitalize' }}>{s.kind}</td></tr>))}</tbody>
        </table>
      )}

      <div className="section-head" style={{ marginTop: 20 }}><h3>Machinery hires</h3><span className="muted">{hires.length}</span></div>
      <div className="card create-row">
        <select aria-label="Hire supplier" value={hireSup} onChange={(e) => setHireSup(e.target.value)}>
          {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
        <select aria-label="Hire basis" value={basis} onChange={(e) => setBasis(e.target.value as MachineryHire['rateBasis'])}>
          <option value="per_day">Per day</option><option value="per_hour">Per hour</option><option value="lumpsum">Lumpsum</option>
        </select>
        <input aria-label="Hire rate" placeholder="Rate (PKR)" value={rate} onChange={(e) => setRate(e.target.value)} />
        <button className="btn" onClick={addHire} disabled={suppliers.length === 0}>Add hire</button>
      </div>
      {hires.length > 0 && (
        <table className="data-table" aria-label="Hires">
          <thead><tr><th>Hire</th><th>Supplier</th><th>Basis</th><th className="num">Rate</th><th className="num">Units</th><th className="num">Cost</th><th></th></tr></thead>
          <tbody>
            {hires.map((h) => {
              const units = h.utilization.reduce((a, u) => a + u.units, 0);
              return (
                <tr key={h.id}>
                  <td>{h.hireNo}</td><td>{supName(h.supplierId)}</td><td>{h.rateBasis.replace('_', ' ')}</td>
                  <td className="num">{h.rate.toLocaleString('en-PK')}</td>
                  <td className="num">{units.toLocaleString('en-PK')}</td>
                  <td className="num">{formatMoney(units * h.rate)}</td>
                  <td><button className="btn-ghost" onClick={() => setOpenHire(openHire === h.hireNo ? null : h.hireNo)}>{openHire === h.hireNo ? 'Hide' : 'Utilization'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {openHire && (() => {
        const hire = hires.find((h) => h.hireNo === openHire);
        if (!hire) return null;
        return <HireUtilization key={hire.hireNo} projectId={projectId} hire={hire} onChange={reload} />;
      })()}

      <div className="section-head" style={{ marginTop: 20 }}><h3>Financial powers</h3></div>
      <table className="data-table" aria-label="Financial powers">
        <thead><tr><th>Role</th><th className="num">Ceiling</th></tr></thead>
        <tbody>
          {Object.entries(getPowers()).map(([r, ceil]) => (
            <tr key={r}><td>{ROLE_LABEL[r]}</td><td className="num">{ceil === null ? 'Unlimited' : formatMoney(ceil)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Demand/payment advancement is blocked when the acting role's ceiling is below the document value.</p>
    </div>
  );
}

function HireUtilization({
  projectId, hire, onChange,
}: { projectId: string; hire: MachineryHire; onChange: () => void }) {
  const { provider } = useData();
  const [dated, setDated] = useState('2026-06-01');
  const [units, setUnits] = useState('');

  async function add() {
    const u = Number(units);
    if (!dated || !Number.isFinite(u) || u <= 0) return;
    await provider.addHireUtilization(projectId, hire.hireNo, { dated, units: u });
    setUnits('');
    onChange();
  }

  const chartData = hire.utilization.map((u) => ({ name: u.dated.slice(5), value: u.units }));

  return (
    <div className="card">
      <div className="section-head"><h3>{hire.hireNo} — utilization</h3>
        <span className="muted">{hire.utilization.reduce((a, u) => a + u.units, 0)} units logged</span>
      </div>
      <div className="create-row">
        <input aria-label="Utilization date" type="date" value={dated} onChange={(e) => setDated(e.target.value)} />
        <input aria-label="Utilization units" placeholder="Units (days/hours)" value={units} onChange={(e) => setUnits(e.target.value)} />
        <button className="btn" onClick={add}>Log utilization</button>
      </div>
      {hire.utilization.length === 0 ? (
        <p className="muted small">No utilization logged yet.</p>
      ) : (
        <>
          <CategoryBar title="Units over time" data={chartData} ariaLabel="Utilization chart" />
          <table className="data-table" aria-label="Utilization log">
            <thead><tr><th>Date</th><th className="num">Units</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {hire.utilization.map((u, i) => (
                <tr key={i}><td>{u.dated}</td><td className="num">{u.units}</td><td className="num">{formatMoney(u.units * hire.rate)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { TIMELINE } from '../../domain/scurve';
import type { OverheadLine, FinancialPayment, HrUnit, MachineryUsage, PolRecord } from '../../data/types';
import { deriveOverheadSubheads, subheadTotal } from '../../domain/overheadBooking';
import { nodeOwnHrMonthly } from '../../domain/hrrollup';
import { CURRENT_IDX } from '../../domain/scurve';

export function OverheadsTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [lines, setLines] = useState<OverheadLine[]>([]);
  const [payments, setPayments] = useState<FinancialPayment[]>([]);
  const [hrUnits, setHrUnits] = useState<HrUnit[]>([]);
  const [machinery, setMachinery] = useState<MachineryUsage[]>([]);
  const [pol, setPol] = useState<PolRecord[]>([]);
  const [category, setCategory] = useState('');
  const [month, setMonth] = useState(TIMELINE[9]);
  const [cost, setCost] = useState('');

  async function load() {
    const [o, p, u, m, pl] = await Promise.all([
      provider.listOverheads(projectId), provider.listPayments(projectId), provider.listHrUnits(projectId),
      provider.listMachineryUsage(projectId), provider.listPol(projectId),
    ]);
    setLines(o); setPayments(p); setHrUnits(u); setMachinery(m); setPol(pl);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  // Actual indirect cost booked = financial payments in the 'overhead' category, by month.
  const actualByMonth = new Map<string, number>();
  for (const p of payments) {
    if (p.category === 'overhead') actualByMonth.set(p.month, (actualByMonth.get(p.month) ?? 0) + p.amount);
  }
  const plannedByMonth = new Map<string, number>();
  for (const l of lines) plannedByMonth.set(l.month, (plannedByMonth.get(l.month) ?? 0) + l.plannedCost);

  // Manpower cost booked automatically from the HR establishment (req 3d(1)):
  // derived live per month — one HR record updates project cost with no re-entry.
  const hrMonthly = nodeOwnHrMonthly(hrUnits, projectId);
  const hrBookedMonths = CURRENT_IDX + 1; // months elapsed in the fixed timeline
  const plannedTotal = lines.reduce((s, l) => s + l.plannedCost, 0) + hrMonthly * hrBookedMonths;
  const actualTotal = [...actualByMonth.values()].reduce((s, v) => s + v, 0);

  // Overhead sub-head auto-booking (spec §6): vehicles, generators, their
  // maintenance and POL are derived from operational data — no re-entry.
  const derivedSubheads = deriveOverheadSubheads(machinery, pol);
  const derivedTotal = subheadTotal(derivedSubheads);

  async function add() {
    if (!category.trim() || !cost) return;
    setLines([...(await provider.upsertOverhead(projectId, { category: category.trim(), month, plannedCost: Number(cost) || 0 }))]);
    setCategory(''); setCost('');
  }
  async function remove(id: string) {
    setLines([...(await provider.deleteOverhead(projectId, id))]);
  }

  return (
    <div>
      <div className="section-head">
        <h3>Indirect cost / overheads</h3>
        <span className="muted">Planned {formatMoney(plannedTotal)} · Actual {formatMoney(actualTotal)}</span>
      </div>
      <p className="muted small">Planning Engineer enters planned indirect costs (salaries, light-vehicle POL, camp, etc.). Actuals are booked from the Financial tab (overhead-category payments).</p>

      <div className="card create-row">
        <input aria-label="Overhead category" placeholder="Category (e.g. Salaries)" value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <select aria-label="Overhead month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {TIMELINE.map((m) => (<option key={m} value={m}>{m}</option>))}
        </select>
        <input aria-label="Overhead planned cost" placeholder="Planned cost (PKR)" value={cost} onChange={(e) => setCost(e.target.value)} />
        <button className="btn" onClick={add}>Add line</button>
      </div>

      {derivedSubheads.length > 0 && (
        <div className="card" style={{ margin: '10px 0', padding: '8px 12px' }} aria-label="Overhead sub-head auto-booking">
          <strong className="small">Auto-booked overhead sub-heads</strong>
          <span className="muted small" style={{ marginLeft: 8 }}>derived from running logs & POL — {formatMoney(derivedTotal)}</span>
          <table className="data-table" style={{ marginTop: 6 }} aria-label="Derived overhead subheads">
            <thead><tr><th>Sub-head</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {derivedSubheads.map((b) => (
                <tr key={b.subhead}><td className="small">{b.subhead}</td><td className="num">{formatMoney(b.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hrMonthly > 0 && (
        <div className="card" style={{ margin: '10px 0', padding: '8px 12px' }} aria-label="HR manpower posting">
          <strong>Manpower (HR establishment)</strong>{' '}
          <span className="muted small">— booked automatically: {formatMoney(hrMonthly)}/month × {hrBookedMonths} months to date = <strong>{formatMoney(hrMonthly * hrBookedMonths)}</strong>. Derived from this project's establishment (held seats × pay band); update HR and it re-books with no re-entry.</span>
        </div>
      )}
      <table className="data-table" aria-label="Overhead lines">
        <thead><tr><th>Category</th><th>Month</th><th className="num">Planned</th><th></th></tr></thead>
        <tbody>
          {lines.length === 0 ? (
            <tr><td colSpan={4} className="muted">No overhead lines yet.</td></tr>
          ) : lines.map((l) => (
            <tr key={l.id}>
              <td>{l.category}</td>
              <td>{l.month}</td>
              <td className="num">{formatMoney(l.plannedCost)}</td>
              <td><button className="btn-ghost" aria-label={`Delete ${l.category}`} onClick={() => remove(l.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-head" style={{ marginTop: 16 }}><h3>Planned vs actual by month</h3></div>
      <table className="data-table" aria-label="Overhead planned vs actual">
        <thead><tr><th>Month</th><th className="num">Planned</th><th className="num">Actual</th><th className="num">Variance</th></tr></thead>
        <tbody>
          {TIMELINE.filter((m) => plannedByMonth.has(m) || actualByMonth.has(m)).map((m) => {
            const planned = plannedByMonth.get(m) ?? 0;
            const actual = actualByMonth.get(m) ?? 0;
            const variance = planned - actual;
            return (
              <tr key={m}>
                <td>{m}</td>
                <td className="num">{formatMoney(planned)}</td>
                <td className="num">{formatMoney(actual)}</td>
                <td className={`num ${variance < 0 ? 'neg' : 'pos'}`}>{formatMoney(variance)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><td>Total</td><td className="num">{formatMoney(plannedTotal)}</td><td className="num">{formatMoney(actualTotal)}</td><td className={`num ${plannedTotal - actualTotal < 0 ? 'neg' : 'pos'}`}>{formatMoney(plannedTotal - actualTotal)}</td></tr></tfoot>
      </table>
    </div>
  );
}

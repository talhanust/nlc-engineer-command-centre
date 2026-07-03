import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { TIMELINE } from '../../domain/scurve';
import type { OverheadLine, FinancialPayment, HrUnit } from '../../data/types';
import { nodeOwnHrMonthly } from '../../domain/hrrollup';
import { CURRENT_IDX } from '../../domain/scurve';

export function OverheadsTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [lines, setLines] = useState<OverheadLine[]>([]);
  const [payments, setPayments] = useState<FinancialPayment[]>([]);
  const [hrUnits, setHrUnits] = useState<HrUnit[]>([]);
  const [category, setCategory] = useState('');
  const [month, setMonth] = useState(TIMELINE[9]);
  const [cost, setCost] = useState('');

  async function load() {
    const [o, p, u] = await Promise.all([provider.listOverheads(projectId), provider.listPayments(projectId), provider.listHrUnits(projectId)]);
    setLines(o); setPayments(p); setHrUnits(u);
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

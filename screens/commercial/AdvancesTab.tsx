import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { downloadWorkbook } from '../../components/xlsxExport';
import { formatMoney } from '../../domain/money';
import type { Advance, Subcontractor } from '../../data/types';

const KIND_LABEL = { mob: 'Mobilization', secure: 'Secured' } as const;
const DIR_LABEL = { client_receipt: 'Client receipt', sub_disbursement: 'Sub disbursement' } as const;

export function AdvancesTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [kind, setKind] = useState<Advance['kind']>('mob');
  const [direction, setDirection] = useState<Advance['direction']>('client_receipt');
  const [subId, setSubId] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([provider.listAdvances(projectId), provider.listSubcontractors(projectId)]).then(([a, s]) => {
      if (!alive) return;
      setAdvances(a);
      setSubs(s);
    });
    return () => {
      alive = false;
    };
  }, [provider, projectId]);

  const subName = useMemo(() => {
    const m = new Map(subs.map((s) => [s.id, s.name]));
    return (id?: string) => (id ? m.get(id) ?? id : '—');
  }, [subs]);

  async function add() {
    const a = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(a) || a <= 0) return;
    const created = await provider.addAdvance(projectId, {
      kind,
      direction,
      subcontractorId: direction === 'sub_disbursement' ? subId || undefined : undefined,
      amount: a,
      dated: new Date().toISOString().slice(0, 10),
    });
    setAdvances((prev) => [...prev, created]);
    setAmount('');
  }

  return (
    <div>
      <div className="section-head">
        <h3>Advances</h3>
        <div className="head-tools">
          <span className="muted">{advances.length} entries</span>
          <button className="btn-ghost" disabled={advances.length === 0}
            onClick={() => void downloadWorkbook([{ name: 'Advances', aoa: [
              ['Date', 'Kind', 'Direction', 'Subcontractor', 'Amount'],
              ...advances.map((a) => [a.dated, KIND_LABEL[a.kind], DIR_LABEL[a.direction], subName(a.subcontractorId), Math.round(a.amount)]),
            ] }], `${projectId}-advances.xlsx`)}>Export Excel</button>
        </div>
      </div>
      <div className="card create-row">
        <select aria-label="Advance kind" value={kind} onChange={(e) => setKind(e.target.value as Advance['kind'])}>
          <option value="mob">Mobilization</option>
          <option value="secure">Secured</option>
        </select>
        <select aria-label="Advance direction" value={direction} onChange={(e) => setDirection(e.target.value as Advance['direction'])}>
          <option value="client_receipt">Client receipt</option>
          <option value="sub_disbursement">Sub disbursement</option>
        </select>
        {direction === 'sub_disbursement' && (
          <select aria-label="Advance subcontractor" value={subId} onChange={(e) => setSubId(e.target.value)}>
            <option value="">Select subcontractor</option>
            {subs.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        )}
        <input aria-label="Advance amount" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={add}>Record advance</button>
      </div>
      {advances.length === 0 ? (
        <p className="muted">No advances recorded.</p>
      ) : (
        <table className="data-table" aria-label="Advances">
          <thead><tr><th>Date</th><th>Kind</th><th>Direction</th><th>Subcontractor</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {advances.map((a) => (
              <tr key={a.id}>
                <td>{a.dated}</td>
                <td>{KIND_LABEL[a.kind]}</td>
                <td>{DIR_LABEL[a.direction]}</td>
                <td>{subName(a.subcontractorId)}</td>
                <td className="num">{formatMoney(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

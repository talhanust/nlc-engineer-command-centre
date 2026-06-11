import { useState } from 'react';
import { formatMoney } from '../../domain/money';
import { escalationAmount, type EscalationComponent } from '../../domain/escalation';

const DEFAULT_COMPONENTS: EscalationComponent[] = [
  { label: 'Steel', weight: 0.25, baseIndex: 100, currentIndex: 128 },
  { label: 'Cement', weight: 0.2, baseIndex: 100, currentIndex: 115 },
  { label: 'Fuel / bitumen', weight: 0.25, baseIndex: 100, currentIndex: 140 },
  { label: 'Labour', weight: 0.15, baseIndex: 100, currentIndex: 122 },
];

/** Price-adjustment calculator: weighted index escalation on the variable portion. */
export function EscalationCalculator({
  onAmount,
}: { onAmount?: (amount: number) => void }) {
  const [base, setBase] = useState('100000000');
  const [comps, setComps] = useState<EscalationComponent[]>(DEFAULT_COMPONENTS);

  const fixedPortion = 1 - comps.reduce((a, c) => a + c.weight, 0);
  const result = escalationAmount(Number(base.replace(/,/g, '')) || 0, fixedPortion, comps);

  function update(i: number, field: 'currentIndex' | 'baseIndex' | 'weight', value: string) {
    const n = Number(value);
    setComps((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: Number.isFinite(n) ? n : 0 } : c)));
  }

  return (
    <div className="card">
      <div className="section-head"><h3>Escalation calculator</h3>
        <span className="muted small">fixed (non-escalated) portion {(fixedPortion * 100).toFixed(0)}%</span>
      </div>
      <div className="create-row">
        <label className="small">Base amount (PKR){' '}
          <input aria-label="Escalation base" value={base} onChange={(e) => setBase(e.target.value)} />
        </label>
      </div>
      <table className="data-table" aria-label="Escalation components">
        <thead><tr><th>Component</th><th className="num">Weight</th><th className="num">Base idx</th><th className="num">Current idx</th><th className="num">Ratio</th><th className="num">Adjustment</th></tr></thead>
        <tbody>
          {result.lines.map((l, i) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="num"><input className="qty-input" aria-label={`Weight ${l.label}`} value={comps[i].weight} onChange={(e) => update(i, 'weight', e.target.value)} /></td>
              <td className="num"><input className="qty-input" aria-label={`Base index ${l.label}`} value={comps[i].baseIndex} onChange={(e) => update(i, 'baseIndex', e.target.value)} /></td>
              <td className="num"><input className="qty-input" aria-label={`Current index ${l.label}`} value={comps[i].currentIndex} onChange={(e) => update(i, 'currentIndex', e.target.value)} /></td>
              <td className="num">{l.ratio.toFixed(3)}</td>
              <td className="num">{formatMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Total escalation</td><td className="num" colSpan={4}>factor {(result.factor * 100).toFixed(2)}%</td><td className="num">{formatMoney(result.amount)}</td></tr>
        </tfoot>
      </table>
      {onAmount && (
        <div className="modal-actions">
          <button className="btn" onClick={() => onAmount(Math.round(result.amount))}>Use as EPC amount</button>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney, formatPct } from '../domain/money';
import type { RollupRow } from '../domain/rollup';

type SortKey = 'name' | 'contractValue' | 'actualPct' | 'slippage';

export function LeagueTable({ rows, projectIds, onDetails }: { rows: RollupRow[]; projectIds?: Set<string>; onDetails?: (id: string) => void }) {
  const navigate = useNavigate();
  const [key, setKey] = useState<SortKey>('slippage');
  const [asc, setAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return asc ? cmp : -cmp;
  });

  const head = (k: SortKey, label: string, num = false) => (
    <th
      className={`${num ? 'num ' : ''}sortable${key === k ? ' sorted' : ''}`}
      onClick={() => (key === k ? setAsc(!asc) : (setKey(k), setAsc(false)))}
    >
      {label}
      {key === k ? (asc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="card panel">
      <h3>League table</h3>
      <table className="data-table" aria-label="League table">
        <thead>
          <tr>
            {head('name', 'Name')}
            {head('contractValue', 'Contract', true)}
            {head('actualPct', 'Actual', true)}
            {head('slippage', 'Slippage', true)}
            {onDetails && <th aria-label="Details"></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="row-link" onClick={() => navigate(`/node/${r.id}`)}>
              <td>{r.name}</td>
              <td className="num">{formatMoney(r.contractValue)}</td>
              <td className="num">{formatPct(r.actualPct)}</td>
              <td className={`num ${r.slippage < 0 ? 'neg' : 'pos'}`}>
                {r.slippage >= 0 ? '+' : ''}
                {formatPct(r.slippage)}
              </td>
              {onDetails && (
                <td className="num">
                  {projectIds?.has(r.id) && (
                    <button
                      className="btn-ghost btn-mini"
                      aria-label={`Details for ${r.name}`}
                      onClick={(e) => { e.stopPropagation(); onDetails(r.id); }}
                    >Details</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

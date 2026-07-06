import { formatMoney } from '../domain/money';
import type { Aggregate } from '../domain/rollup';

// Billing funnel: Contract → Billed → Received. Each stage as a proportion of
// contract value. (The full IPC-stage pipeline funnel arrives with the
// Commercial tab in Phase 3; this is the value-flow view available now.)
export function BillingFunnel({ totals }: { totals: Aggregate }) {
  const base = totals.contractValue || 1;
  const stages = [
    { label: 'Contract value', value: totals.contractValue, cls: 'st-contract' },
    { label: 'Billed to date', value: totals.billed, cls: 'st-billed' },
    { label: 'Received', value: totals.received, cls: 'st-received' },
  ];
  return (
    <div className="card panel">
      <h3>Billing pipeline</h3>
      <div className="funnel">
        {stages.map((s) => {
          const pct = Math.max(0, Math.min(100, (s.value / base) * 100));
          return (
            <div className="funnel-row" key={s.label}>
              <div className="funnel-meta">
                <span>{s.label}</span>
                <span className="muted">{formatMoney(s.value)} · {pct.toFixed(0)}%</span>
              </div>
              <div className="funnel-track">
                <div className={`funnel-fill ${s.cls}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { DistributionDonut } from '../../components/CategoryCharts';
import type { BoqItem, Distribution, DistributionMode, Subcontractor } from '../../data/types';

export function DistributionsTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [items, setItems] = useState<BoqItem[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [dists, setDists] = useState<Record<string, Distribution>>({});

  useEffect(() => {
    let alive = true;
    Promise.all([
      provider.listBoq(projectId),
      provider.listSubcontractors(projectId),
      provider.listDistributions(projectId),
    ]).then(([b, s, d]) => {
      if (!alive) return;
      setItems(b);
      setSubs(s);
      setDists(Object.fromEntries(d.map((x) => [x.boqItemId, x])));
    });
    return () => {
      alive = false;
    };
  }, [provider, projectId]);

  async function update(item: BoqItem, patch: Partial<Distribution>) {
    const current: Distribution =
      dists[item.id] ?? { boqItemId: item.id, projectId, mode: 'unassigned', allocatedQty: 0 };
    const next: Distribution = { ...current, ...patch };
    setDists((prev) => ({ ...prev, [item.id]: next }));
    await provider.setDistribution(projectId, next);
  }

  const coverage = useMemo(() => {
    const total = items.length;
    const assigned = Object.values(dists).filter((d) => d.mode !== 'unassigned').length;
    return total ? Math.round((assigned / total) * 100) : 0;
  }, [items, dists]);

  return (
    <div>
      <div className="section-head">
        <h3>Distributions &amp; allocations</h3>
        <span className="muted">{coverage}% of items assigned</span>
      </div>
      {items.length > 0 && (() => {
        const counts = { Unassigned: 0, 'Self-execute': 0, Sublet: 0 };
        for (const it of items) {
          const m = dists[it.id]?.mode ?? 'unassigned';
          counts[m === 'self' ? 'Self-execute' : m === 'sublet' ? 'Sublet' : 'Unassigned']++;
        }
        const data = Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
        return data.length ? <DistributionDonut data={data} /> : null;
      })()}
      {items.length === 0 ? (
        <p className="muted">Import a BOQ first (Bill of Quantities tab).</p>
      ) : (
        <table className="data-table" aria-label="Distributions">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th className="num">Qty</th>
              <th>Mode</th>
              <th>Subcontractor</th>
              <th className="num">Allocated qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const d = dists[it.id];
              const mode: DistributionMode = d?.mode ?? 'unassigned';
              return (
                <tr key={it.id}>
                  <td>{it.code}</td>
                  <td>{it.description}</td>
                  <td className="num">{it.qty.toLocaleString('en-PK')}</td>
                  <td>
                    <select
                      aria-label={`Mode for ${it.code}`}
                      value={mode}
                      onChange={(e) => update(it, { mode: e.target.value as DistributionMode })}
                    >
                      <option value="unassigned">Unassigned</option>
                      <option value="self">Self-execute</option>
                      <option value="sublet">Sublet</option>
                    </select>
                  </td>
                  <td>
                    {mode === 'sublet' ? (
                      <select
                        aria-label={`Subcontractor for ${it.code}`}
                        value={d?.subcontractorId ?? ''}
                        onChange={(e) => update(it, { subcontractorId: e.target.value })}
                      >
                        <option value="">Select…</option>
                        {subs.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                      </select>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <td className="num">
                    {mode === 'sublet' ? (
                      <input
                        className="qty-input"
                        aria-label={`Allocated qty for ${it.code}`}
                        defaultValue={d?.allocatedQty || ''}
                        placeholder={String(it.qty)}
                        onBlur={(e) => update(it, { allocatedQty: Number(e.target.value) || 0 })}
                      />
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted small">Item amount basis: {formatMoney(items.reduce((a, i) => a + i.amount, 0))} total BOQ.</p>
    </div>
  );
}

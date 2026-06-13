import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import { hrByCategory, type HrTotals } from '../domain/hr';
import type { HrPosting } from '../data/types';

export function HrTab({ nodeId }: { nodeId: string }) {
  const { provider } = useData();
  const [hr, setHr] = useState<HrPosting[]>([]);
  const [category, setCategory] = useState('');
  const [sanctioned, setSanctioned] = useState('');
  const [posted, setPosted] = useState('');

  async function load() { setHr(await provider.listHr(nodeId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, nodeId]);

  const totals: HrTotals = hr.reduce((t, h) => ({ posted: t.posted + h.posted, sanctioned: t.sanctioned + h.sanctioned }), { posted: 0, sanctioned: 0 });
  const cats = hrByCategory(hr, [nodeId]);

  async function add() {
    if (!category.trim()) return;
    await provider.upsertHr(nodeId, { category: category.trim(), sanctioned: Number(sanctioned) || 0, posted: Number(posted) || 0 });
    setCategory(''); setSanctioned(''); setPosted(''); await load();
  }
  async function patch(h: HrPosting, p: Partial<HrPosting>) {
    await provider.upsertHr(nodeId, { ...h, ...p }); await load();
  }
  async function remove(id: string) { setHr(await provider.deleteHr(nodeId, id)); }

  const vacancy = totals.sanctioned - totals.posted;
  return (
    <div>
      <div className="section-head">
        <h3>Human resources</h3>
        <span className="muted">Posted {totals.posted} / {totals.sanctioned} sanctioned · {vacancy} vacant</span>
      </div>

      <div className="kpi-grid">
        {cats.map((c) => (
          <div className="kpi" key={c.category}><div className="kpi-label">{c.category}</div><div className="kpi-value">{c.posted}/{c.sanctioned}</div></div>
        ))}
      </div>

      <div className="card create-row" style={{ marginTop: 12 }}>
        <input aria-label="HR category" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <input aria-label="HR sanctioned" placeholder="Sanctioned" value={sanctioned} onChange={(e) => setSanctioned(e.target.value)} />
        <input aria-label="HR posted" placeholder="Posted" value={posted} onChange={(e) => setPosted(e.target.value)} />
        <button className="btn" onClick={add}>Add</button>
      </div>

      <table className="data-table" aria-label="HR postings">
        <thead><tr><th>Category</th><th className="num">Sanctioned</th><th className="num">Posted</th><th className="num">Vacancy</th><th></th></tr></thead>
        <tbody>
          {hr.length === 0 ? <tr><td colSpan={5} className="muted">No HR posted at this node.</td></tr> :
            hr.map((h) => (
              <tr key={h.id}>
                <td>{h.category}</td>
                <td className="num"><input className="qty-input" aria-label={`Sanctioned ${h.id}`} defaultValue={h.sanctioned} onBlur={(e) => patch(h, { sanctioned: Number(e.target.value) || 0 })} /></td>
                <td className="num"><input className="qty-input" aria-label={`Posted ${h.id}`} defaultValue={h.posted} onBlur={(e) => patch(h, { posted: Number(e.target.value) || 0 })} /></td>
                <td className={`num ${h.sanctioned - h.posted > 0 ? 'neg' : 'pos'}`}>{h.sanctioned - h.posted}</td>
                <td><button className="btn-ghost" aria-label={`Delete ${h.category}`} onClick={() => remove(h.id)}>✕</button></td>
              </tr>
            ))}
        </tbody>
        <tfoot><tr><td>Total</td><td className="num">{totals.sanctioned}</td><td className="num">{totals.posted}</td><td className={`num ${vacancy > 0 ? 'neg' : 'pos'}`}>{vacancy}</td><td></td></tr></tfoot>
      </table>
    </div>
  );
}

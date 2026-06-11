import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import type { Subcontractor } from '../../data/types';

export function SubcontractorsTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');

  useEffect(() => {
    let alive = true;
    provider.listSubcontractors(projectId).then((s) => alive && setSubs(s));
    return () => {
      alive = false;
    };
  }, [provider, projectId]);

  async function add() {
    if (!name.trim()) return;
    const s = await provider.addSubcontractor(projectId, { name: name.trim(), trade: trade.trim() });
    setSubs((prev) => [...prev, s]);
    setName('');
    setTrade('');
  }

  return (
    <div>
      <div className="section-head">
        <h3>Subcontractors</h3>
        <span className="muted">{subs.length} firms</span>
      </div>
      <div className="card create-row">
        <input aria-label="Subcontractor name" placeholder="Firm name" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Subcontractor trade" placeholder="Trade" value={trade} onChange={(e) => setTrade(e.target.value)} />
        <button className="btn" onClick={add}>Add subcontractor</button>
      </div>
      {subs.length === 0 ? (
        <p className="muted">No subcontractors yet.</p>
      ) : (
        <table className="data-table" aria-label="Subcontractors">
          <thead><tr><th>Name</th><th>Trade</th></tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}><td>{s.name}</td><td>{s.trade}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

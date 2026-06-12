import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import type { OrgNode } from '../data/types';

/** Create a project under a PD HQ. Defaults to `defaultPdHq` when launched from one. */
export function NewProjectModal({ defaultPdHq, onClose }: { defaultPdHq?: string; onClose: () => void }) {
  const { provider, nodes, refresh } = useData();
  const navigate = useNavigate();
  const pdHqs = nodes.filter((n: OrgNode) => n.type === 'pd_hq');
  const [pdHqId, setPdHqId] = useState(defaultPdHq ?? pdHqs[0]?.id ?? '');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [contract, setContract] = useState('');
  const [planned, setPlanned] = useState('0');
  const [actual, setActual] = useState('0');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !pdHqId || !contract.trim()) return;
    setBusy(true);
    try {
      const p = await provider.createProject({
        pdHqId, name: name.trim(), clientName: client.trim() || '—',
        contractValue: contract.replace(/,/g, ''), plannedPct: Number(planned) || 0, actualPct: Number(actual) || 0,
      });
      await refresh();
      onClose();
      navigate(`/node/${p.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label="New project" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New project</h3>
        <div className="create-row" style={{ marginTop: 8 }}>
          <label className="small">PD HQ{' '}
            <select aria-label="Project PD HQ" value={pdHqId} onChange={(e) => setPdHqId(e.target.value)}>
              {pdHqs.map((n) => (<option key={n.id} value={n.id}>{n.name}</option>))}
            </select>
          </label>
        </div>
        <div className="create-row" style={{ marginTop: 8 }}>
          <input aria-label="Project name" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <input aria-label="Project client" placeholder="Client (e.g. FGEHA)" value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div className="create-row" style={{ marginTop: 8 }}>
          <input aria-label="Project contract value" placeholder="Contract value (PKR)" value={contract} onChange={(e) => setContract(e.target.value)} />
          <label className="small">Planned %{' '}<input aria-label="Project planned pct" value={planned} onChange={(e) => setPlanned(e.target.value)} style={{ width: 70 }} /></label>
          <label className="small">Actual %{' '}<input aria-label="Project actual pct" value={actual} onChange={(e) => setActual(e.target.value)} style={{ width: 70 }} /></label>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || !name.trim() || !contract.trim()}>Create project</button>
        </div>
      </div>
    </div>
  );
}

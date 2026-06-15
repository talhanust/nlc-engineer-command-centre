import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { MapView } from './MapView';
import { reverseGeocode } from '../domain/geocode';
import { markerColorVar } from '../domain/geo';
import type { OrgNode } from '../data/types';

/** Create a project under a PD HQ. Defaults to `defaultPdHq` when launched from one. */
export function NewProjectModal({ defaultPdHq, onClose }: { defaultPdHq?: string; onClose: () => void }) {
  const { provider, nodes, refresh } = useData();
  const navigate = useNavigate();
  const pdHqs = nodes.filter((n: OrgNode) => n.type === 'pd_hq');
  const [pdHqId, setPdHqId] = useState(defaultPdHq ?? pdHqs[0]?.id ?? '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [client, setClient] = useState('');
  const [ca, setCa] = useState('');
  const [commence, setCommence] = useState('');
  const [complete, setComplete] = useState('');
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  async function onPick(lat: number, lng: number) {
    setPick({ lat, lng });
    const place = await reverseGeocode(lat, lng);
    if (place) setLocation(place);
  }

  async function submit() {
    if (!name.trim() || !pdHqId || !ca.trim()) return;
    setBusy(true);
    try {
      const p = await provider.createProject({
        pdHqId, name: name.trim(), clientName: client.trim() || '—',
        contractValue: ca.replace(/,/g, ''),
        projectCode: code.trim() || undefined,
        commencementDate: commence || undefined,
        completionDate: complete || undefined,
        lat: pick?.lat, lng: pick?.lng,
        location: location.trim() || undefined,
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

        <div className="form-section">
          <div className="form-section-label">Identity</div>
          <div className="create-row">
            <label className="small">PD HQ{' '}
              <select aria-label="Project PD HQ" value={pdHqId} onChange={(e) => setPdHqId(e.target.value)}>
                {pdHqs.map((n) => (<option key={n.id} value={n.id}>{n.name}</option>))}
              </select>
            </label>
            <input aria-label="Project code" placeholder="Project code" value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="create-row" style={{ marginTop: 8 }}>
            <input aria-label="Project name" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <input aria-label="Project client" placeholder="Client (optional, e.g. FGEHA)" value={client} onChange={(e) => setClient(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-label">Contract dates</div>
          <div className="create-row">
            <input aria-label="Project CA amount" placeholder="CA amount (PKR)" value={ca} onChange={(e) => setCa(e.target.value)} style={{ width: 200 }} />
            <label className="small">Date of commencement{' '}
              <input type="date" aria-label="Project commencement date" value={commence} onChange={(e) => setCommence(e.target.value)} />
            </label>
            <label className="small">Date of completion{' '}
              <input type="date" aria-label="Project completion date" value={complete} onChange={(e) => setComplete(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-label">Location</div>
          <div className="create-row">
            <input aria-label="Project location name" placeholder="Location (auto-fills from map)" value={location} onChange={(e) => setLocation(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <MapView
              title="Project location"
              ariaLabel="Project map"
              subtitle={pick ? `Pinned ${pick.lat.toFixed(4)}, ${pick.lng.toFixed(4)}` : 'Click the map to drop a pin'}
              height={240}
              picker
              pick={pick}
              onPick={onPick}
              markers={pick ? [{ id: 'pick', lat: pick.lat, lng: pick.lng, label: location || 'Selected site', color: markerColorVar('pick'), emphasis: true }] : []}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={busy || !name.trim() || !ca.trim()}>Create project</button>
        </div>
      </div>
    </div>
  );
}

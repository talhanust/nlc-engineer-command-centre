import { useState } from 'react';
import { useData } from '../data/DataContext';
import type { Project } from '../data/types';

/** Capture a project's location (place name + coordinates) for the map. */
export function LocationEditor({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const { provider } = useData();
  const [location, setLocation] = useState(project.location ?? '');
  const [lat, setLat] = useState(project.lat != null ? String(project.lat) : '');
  const [lng, setLng] = useState(project.lng != null ? String(project.lng) : '');
  const [saved, setSaved] = useState(false);

  async function save() {
    await provider.updateProject(project.id, {
      location: location.trim(),
      lat: lat.trim() === '' ? undefined : Number(lat),
      lng: lng.trim() === '' ? undefined : Number(lng),
    });
    setSaved(true);
    onSaved();
  }

  return (
    <div className="card">
      <h3>Location</h3>
      <p className="muted small">Place and coordinates plot this project on the portfolio map.</p>
      <div className="create-row">
        <input aria-label="Location name" placeholder="Place (e.g. Islamabad)" value={location} onChange={(e) => { setLocation(e.target.value); setSaved(false); }} style={{ flex: 1, minWidth: 160 }} />
      </div>
      <div className="create-row" style={{ marginTop: 8 }}>
        <label className="small">Lat{' '}<input aria-label="Latitude" placeholder="33.69" value={lat} onChange={(e) => { setLat(e.target.value); setSaved(false); }} style={{ width: 100 }} /></label>
        <label className="small">Lng{' '}<input aria-label="Longitude" placeholder="73.06" value={lng} onChange={(e) => { setLng(e.target.value); setSaved(false); }} style={{ width: 100 }} /></label>
        <button className="btn" onClick={save}>Save location</button>
        {saved && <span className="pos small" role="status">Saved.</span>}
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Tip: right-click a spot in Google Maps to copy its lat, lng.</p>
    </div>
  );
}

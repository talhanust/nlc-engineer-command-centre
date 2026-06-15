import { useState } from 'react';
import { useData } from '../data/DataContext';
import { MapView } from './MapView';
import { reverseGeocode } from '../domain/geocode';
import { markerColorVar, isValidLatLng } from '../domain/geo';
import type { OrgNode } from '../data/types';

/** Set an HQ / PD HQ map location (click the map or type coordinates). */
export function NodeLocationEditor({ node, onSaved }: { node: OrgNode; onSaved: () => void }) {
  const { provider } = useData();
  const [location, setLocation] = useState(node.location ?? '');
  const [lat, setLat] = useState(node.lat != null ? String(node.lat) : '');
  const [lng, setLng] = useState(node.lng != null ? String(node.lng) : '');
  const [saved, setSaved] = useState(false);

  const latN = Number(lat), lngN = Number(lng);
  const pick = isValidLatLng(latN, lngN) ? { lat: latN, lng: lngN } : null;

  async function onPick(plat: number, plng: number) {
    setLat(String(plat)); setLng(String(plng)); setSaved(false);
    const place = await reverseGeocode(plat, plng);
    if (place && !location.trim()) setLocation(place);
  }

  async function save() {
    await provider.updateNodeLocation(node.id, {
      location: location.trim(),
      lat: lat.trim() === '' ? undefined : Number(lat),
      lng: lng.trim() === '' ? undefined : Number(lng),
    });
    setSaved(true);
    onSaved();
  }

  const label = node.type === 'pd_hq' ? 'PD HQ location' : 'HQ location';
  return (
    <div className="card">
      <h3>{label}</h3>
      <p className="muted small">Click the map to place {node.name}, or type coordinates. This pins it on every level's map.</p>
      <MapView
        title={`Set ${node.name}`}
        ariaLabel="Node location picker map"
        height={220}
        picker
        pick={pick}
        onPick={onPick}
        markers={pick ? [{ id: node.id, lat: pick.lat, lng: pick.lng, label: location || node.name, color: markerColorVar(node.type), emphasis: true }] : []}
      />
      <div className="create-row" style={{ marginTop: 10 }}>
        <input aria-label="Node location name" placeholder="Place (e.g. Peshawar)" value={location} onChange={(e) => { setLocation(e.target.value); setSaved(false); }} style={{ flex: 1, minWidth: 160 }} />
      </div>
      <div className="create-row" style={{ marginTop: 8 }}>
        <label className="small">Lat{' '}<input aria-label="Node latitude" placeholder="34.01" value={lat} onChange={(e) => { setLat(e.target.value); setSaved(false); }} style={{ width: 100 }} /></label>
        <label className="small">Lng{' '}<input aria-label="Node longitude" placeholder="71.52" value={lng} onChange={(e) => { setLng(e.target.value); setSaved(false); }} style={{ width: 100 }} /></label>
        <button className="btn" onClick={save}>Save location</button>
        {saved && <span className="pos small" role="status">Saved.</span>}
      </div>
    </div>
  );
}

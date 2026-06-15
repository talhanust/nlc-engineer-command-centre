import { useState } from 'react';
import { useData } from '../data/DataContext';
import { MapView } from './MapView';
import { reverseGeocode } from '../domain/geocode';
import { markerColorVar, isValidLatLng } from '../domain/geo';
import type { Project } from '../data/types';

/** Capture a project's location (place name + coordinates) for the map. */
export function LocationEditor({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const { provider } = useData();
  const [location, setLocation] = useState(project.location ?? '');
  const [lat, setLat] = useState(project.lat != null ? String(project.lat) : '');
  const [lng, setLng] = useState(project.lng != null ? String(project.lng) : '');
  const [saved, setSaved] = useState(false);

  const latN = Number(lat), lngN = Number(lng);
  const pick = isValidLatLng(latN, lngN) ? { lat: latN, lng: lngN } : null;

  async function onPick(plat: number, plng: number) {
    setLat(String(plat)); setLng(String(plng)); setSaved(false);
    const place = await reverseGeocode(plat, plng);
    if (place && !location.trim()) setLocation(place);
  }

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
      <p className="muted small">Click the map to drop a pin (or type coordinates). This plots the project across every level's map.</p>
      <MapView
        title="Pick site"
        ariaLabel="Location picker map"
        height={220}
        picker
        pick={pick}
        onPick={onPick}
        markers={pick ? [{ id: project.id, lat: pick.lat, lng: pick.lng, label: location || project.id, color: markerColorVar('project'), emphasis: true }] : []}
      />
      <div className="create-row" style={{ marginTop: 10 }}>
        <input aria-label="Location name" placeholder="Place (e.g. Islamabad)" value={location} onChange={(e) => { setLocation(e.target.value); setSaved(false); }} style={{ flex: 1, minWidth: 160 }} />
      </div>
      <div className="create-row" style={{ marginTop: 8 }}>
        <label className="small">Lat{' '}<input aria-label="Latitude" placeholder="33.69" value={lat} onChange={(e) => { setLat(e.target.value); setSaved(false); }} style={{ width: 100 }} /></label>
        <label className="small">Lng{' '}<input aria-label="Longitude" placeholder="73.06" value={lng} onChange={(e) => { setLng(e.target.value); setSaved(false); }} style={{ width: 100 }} /></label>
        <button className="btn" onClick={save}>Save location</button>
        {saved && <span className="pos small" role="status">Saved.</span>}
      </div>
    </div>
  );
}

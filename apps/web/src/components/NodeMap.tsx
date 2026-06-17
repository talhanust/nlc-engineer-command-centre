import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView, type MapMarker } from './MapView';
import { Focusable } from './Focusable';
import { Dockable } from './Dock';
import { useData } from '../data/DataContext';
import { reverseGeocode } from '../domain/geocode';
import { nodeById, descendantNodes } from '../domain/org';
import { ragColorVar, markerColorVar, isValidLatLng } from '../domain/geo';
import type { OrgNode, Project } from '../data/types';

type MapFilter = 'all' | 'projects' | 'sites';
const FILTERS: { value: MapFilter; label: string }[] = [
  { value: 'all', label: 'HQ + projects' },
  { value: 'projects', label: 'Projects only' },
  { value: 'sites', label: 'HQ / PD HQ only' },
];
type StatusFilter = 'all' | 'green' | 'amber' | 'red';
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'green', label: 'On track' },
  { value: 'amber', label: 'At risk' },
  { value: 'red', label: 'Behind' },
];
const ragBucket = (color: string): StatusFilter =>
  color.includes('green') ? 'green' : color.includes('amber') ? 'amber' : 'red';
const STATUS_TEXT: Record<string, string> = { green: 'On track', amber: 'At risk', red: 'Behind' };

const Legend = ({ filter }: { filter: MapFilter }) => (
  <div className="map-legend small muted" role="note">
    {filter !== 'projects' && <span><i className="lg-dot lg-sq" style={{ background: 'var(--command)' }} /> HQ</span>}
    {filter !== 'projects' && <span><i className="lg-dot lg-sq" style={{ background: 'var(--signal)' }} /> PD HQ</span>}
    {filter !== 'sites' && <><span><i className="lg-dot" style={{ background: 'var(--rag-green)' }} /> On track</span>
      <span><i className="lg-dot" style={{ background: 'var(--rag-amber)' }} /> At risk</span>
      <span><i className="lg-dot" style={{ background: 'var(--rag-red)' }} /> Behind</span></>}
  </div>
);

/**
 * The single map shown at every level. It plots the level's locations (HQ / PD
 * HQs / project sites, filterable) AND doubles as the location picker for the
 * current node or project: switch to "Set location", click the map or type
 * coordinates, then save. One map, no duplication.
 */
export function NodeMap({
  nodeId, nodes, projects, onSaved, height = 360, hero = false,
}: { nodeId: string; nodes: OrgNode[]; projects: Project[]; onSaved: () => void; height?: number; hero?: boolean }) {
  const { provider } = useData();
  const navigate = useNavigate();
  const node = nodeById(nodes, nodeId);
  const project = node?.type === 'project' ? projects.find((p) => p.id === nodeId) : undefined;
  const subject = project ?? node; // the thing whose location we set

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [filter, setFilter] = useState<MapFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [location, setLocation] = useState(subject?.location ?? '');
  const [lat, setLat] = useState(subject?.lat != null ? String(subject.lat) : '');
  const [lng, setLng] = useState(subject?.lng != null ? String(subject.lng) : '');
  const [saved, setSaved] = useState(false);

  const hasDescendants = node ? node.type !== 'project' && descendantNodes(nodes, nodeId).length > 0 : false;
  const latN = Number(lat), lngN = Number(lng);
  const pick = isValidLatLng(latN, lngN) ? { lat: latN, lng: lngN } : null;
  const editing = mode === 'edit';

  async function onPick(plat: number, plng: number) {
    setLat(String(plat)); setLng(String(plng)); setSaved(false);
    const place = await reverseGeocode(plat, plng);
    if (place && !location.trim()) setLocation(place);
  }

  async function save() {
    const patch = {
      location: location.trim(),
      lat: lat.trim() === '' ? undefined : Number(lat),
      lng: lng.trim() === '' ? undefined : Number(lng),
    };
    if (project) await provider.updateProject(project.id, patch);
    else await provider.updateNodeLocation(nodeId, patch);
    setSaved(true);
    onSaved();
  }

  const markers = useMemo<MapMarker[]>(() => {
    if (!node) return [];
    const projById = new Map(projects.map((p) => [p.id, p]));
    const out: MapMarker[] = [];
    const showSites = filter !== 'projects';
    const showProjects = filter !== 'sites';

    // The current node/PD HQ marker (in view mode; in edit mode the pick pin shows it).
    if (!editing && showSites && node.type !== 'project' && isValidLatLng(node.lat, node.lng)) {
      out.push({
        id: node.id, lat: node.lat!, lng: node.lng!,
        label: node.name,
        color: markerColorVar(node.type), emphasis: true, glyph: 'building',
        detail: [['Type', node.type === 'pd_hq' ? 'PD HQ' : 'HQ'], ...(node.location ? [['Location', node.location] as [string, string]] : []), ['Note', 'You are here']],
      });
    }

    const subtree = node.type === 'project' ? [] : descendantNodes(nodes, nodeId);
    for (const d of subtree) {
      if (d.type === 'pd_hq' && showSites && isValidLatLng(d.lat, d.lng)) {
        out.push({
          id: d.id, lat: d.lat!, lng: d.lng!,
          label: d.name,
          color: markerColorVar('pd_hq'), emphasis: true, glyph: 'building',
          detail: [['Type', 'PD HQ'], ...(d.location ? [['Location', d.location] as [string, string]] : [])],
          openLabel: 'Open PD HQ ›',
          onClick: editing ? undefined : () => navigate(`/node/${d.id}`),
        });
      }
      if (d.type === 'project' && showProjects) {
        const p = projById.get(d.id);
        if (p && isValidLatLng(p.lat, p.lng)) {
          const color = ragColorVar(p.actualPct, p.plannedPct);
          const bucket = ragBucket(color);
          if (status === 'all' || bucket === status) {
            out.push({
              id: p.id, lat: p.lat!, lng: p.lng!,
              label: d.name,
              color, glyph: 'dot',
              detail: [
                ['Status', STATUS_TEXT[bucket]],
                ['Actual', `${p.actualPct}%`],
                ['Planned', `${p.plannedPct}%`],
                ...(p.clientName ? [['Client', p.clientName] as [string, string]] : []),
                ...(p.location ? [['Location', p.location] as [string, string]] : []),
              ],
              openLabel: 'Open project ›',
              onClick: editing ? undefined : () => navigate(`/node/${p.id}`),
            });
          }
        }
      }
    }

    // A project's own site (view mode).
    if (!editing && node.type === 'project' && showProjects) {
      const p = projById.get(node.id);
      if (p && isValidLatLng(p.lat, p.lng)) {
        const color = ragColorVar(p.actualPct, p.plannedPct);
        out.push({
          id: p.id, lat: p.lat!, lng: p.lng!,
          label: node.name,
          color, emphasis: true, glyph: 'dot',
          detail: [
            ['Status', STATUS_TEXT[ragBucket(color)]],
            ['Actual', `${p.actualPct}%`],
            ['Planned', `${p.plannedPct}%`],
            ...(p.clientName ? [['Client', p.clientName] as [string, string]] : []),
            ...(p.location ? [['Location', p.location] as [string, string]] : []),
          ],
        });
      }
    }
    return out;
  }, [node, nodes, projects, nodeId, navigate, filter, status, editing]);

  const titleByType: Record<string, string> = {
    hq: 'Command map — HQ, PD HQs & project sites',
    hq_engrs: 'Command map — PD HQs & project sites',
    pd_hq: 'PD HQ & project sites',
    project: 'Project location',
  };
  const title = titleByType[node?.type ?? 'project'] ?? 'Map';
  const subjectLabel = project ? 'project' : (node?.type === 'pd_hq' ? 'PD HQ' : 'HQ');

  const controls = (
    <span className="map-controls no-print">
      {!editing && <span className="map-count small muted">{markers.length} shown</span>}
      {hasDescendants && (
        <select aria-label="Map filter" className="map-filter" value={filter} onChange={(e) => setFilter(e.target.value as MapFilter)}>
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      )}
      {hasDescendants && filter !== 'sites' && (
        <select aria-label="Status filter" className="map-filter" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      )}
      <span className="seg" role="group" aria-label="Map mode">
        <button className={`seg-btn${mode === 'view' ? ' active' : ''}`} onClick={() => setMode('view')}>Overview</button>
        <button className={`seg-btn${mode === 'edit' ? ' active' : ''}`} onClick={() => setMode('edit')}>Set location</button>
      </span>
    </span>
  );

  const footer = (
    <>
      <Legend filter={filter} />
      {editing && (
        <div className="map-edit-row">
          <p className="muted small" style={{ width: '100%', margin: '0 0 4px' }}>Click the map to place {node?.name ?? `this ${subjectLabel}`}, or type coordinates.</p>
          <input aria-label="Location name" placeholder="Place (e.g. Islamabad)" value={location} onChange={(e) => { setLocation(e.target.value); setSaved(false); }} style={{ flex: 1, minWidth: 150 }} />
          <label className="field-inline">Lat <input aria-label="Latitude" placeholder="33.69" value={lat} onChange={(e) => { setLat(e.target.value); setSaved(false); }} style={{ width: 90 }} /></label>
          <label className="field-inline">Lng <input aria-label="Longitude" placeholder="73.06" value={lng} onChange={(e) => { setLng(e.target.value); setSaved(false); }} style={{ width: 90 }} /></label>
          <button className="btn" onClick={save}>Save location</button>
          {saved && <span className="pos small" role="status">Saved.</span>}
        </div>
      )}
    </>
  );

  return (
    <div className={hero ? 'level-map-hero' : undefined}>
      <Dockable title={title}>
        {() => (
          <Focusable title={title} label={`Open ${title} full screen`}>
            {(big) => (
              <MapView
                title={title}
                ariaLabel="Project map"
                markers={markers}
                picker={editing}
                pick={editing ? pick : null}
                onPick={onPick}
                controls={controls}
                footer={footer}
                height={big ? Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) - 170) : (hero ? Math.max(height, 460) : height)}
                interactiveZoom={big || editing}
              />
            )}
          </Focusable>
        )}
      </Dockable>
    </div>
  );
}

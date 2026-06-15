import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { ChartCard } from './chartUtils';
import { useUiState, type Basemap } from '../state/UiState';
import {
  PK_BBOX, PK_OUTLINE, PK_CITIES, PK_CENTER, PK_DEFAULT_ZOOM,
  projectToXY, isValidLatLng,
} from '../domain/geo';

export type MarkerGlyph = 'building' | 'dot';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;        // CSS-var colour string, e.g. 'var(--signal)'
  emphasis?: boolean;   // larger pin for org HQs vs project sites
  glyph?: MarkerGlyph;  // building tile for HQ/PD HQ, dot for project sites
  onClick?: () => void;
}

interface MapViewProps {
  markers?: MapMarker[];
  title?: string;
  subtitle?: string;
  ariaLabel?: string;
  height?: number;
  picker?: boolean;
  pick?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  legend?: React.ReactNode;
  interactiveZoom?: boolean;
}

const HEADLESS =
  typeof window === 'undefined' ||
  (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent));

// Leaflet + OpenStreetMap basemaps — all free, no API key. OSM is the canonical
// street map; the CARTO styles are calmer, theme-matched OSM-data renderings.
interface TileDef { url: string; attr: string; subdomains?: string; }
const BASEMAPS: Record<Exclude<Basemap, 'auto'>, TileDef> = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; OpenStreetMap contributors',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: 'abcd',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: 'abcd',
  },
};
function resolveBasemap(pref: Basemap, theme: 'light' | 'dark'): Exclude<Basemap, 'auto'> {
  if (pref === 'auto') return theme === 'dark' ? 'dark' : 'light';
  return pref;
}

function resolveColor(cssVar: string): string {
  if (typeof document === 'undefined') return '#E87722';
  const name = cssVar.replace(/var\(|\)/g, '').trim();
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || '#E87722';
}

function pinHtml(color: string, glyph: MarkerGlyph, emphasis?: boolean): string {
  if (glyph === 'building') {
    const s = emphasis ? 28 : 24;
    return `<span class="map-pin map-pin-building" style="--pin:${color};width:${s}px;height:${s}px">
      <svg viewBox="0 0 24 24" width="${s * 0.62}" height="${s * 0.62}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h0M9 13h0M9 17h0M15 9h0M15 13h0M15 17h0"/>
      </svg></span>`;
  }
  const r = emphasis ? 9 : 7;
  return `<span class="map-pin map-pin-dot" style="--pin:${color};width:${r * 2}px;height:${r * 2}px"></span>`;
}

/**
 * Map surface used at every level and as a location picker. Leaflet + free
 * OpenStreetMap/CARTO tiles (no key), theme-matched, with a basemap switcher.
 * Falls back to an offline Pakistan locator when no real DOM/network exists.
 */
export function MapView({
  markers = [], title = 'Map', subtitle, ariaLabel = 'Project map',
  height = 320, picker = false, pick = null, onPick, legend, interactiveZoom = false,
}: MapViewProps) {
  const { theme, basemap, setBasemap } = useUiState();
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerLayerRef = useRef<unknown>(null);
  const pickLayerRef = useRef<unknown>(null);
  const tileLayerRef = useRef<unknown>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (HEADLESS || !ref.current) return;
    let disposed = false;
    let map: import('leaflet').Map | null = null;

    void (async () => {
      const L = await import('leaflet');
      if (disposed || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: interactiveZoom, zoomControl: true }).setView(PK_CENTER, PK_DEFAULT_ZOOM);
      const def = BASEMAPS[resolveBasemap(basemap, theme)];
      tileLayerRef.current = L.tileLayer(def.url, { attribution: def.attr, subdomains: def.subdomains ?? 'abc', maxZoom: 19 }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      pickLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      if (picker) {
        map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
          onPickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
        });
      }
      setTimeout(() => map && map.invalidateSize(), 0);
      syncMarkers(L, map);
      syncPick(L, map);
    })();

    return () => {
      disposed = true;
      if (map) map.remove();
      mapRef.current = null; markerLayerRef.current = null;
      pickLayerRef.current = null; tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, interactiveZoom]);

  // Swap tiles when the chosen basemap or theme changes.
  useEffect(() => {
    if (HEADLESS) return;
    const layer = tileLayerRef.current as import('leaflet').TileLayer | null;
    if (!layer) return;
    const def = BASEMAPS[resolveBasemap(basemap, theme)];
    layer.setUrl(def.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, theme]);

  function syncMarkers(L: typeof import('leaflet'), map: import('leaflet').Map) {
    const layer = markerLayerRef.current as import('leaflet').LayerGroup | null;
    if (!layer) return;
    layer.clearLayers();
    const valid = markers.filter((m) => isValidLatLng(m.lat, m.lng));
    for (const m of valid) {
      const color = resolveColor(m.color);
      const glyph: MarkerGlyph = m.glyph ?? 'dot';
      const size = glyph === 'building' ? (m.emphasis ? 28 : 24) : (m.emphasis ? 18 : 14);
      const icon = L.divIcon({
        className: 'map-pin-icon', html: pinHtml(color, glyph, m.emphasis),
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const mk = L.marker([m.lat, m.lng], { icon, title: m.label, riseOnHover: true }).addTo(layer);
      mk.bindTooltip(m.label, { direction: 'top', offset: [0, -size / 2] });
      if (m.onClick) mk.on('click', () => m.onClick!());
    }
    if (valid.length > 0) {
      const bounds = L.latLngBounds(valid.map((m) => [m.lat, m.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.35), { maxZoom: 13 });
    }
  }

  function syncPick(L: typeof import('leaflet'), map: import('leaflet').Map) {
    const layer = pickLayerRef.current as import('leaflet').LayerGroup | null;
    if (!layer) return;
    layer.clearLayers();
    if (pick && isValidLatLng(pick.lat, pick.lng)) {
      const icon = L.divIcon({
        className: 'map-pin-icon',
        html: '<span class="map-pin map-pin-pick" style="--pin:var(--primary)"></span>',
        iconSize: [24, 24], iconAnchor: [12, 12],
      });
      L.marker([pick.lat, pick.lng], { icon }).addTo(layer);
      map.setView([pick.lat, pick.lng], Math.max(map.getZoom(), 11));
    }
  }

  useEffect(() => {
    if (HEADLESS) return;
    const map = mapRef.current as import('leaflet').Map | null;
    if (!map) return;
    void (async () => { const L = await import('leaflet'); syncMarkers(L, map); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers.map((m) => [m.id, m.lat, m.lng, m.color, m.emphasis, m.glyph]))]);

  useEffect(() => {
    if (HEADLESS) return;
    const map = mapRef.current as import('leaflet').Map | null;
    if (!map) return;
    void (async () => { const L = await import('leaflet'); syncPick(L, map); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick?.lat, pick?.lng]);

  const located = markers.filter((m) => isValidLatLng(m.lat, m.lng));
  const sub = subtitle ?? `${located.length} located${picker ? ' · click map to set' : ''}`;

  const basemapSelect = (
    <label className="basemap-select small no-print" title="Basemap">
      <span className="sr-only">Basemap</span>
      <select aria-label="Basemap" value={basemap} onChange={(e) => setBasemap(e.target.value as Basemap)}>
        <option value="auto">Auto (theme)</option>
        <option value="osm">OpenStreetMap</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );

  return (
    <ChartCard title={title} subtitle={sub} ariaLabel={ariaLabel} headerExtra={<>{legend}{basemapSelect}</>}>
      {HEADLESS ? (
        <OfflineLocator markers={located} pick={pick} height={height} />
      ) : (
        <div ref={ref} className="leaflet-host" style={{ width: '100%', height, borderRadius: 'var(--r-sm)', overflow: 'hidden' }} aria-hidden="true" />
      )}
    </ChartCard>
  );
}

// --- Offline SVG locator (tests / no-network fallback) ---------------------
const W = 460;
const H = Math.round((W * (PK_BBOX.lat1 - PK_BBOX.lat0)) / (PK_BBOX.lng1 - PK_BBOX.lng0));

function OfflineLocator({
  markers, pick, height,
}: { markers: MapMarker[]; pick: { lat: number; lng: number } | null; height: number }) {
  const outline = PK_OUTLINE
    .map(([la, ln], i) => `${i === 0 ? 'M' : 'L'}${projectToXY(la, ln, W, H).map((n) => n.toFixed(1)).join(',')}`)
    .join(' ') + ' Z';
  return (
    <div style={{ width: '100%', maxWidth: 560 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" aria-label="Pakistan locations">
        <path d={outline} fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth={1.2} />
        {PK_CITIES.map((c) => {
          const [x, y] = projectToXY(c.lat, c.lng, W, H);
          return (
            <g key={c.name}>
              <circle cx={x} cy={y} r={1.8} fill="var(--muted)" />
              <text x={x + 4} y={y + 3} fontSize={8} fill="var(--muted)">{c.name}</text>
            </g>
          );
        })}
        {markers.map((m) => {
          const [x, y] = projectToXY(m.lat, m.lng, W, H);
          if ((m.glyph ?? 'dot') === 'building') {
            const s = m.emphasis ? 9 : 8;
            return (
              <g key={m.id} style={{ cursor: m.onClick ? 'pointer' : 'default' }} onClick={() => m.onClick?.()}>
                <rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx={1.5} fill={m.color} stroke="#fff" strokeWidth={1}>
                  <title>{m.label}</title>
                </rect>
              </g>
            );
          }
          return (
            <g key={m.id} style={{ cursor: m.onClick ? 'pointer' : 'default' }} onClick={() => m.onClick?.()}>
              <circle cx={x} cy={y} r={m.emphasis ? 7 : 6} fill={m.color} opacity={0.25} />
              <circle cx={x} cy={y} r={m.emphasis ? 4 : 3} fill={m.color} stroke="#fff" strokeWidth={1}>
                <title>{m.label}</title>
              </circle>
            </g>
          );
        })}
        {pick && isValidLatLng(pick.lat, pick.lng) && (() => {
          const [x, y] = projectToXY(pick.lat, pick.lng, W, H);
          return <circle cx={x} cy={y} r={4} fill="var(--primary)" stroke="#fff" strokeWidth={1.5} />;
        })()}
      </svg>
    </div>
  );
}

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { DEFAULT_RAG } from '../domain/rollup';
import type { Rag } from '../domain/rollup';

export interface RagThresholds {
  amberAt: number;
  redAt: number;
}
export interface Filter {
  search: string;
  client: string; // 'all' or a client name
  rag: Rag | 'all';
}

export const EMPTY_FILTER: Filter = { search: '', client: 'all', rag: 'all' };

export type ThemeName = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
export type Basemap = 'auto' | 'osm' | 'light' | 'dark';

/** A saveable snapshot of the workspace chrome (for named layouts). */
export interface LayoutSnapshot {
  sidebarOpen: boolean;
  sidebarWidth: number;
  zoom: number;
  density: Density;
  theme: ThemeName;
}

/** A saved map view: filter + status + basemap, recallable by name. */
export interface MapViewPref {
  id: string;
  name: string;
  filter: string;
  status: string;
  basemap: Basemap;
}

interface UiState {
  rag: RagThresholds;
  setRag: (r: RagThresholds) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  filterActive: boolean;
  // Workspace layout prefs (persisted).
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  zoom: number;
  setZoom: (z: number) => void;
  density: Density;
  setDensity: (d: Density) => void;
  basemap: Basemap;
  setBasemap: (b: Basemap) => void;
  presentation: boolean;
  setPresentation: (v: boolean) => void;
  lastNode: string | null;
  setLastNode: (id: string) => void;
  // Named layouts.
  snapshotLayout: () => LayoutSnapshot;
  applyLayout: (s: LayoutSnapshot) => void;
  // Saved map views.
  mapViews: MapViewPref[];
  saveMapView: (name: string, v: Omit<MapViewPref, 'id' | 'name'>) => void;
  deleteMapView: (id: string) => void;
}

const RAG_KEY = 'nlc-ecc.ragThresholds';
const WS_KEY = 'nlc-ecc.workspace';
const MAPVIEWS_KEY = 'nlc-ecc.mapviews';
const Ctx = createContext<UiState | null>(null);

function loadMapViews(): MapViewPref[] {
  try {
    const raw = localStorage.getItem(MAPVIEWS_KEY);
    if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v as MapViewPref[]; }
  } catch { /* ignore */ }
  return [];
}

function loadRag(): RagThresholds {
  try {
    const raw = localStorage.getItem(RAG_KEY);
    if (raw) return JSON.parse(raw) as RagThresholds;
  } catch { /* ignore */ }
  return { ...DEFAULT_RAG };
}

interface Workspace {
  theme: ThemeName;
  sidebarOpen: boolean;
  sidebarWidth: number;
  zoom: number;
  density: Density;
  basemap: Basemap;
  lastNode: string | null;
}
const DEFAULT_WS: Workspace = {
  theme: 'light', sidebarOpen: true, sidebarWidth: 270, zoom: 1,
  density: 'comfortable', basemap: 'auto', lastNode: null,
};
const clampZoom = (z: number) => Math.min(1.4, Math.max(0.8, Math.round(z * 100) / 100));
const clampWidth = (w: number) => Math.min(440, Math.max(200, Math.round(w)));

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WS_KEY);
    if (raw) {
      const w = JSON.parse(raw) as Partial<Workspace>;
      return {
        theme: w.theme === 'dark' ? 'dark' : 'light',
        sidebarOpen: w.sidebarOpen ?? true,
        sidebarWidth: clampWidth(w.sidebarWidth ?? 270),
        zoom: clampZoom(w.zoom ?? 1),
        density: w.density === 'compact' ? 'compact' : 'comfortable',
        basemap: (['auto', 'osm', 'light', 'dark'] as const).includes(w.basemap as Basemap) ? (w.basemap as Basemap) : 'auto',
        lastNode: typeof w.lastNode === 'string' ? w.lastNode : null,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_WS };
}

export function UiStateProvider({ children }: { children: ReactNode }) {
  const [rag, setRagState] = useState<RagThresholds>(loadRag);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [ws, setWs] = useState<Workspace>(loadWorkspace);
  const [presentation, setPresentation] = useState(false); // session-only
  const [mapViews, setMapViews] = useState<MapViewPref[]>(loadMapViews);

  useEffect(() => {
    try { localStorage.setItem(RAG_KEY, JSON.stringify(rag)); } catch { /* ignore */ }
  }, [rag]);

  useEffect(() => {
    try { localStorage.setItem(MAPVIEWS_KEY, JSON.stringify(mapViews)); } catch { /* ignore */ }
  }, [mapViews]);

  useEffect(() => {
    try { localStorage.setItem(WS_KEY, JSON.stringify(ws)); } catch { /* ignore */ }
  }, [ws]);

  const filterActive =
    filter.search.trim() !== '' || filter.client !== 'all' || filter.rag !== 'all';

  const value: UiState = {
    rag, setRag: setRagState, filter, setFilter, filterActive,
    theme: ws.theme,
    setTheme: (t) => setWs((w) => ({ ...w, theme: t })),
    sidebarOpen: ws.sidebarOpen,
    toggleSidebar: () => setWs((w) => ({ ...w, sidebarOpen: !w.sidebarOpen })),
    sidebarWidth: ws.sidebarWidth,
    setSidebarWidth: (px) => setWs((w) => ({ ...w, sidebarWidth: clampWidth(px) })),
    zoom: ws.zoom,
    setZoom: (z) => setWs((w) => ({ ...w, zoom: clampZoom(z) })),
    density: ws.density,
    setDensity: (d) => setWs((w) => ({ ...w, density: d })),
    basemap: ws.basemap,
    setBasemap: (b) => setWs((w) => ({ ...w, basemap: b })),
    presentation,
    setPresentation,
    lastNode: ws.lastNode,
    setLastNode: (id) => setWs((w) => (w.lastNode === id ? w : { ...w, lastNode: id })),
    snapshotLayout: () => ({
      sidebarOpen: ws.sidebarOpen, sidebarWidth: ws.sidebarWidth,
      zoom: ws.zoom, density: ws.density, theme: ws.theme,
    }),
    applyLayout: (s) => setWs((w) => ({
      ...w,
      sidebarOpen: s.sidebarOpen, sidebarWidth: clampWidth(s.sidebarWidth),
      zoom: clampZoom(s.zoom), density: s.density, theme: s.theme,
    })),
    mapViews,
    saveMapView: (name, v) => setMapViews((list) => [
      ...list.filter((x) => x.name !== name),
      { ...v, id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name },
    ]),
    deleteMapView: (id) => setMapViews((list) => list.filter((x) => x.id !== id)),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUiState(): UiState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUiState must be used within UiStateProvider');
  return v;
}

// Pure geography helpers shared by the offline SVG locator and the Leaflet map.
// Kept dependency-free so it unit-tests without a DOM.

/** Pakistan bounding box (approx) for a simple equirectangular projection. */
export const PK_BBOX = { lng0: 60.5, lng1: 78.0, lat0: 23.4, lat1: 37.3 } as const;

/** Reasonable default map view (Islamabad-ish) when nothing is located yet. */
export const PK_CENTER: [number, number] = [30.3753, 69.3451];
export const PK_DEFAULT_ZOOM = 5;

/** Project a lat/lng into an SVG box of the given width/height (offline locator). */
export function projectToXY(lat: number, lng: number, w: number, h: number): [number, number] {
  const { lng0, lng1, lat0, lat1 } = PK_BBOX;
  const x = ((lng - lng0) / (lng1 - lng0)) * w;
  const y = ((lat1 - lat) / (lat1 - lat0)) * h;
  return [x, y];
}

/** Coarse Pakistan outline (lat,lng vertices) — a recognisable locator, not survey-grade. */
export const PK_OUTLINE: Array<[number, number]> = [
  [37.0, 74.6], [36.7, 71.2], [35.0, 71.6], [34.1, 70.0], [33.0, 70.1], [31.3, 69.3],
  [30.4, 66.3], [29.4, 64.1], [28.0, 62.4], [25.8, 61.7], [25.0, 61.6], [24.6, 64.5],
  [23.7, 67.5], [24.3, 68.9], [25.7, 70.2], [27.7, 70.6], [28.8, 72.0], [30.0, 74.0],
  [31.1, 74.6], [32.5, 74.7], [33.8, 74.2], [35.5, 76.8], [36.8, 76.3], [37.0, 74.6],
];

export const PK_CITIES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Islamabad', lat: 33.69, lng: 73.06 },
  { name: 'Lahore', lat: 31.55, lng: 74.34 },
  { name: 'Karachi', lat: 24.86, lng: 67.0 },
  { name: 'Peshawar', lat: 34.0, lng: 71.5 },
  { name: 'Quetta', lat: 30.18, lng: 66.99 },
  { name: 'Gwadar', lat: 25.13, lng: 62.32 },
];

/** RAG colour (CSS var) for a project's schedule slippage = actual − planned. */
export function ragColorVar(actualPct: number, plannedPct: number): string {
  const slip = actualPct - plannedPct;
  if (slip <= -10) return 'var(--rag-red)';
  if (slip < -3) return 'var(--rag-amber)';
  return 'var(--rag-green)';
}

/** Marker tint per org level so HQ / PD HQ / project read distinctly on the map. */
export function markerColorVar(kind: 'hq' | 'hq_engrs' | 'pd_hq' | 'project' | 'pick'): string {
  switch (kind) {
    case 'hq':
    case 'hq_engrs': return 'var(--command)';
    case 'pd_hq': return 'var(--signal)';
    case 'pick': return 'var(--primary)';
    default: return 'var(--primary)';
  }
}

/** Validate a lat/lng pair (numbers within Earth ranges). */
export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

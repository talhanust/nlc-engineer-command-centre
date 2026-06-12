import { useNavigate } from 'react-router-dom';
import { ChartCard } from './chartUtils';
import type { Project } from '../data/types';

// Pakistan bounding box (approx) for an equirectangular projection.
const LNG0 = 60.5, LNG1 = 78.0, LAT0 = 23.4, LAT1 = 37.3;
const W = 460, H = Math.round((W * (LAT1 - LAT0)) / (LNG1 - LNG0));

function project(lat: number, lng: number): [number, number] {
  const x = ((lng - LNG0) / (LNG1 - LNG0)) * W;
  const y = ((LAT1 - lat) / (LAT1 - LAT0)) * H;
  return [x, y];
}

// Coarse Pakistan outline (lat,lng vertices) — a recognisable locator, not survey-grade.
const OUTLINE: Array<[number, number]> = [
  [37.0, 74.6], [36.7, 71.2], [35.0, 71.6], [34.1, 70.0], [33.0, 70.1], [31.3, 69.3],
  [30.4, 66.3], [29.4, 64.1], [28.0, 62.4], [25.8, 61.7], [25.0, 61.6], [24.6, 64.5],
  [23.7, 67.5], [24.3, 68.9], [25.7, 70.2], [27.7, 70.6], [28.8, 72.0], [30.0, 74.0],
  [31.1, 74.6], [32.5, 74.7], [33.8, 74.2], [35.5, 76.8], [36.8, 76.3], [37.0, 74.6],
];

const CITIES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Islamabad', lat: 33.69, lng: 73.06 },
  { name: 'Lahore', lat: 31.55, lng: 74.34 },
  { name: 'Karachi', lat: 24.86, lng: 67.0 },
  { name: 'Peshawar', lat: 34.0, lng: 71.5 },
  { name: 'Quetta', lat: 30.18, lng: 66.99 },
  { name: 'Gwadar', lat: 25.13, lng: 62.32 },
];

function ragColor(p: Project): string {
  const slip = p.actualPct - p.plannedPct;
  if (slip <= -10) return 'var(--rag-red)';
  if (slip < -3) return 'var(--rag-amber)';
  return 'var(--rag-green)';
}

/** Offline locator map of Pakistan with project markers (click to open). */
export function PakistanMap({ projects, title = 'Project locations', height = 320 }: { projects: Project[]; title?: string; height?: number }) {
  const navigate = useNavigate();
  const pts = projects.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  const outlinePath = OUTLINE.map(([la, ln], i) => `${i === 0 ? 'M' : 'L'}${project(la, ln).map((n) => n.toFixed(1)).join(',')}`).join(' ') + ' Z';

  return (
    <ChartCard title={title} subtitle={`${pts.length} located`} ariaLabel="Project map">
      <div style={{ width: '100%', maxWidth: 560 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" aria-label="Pakistan project locations">
          <path d={outlinePath} fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth={1.2} />
          {CITIES.map((c) => {
            const [x, y] = project(c.lat, c.lng);
            return (
              <g key={c.name}>
                <circle cx={x} cy={y} r={1.8} fill="var(--muted)" />
                <text x={x + 4} y={y + 3} fontSize={8} fill="var(--muted)">{c.name}</text>
              </g>
            );
          })}
          {pts.map((p) => {
            const [x, y] = project(p.lat!, p.lng!);
            return (
              <g key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/node/${p.id}`)}>
                <circle cx={x} cy={y} r={6} fill={ragColor(p)} opacity={0.25} />
                <circle cx={x} cy={y} r={3} fill={ragColor(p)} stroke="#fff" strokeWidth={1}>
                  <title>{p.location ?? p.id} · {p.actualPct}% actual</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartCard>
  );
}

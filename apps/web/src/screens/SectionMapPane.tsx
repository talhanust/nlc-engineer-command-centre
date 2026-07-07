import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView, type MapMarker } from '../components/MapView';
import { isValidLatLng } from '../domain/geo';
import type { Project } from '../data/types';

/**
 * Per-section map pane: the projects a staff section is looking at, plotted and
 * clickable. Markers are colour-coded by whether the section has flagged an
 * alarm for that project, so the map reads as an exception view at a glance.
 */
export function SectionMapPane({ projects, alarmIds, nameOf, title }: {
  projects: Project[];
  alarmIds: Set<string>;
  nameOf: (id: string) => string;
  title: string;
}) {
  const navigate = useNavigate();

  const markers = useMemo<MapMarker[]>(() => {
    return projects
      .filter((p) => isValidLatLng(p.lat, p.lng))
      .map((p) => ({
        id: p.id,
        lat: p.lat as number,
        lng: p.lng as number,
        label: nameOf(p.id),
        color: alarmIds.has(p.id) ? 'var(--rag-red)' : 'var(--rag-green)',
        glyph: 'dot' as const,
        detail: [
          ['Client', p.clientName],
          ['Planned', `${p.plannedPct}%`],
          ['Actual', `${p.actualPct}%`],
          ...(alarmIds.has(p.id) ? [['Status', 'Alarm flagged'] as [string, string]] : []),
        ],
        openLabel: 'Open project',
        onDetails: () => navigate(`/node/${p.id}`),
        onClick: () => navigate(`/node/${p.id}`),
      }));
  }, [projects, alarmIds, nameOf, navigate]);

  if (markers.length === 0) {
    return <p className="muted small">No mapped projects in this section yet — set coordinates on the project to plot it.</p>;
  }

  return (
    <MapView
      markers={markers}
      title={title}
      subtitle={`${markers.length} project${markers.length === 1 ? '' : 's'} · red = alarm flagged`}
      ariaLabel={`${title} map`}
      height={300}
    />
  );
}

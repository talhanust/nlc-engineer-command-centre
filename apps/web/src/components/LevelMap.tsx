import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView, type MapMarker } from './MapView';
import { nodeById, descendantNodes } from '../domain/org';
import { ragColorVar, markerColorVar, isValidLatLng } from '../domain/geo';
import type { OrgNode, Project } from '../data/types';

const Legend = () => (
  <div className="map-legend small muted" role="note">
    <span><i className="lg-dot lg-sq" style={{ background: 'var(--command)' }} /> HQ</span>
    <span><i className="lg-dot lg-sq" style={{ background: 'var(--signal)' }} /> PD HQ</span>
    <span><i className="lg-dot" style={{ background: 'var(--rag-green)' }} /> On track</span>
    <span><i className="lg-dot" style={{ background: 'var(--rag-amber)' }} /> At risk</span>
    <span><i className="lg-dot" style={{ background: 'var(--rag-red)' }} /> Behind</span>
  </div>
);

/**
 * The map shown at every level. At an HQ it plots that HQ, its PD HQs and all
 * descendant project sites; at a PD HQ it plots the PD HQ and its projects;
 * at a project it plots the single site. Org nodes use a building glyph,
 * projects a RAG-coloured dot, and everything clicks through.
 */
export function LevelMap({
  nodeId, nodes, projects, height = 360, hero = false,
}: { nodeId: string; nodes: OrgNode[]; projects: Project[]; height?: number; hero?: boolean }) {
  const navigate = useNavigate();
  const node = nodeById(nodes, nodeId);

  const markers = useMemo<MapMarker[]>(() => {
    if (!node) return [];
    const projById = new Map(projects.map((p) => [p.id, p]));
    const out: MapMarker[] = [];

    if (node.type !== 'project' && isValidLatLng(node.lat, node.lng)) {
      out.push({
        id: node.id, lat: node.lat!, lng: node.lng!,
        label: `${node.name}${node.location ? ` · ${node.location}` : ''}`,
        color: markerColorVar(node.type), emphasis: true, glyph: 'building',
      });
    }

    const subtree = node.type === 'project' ? [] : descendantNodes(nodes, nodeId);
    for (const d of subtree) {
      if (d.type === 'pd_hq' && isValidLatLng(d.lat, d.lng)) {
        out.push({
          id: d.id, lat: d.lat!, lng: d.lng!,
          label: `${d.name}${d.location ? ` · ${d.location}` : ''}`,
          color: markerColorVar('pd_hq'), emphasis: true, glyph: 'building',
          onClick: () => navigate(`/node/${d.id}`),
        });
      }
      if (d.type === 'project') {
        const p = projById.get(d.id);
        if (p && isValidLatLng(p.lat, p.lng)) {
          out.push({
            id: p.id, lat: p.lat!, lng: p.lng!,
            label: `${d.name}${p.location ? ` · ${p.location}` : ''} · ${p.actualPct}% actual`,
            color: ragColorVar(p.actualPct, p.plannedPct), glyph: 'dot',
            onClick: () => navigate(`/node/${p.id}`),
          });
        }
      }
    }

    if (node.type === 'project') {
      const p = projById.get(node.id);
      if (p && isValidLatLng(p.lat, p.lng)) {
        out.push({
          id: p.id, lat: p.lat!, lng: p.lng!,
          label: `${node.name}${p.location ? ` · ${p.location}` : ''}`,
          color: ragColorVar(p.actualPct, p.plannedPct), emphasis: true, glyph: 'dot',
        });
      }
    }
    return out;
  }, [node, nodes, projects, nodeId, navigate]);

  // Friendly empty state instead of hiding the map entirely.
  if (markers.length === 0) {
    const isProject = node?.type === 'project';
    return (
      <div className="card map-empty">
        <div className="map-empty-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" /><path d="M9 3v15M15 6v15" />
          </svg>
        </div>
        <div>
          <h3 style={{ margin: 0 }}>No sites mapped yet</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {isProject
              ? 'Set this project’s location below to pin it on every level’s map.'
              : 'Set a location for this node or its projects to populate the map.'}
          </p>
        </div>
      </div>
    );
  }

  const titleByType: Record<string, string> = {
    hq: 'Command map — HQ, PD HQs & project sites',
    hq_engrs: 'Command map — PD HQs & project sites',
    pd_hq: 'PD HQ & project sites',
    project: 'Project location',
  };
  const title = titleByType[node?.type ?? 'project'] ?? 'Map';

  return (
    <div className={hero ? 'level-map-hero' : undefined}>
      <MapView
        title={title}
        ariaLabel="Project map"
        markers={markers}
        height={hero ? Math.max(height, 460) : height}
        legend={hero ? <Legend /> : undefined}
      />
      {!hero && <Legend />}
    </div>
  );
}

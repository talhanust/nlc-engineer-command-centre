import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import type { AuditEntry } from '../data/types';
import { CollapsibleCard } from './CollapsibleCard';

const ENTITY_COLOR: Record<string, string> = {
  Project: 'var(--command)', Node: 'var(--command)',
  BOQ: 'var(--primary)', Baseline: 'var(--primary)', Schedule: 'var(--primary)', 'S-curve': 'var(--primary)',
  IPC: 'var(--signal)', RAR: 'var(--signal)', EPC: 'var(--signal)', Demand: 'var(--signal)',
  Contract: 'var(--signal)', Payment: 'var(--signal)', PO: 'var(--signal)',
  HR: 'var(--rag-green)',
};
const colorFor = (entity: string) => ENTITY_COLOR[entity] ?? 'var(--muted)';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Per-node activity timeline built from the append-only audit log. When
 * `scopeIds` is supplied (a branch + its descendants) a toggle lets the user
 * widen from just this node to the whole sub-tree.
 */
export function ActivityFeed({ nodeId, scopeIds, limit = 40 }: { nodeId: string; scopeIds?: string[]; limit?: number }) {
  const { provider } = useData();
  const [all, setAll] = useState<AuditEntry[]>([]);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => provider.listAudit().then((rows) => { if (alive) setAll(rows); });
    void load();
    const onAudit = () => { void load(); };
    window.addEventListener('nlc:audit', onAudit);
    return () => { alive = false; window.removeEventListener('nlc:audit', onAudit); };
  }, [provider]);

  const scope = useMemo(() => new Set(wide && scopeIds ? scopeIds : [nodeId]), [wide, scopeIds, nodeId]);
  const rows = useMemo(() => all.filter((e) => scope.has(e.projectId)), [all, scope]);
  const shown = rows.slice(0, limit);

  // Group consecutive entries by calendar day (rows are newest-first).
  const groups: Array<{ day: string; items: AuditEntry[] }> = [];
  for (const e of shown) {
    const day = dayLabel(e.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <CollapsibleCard id={`activity-${nodeId}`} title="Activity">
      <div className="activity-head">
        <span className="muted small">{rows.length} event{rows.length === 1 ? '' : 's'}{rows.length > limit ? ` · showing ${limit}` : ''}</span>
        {scopeIds && scopeIds.length > 1 && (
          <span className="seg" role="group" aria-label="Activity scope">
            <button className={`seg-btn${!wide ? ' active' : ''}`} onClick={() => setWide(false)}>This node</button>
            <button className={`seg-btn${wide ? ' active' : ''}`} onClick={() => setWide(true)}>All sub-units</button>
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="muted small">No recorded activity yet.</p>
      ) : (
        <div className="activity-feed">
          {groups.map((g) => (
            <div className="activity-group" key={g.day}>
              <div className="activity-day">{g.day}</div>
              <ul className="activity-list">
                {g.items.map((e) => (
                  <li className="activity-item" key={e.id}>
                    <span className="activity-dot" style={{ background: colorFor(e.entity) }} aria-hidden />
                    <span className="activity-time">{timeOf(e.at)}</span>
                    <span className="activity-body">
                      <span className="activity-tag" style={{ borderColor: colorFor(e.entity), color: colorFor(e.entity) }}>{e.entity}</span>
                      <span className="activity-action">{e.action}</span>
                      <span className="activity-ref">{e.ref}</span>
                      {e.detail && <span className="muted small activity-detail">— {e.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

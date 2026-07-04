import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import type { AuditEntry } from '../data/types';

const ICON: Record<string, string> = {
  create: '✚', transition: '→', status: '◷', apply: '⟳', pay: '✓', mark_payment: '✓', verify: '✓', approve: '✓', archive: '🗄', delete: '✕',
};
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

/** Append-only audit trail for one entity + reference, shown as a live timeline. */
export function AuditTrail({ entity, reference }: { entity: string; reference: string }) {
  const { provider } = useData();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => provider.listAudit().then((all) => live && setRows(all.filter((e) => e.entity === entity && e.ref === reference)));
    void load();
    const onAudit = () => void load();
    window.addEventListener('nlc:audit', onAudit);
    return () => { live = false; window.removeEventListener('nlc:audit', onAudit); };
  }, [provider, entity, reference]);

  return (
    <div>
      <h3>Activity</h3>
      {rows.length === 0 ? (
        <p className="muted small">No recorded events yet for {reference}.</p>
      ) : (
        <ul className="audit-timeline" aria-label="Entity audit trail">
          {rows.map((e) => (
            <li key={e.id} className="audit-row">
              <span className="audit-dot" aria-hidden>{ICON[e.action] ?? '•'}</span>
              <div>
                <div className="audit-line"><strong style={{ textTransform: 'capitalize' }}>{e.action.replace(/_/g, ' ')}</strong>{e.detail && <span className="muted small"> · {e.detail}</span>}</div>
                <div className="muted small" title={new Date(e.at).toLocaleString()}>{relativeTime(e.at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

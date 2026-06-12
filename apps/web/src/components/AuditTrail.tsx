import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import type { AuditEntry } from '../data/types';

/** Shows the append-only audit trail filtered to one entity + reference. */
export function AuditTrail({ entity, reference }: { entity: string; reference: string }) {
  const { provider } = useData();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  useEffect(() => {
    let a = true;
    provider.listAudit().then((all) => a && setRows(all.filter((e) => e.entity === entity && e.ref === reference)));
    return () => { a = false; };
  }, [provider, entity, reference]);

  return (
    <div>
      <h3>Audit trail</h3>
      {rows.length === 0 ? (
        <p className="muted small">No recorded events yet for {reference}.</p>
      ) : (
        <table className="data-table" aria-label="Entity audit trail">
          <thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="small">{new Date(e.at).toLocaleString()}</td>
                <td>{e.action}</td>
                <td className="muted small">{e.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

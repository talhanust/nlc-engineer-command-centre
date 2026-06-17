import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import type { Salient } from '../data/types';

export function SalientsCard({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [salients, setSalients] = useState<Salient[]>([]);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  async function reload() {
    setSalients(await provider.listSalients(projectId));
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  async function add() {
    if (!label.trim() || !value.trim()) return;
    await provider.upsertSalient(projectId, { label: label.trim(), value: value.trim() });
    setLabel(''); setValue(''); await reload();
  }
  async function save(s: Salient, nextValue: string) {
    if (nextValue === s.value) return;
    await provider.upsertSalient(projectId, { id: s.id, label: s.label, value: nextValue });
    await reload();
  }
  async function remove(id: string) {
    await provider.deleteSalient(projectId, id);
    await reload();
  }

  return (
    <div className="card">
      <div className="section-head"><h3>Project salients</h3><span className="muted">{salients.length} facts</span></div>
      <table className="data-table" aria-label="Salients">
        <tbody>
          {salients.map((s) => (
            <tr key={s.id}>
              <td style={{ width: 200, fontWeight: 600 }}>{s.label}</td>
              <td>
                <input
                  aria-label={`Salient ${s.label}`}
                  defaultValue={s.value}
                  style={{ width: '100%' }}
                  onBlur={(e) => save(s, e.target.value)}
                />
              </td>
              <td style={{ width: 40 }}>
                <button className="btn-ghost" aria-label={`Delete ${s.label}`} style={{ padding: '2px 8px' }} onClick={() => remove(s.id)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="create-row" style={{ marginTop: 10 }}>
        <input aria-label="New salient label" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: 200 }} />
        <input aria-label="New salient value" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn" onClick={add}>Add salient</button>
      </div>
    </div>
  );
}

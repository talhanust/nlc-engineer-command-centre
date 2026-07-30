import { useEffect, useState } from 'react';
import { useData } from '../data/DataContext';
import type { Salient } from '../data/types';

interface Draft { id?: string; label: string; value: string; }

/**
 * Project salients as a proper fact sheet with an explicit edit mode.
 *
 * The old card was a permanent form — every fact a live input that autosaved on
 * blur — so it read as forever-unsaved and a stray keystroke silently changed a
 * project fact. Master data should be VIEWED by default and edited deliberately:
 * a clean read view, an Edit button, then inputs with Save / Cancel. Nothing is
 * written until Save; Cancel restores exactly what was there.
 */
export function SalientsCard({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [salients, setSalients] = useState<Salient[]>([]);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setSalients(await provider.listSalients(projectId));
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  function beginEdit() {
    setDrafts(salients.map((s) => ({ id: s.id, label: s.label, value: s.value })));
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setDrafts([]);
  }
  function patch(i: number, field: 'label' | 'value', v: string) {
    setDrafts((d) => d.map((row, j) => (j === i ? { ...row, [field]: v } : row)));
  }
  function addRow() {
    setDrafts((d) => [...d, { label: '', value: '' }]);
  }
  function removeRow(i: number) {
    setDrafts((d) => d.filter((_, j) => j !== i));
  }

  async function save() {
    setSaving(true);
    try {
      const keep = drafts.filter((d) => d.label.trim() && d.value.trim());
      const keptIds = new Set(keep.map((d) => d.id).filter(Boolean) as string[]);
      // Delete facts removed in this edit…
      for (const s of salients) {
        if (!keptIds.has(s.id)) await provider.deleteSalient(projectId, s.id);
      }
      // …then upsert the rest (new rows and changed values).
      for (const d of keep) {
        const original = d.id ? salients.find((s) => s.id === d.id) : undefined;
        if (!original || original.label !== d.label.trim() || original.value !== d.value.trim()) {
          await provider.upsertSalient(projectId, { id: d.id, label: d.label.trim(), value: d.value.trim() });
        }
      }
      await reload();
      setEditing(false);
      setDrafts([]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="section-head">
        <h3>Project salients</h3>
        {!editing ? (
          <div className="head-tools">
            <span className="muted small">{salients.length} fact{salients.length === 1 ? '' : 's'}</span>
            <button className="btn-ghost btn-mini" onClick={beginEdit} aria-label="Edit salients">Edit</button>
          </div>
        ) : (
          <div className="head-tools">
            <button className="btn-ghost btn-mini" onClick={cancel} disabled={saving}>Cancel</button>
            <button className="btn btn-mini" onClick={save} disabled={saving} aria-label="Save salients">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        )}
      </div>

      {!editing ? (
        salients.length === 0 ? (
          <p className="muted small">No salients recorded. Use Edit to add the project's key facts.</p>
        ) : (
          <dl className="fact-sheet" aria-label="Salients">
            {salients.map((s) => (
              <div className="fact-row" key={s.id}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        )
      ) : (
        <table className="data-table" aria-label="Edit salients">
          <thead><tr><th style={{ width: 220 }}>Label</th><th>Value</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {drafts.map((d, i) => (
              <tr key={d.id ?? `new-${i}`}>
                <td><input aria-label={`Salient label ${i + 1}`} value={d.label} placeholder="Label"
                  onChange={(e) => patch(i, 'label', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input aria-label={`Salient value ${i + 1}`} value={d.value} placeholder="Value"
                  onChange={(e) => patch(i, 'value', e.target.value)} style={{ width: '100%' }} /></td>
                <td><button className="btn-ghost" aria-label={`Remove row ${i + 1}`} style={{ padding: '2px 8px' }} onClick={() => removeRow(i)}>✕</button></td>
              </tr>
            ))}
            {drafts.length === 0 && <tr><td colSpan={3} className="muted small">No facts yet — add one below.</td></tr>}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>
              <button className="btn-ghost btn-mini" onClick={addRow} aria-label="Add salient row">+ Add fact</button>
            </td></tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

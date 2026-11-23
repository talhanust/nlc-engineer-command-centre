import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useRole } from '../../state/Role';
import { formatMoney } from '../../domain/money';
import { lineType } from '../../domain/boqLineType';
import { sheetTotal, validatedDayworkValue, dayworkSummary, DAYWORK_KIND_LABEL } from '../../domain/dayworks';
import type { BoqItem, DayworkSheet, DayworkResource, DayworkKind } from '../../data/types';

const KINDS: DayworkKind[] = ['labour', 'plant', 'material'];
const blankRes = (): DayworkResource => ({ kind: 'labour', description: '', unit: 'hr', qty: 0, rate: 0 });

/**
 * Dayworks register — book actual labour, plant and materials against a dayworks
 * BOQ line, and validate them. A dayworks line is not remeasured from a quantity;
 * its value is the sum of its validated sheets, which this screen records and totals.
 */
export function DayworksTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { role } = useRole();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [sheets, setSheets] = useState<DayworkSheet[]>([]);
  const [draft, setDraft] = useState<{ boqItemId: string; date: string; ref: string; description: string; resources: DayworkResource[] } | null>(null);

  async function reload() {
    const [b, d] = await Promise.all([provider.listBoq(projectId), provider.listDayworks(projectId)]);
    setBoq(b); setSheets(d);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const dwLines = useMemo(() => boq.filter((i) => lineType(i) === 'dayworks'), [boq]);
  const summary = useMemo(() => dayworkSummary(sheets), [sheets]);
  const codeOf = useMemo(() => new Map(boq.map((b) => [b.id, b.code])), [boq]);

  function begin() {
    setDraft({ boqItemId: dwLines[0]?.id ?? '', date: new Date().toISOString().slice(0, 10), ref: '', description: '', resources: [blankRes()] });
  }
  function patchRes(i: number, field: keyof DayworkResource, v: string) {
    setDraft((d) => d && ({ ...d, resources: d.resources.map((r, j) => (j === i ? { ...r, [field]: field === 'qty' || field === 'rate' ? Number(v) : v } : r)) }));
  }
  async function saveDraft() {
    if (!draft || !draft.boqItemId) return;
    const resources = draft.resources.filter((r) => r.description.trim() && r.qty > 0);
    if (resources.length === 0) return;
    await provider.upsertDaywork(projectId, { boqItemId: draft.boqItemId, date: draft.date, ref: draft.ref.trim() || undefined, description: draft.description.trim(), resources, enteredBy: role });
    setDraft(null); await reload();
  }
  async function validate(id: string) { await provider.validateDaywork(projectId, id, role); await reload(); }
  async function remove(id: string) { await provider.deleteDaywork(projectId, id); await reload(); }

  if (dwLines.length === 0) {
    return <div className="card"><p className="muted">No dayworks lines in the BOQ. Mark a BOQ item as “Dayworks” in the Bill of Quantities to book time-and-materials against it.</p></div>;
  }

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-label">Validated (incurred)</div><div className="kpi-value">{formatMoney(summary.validated)}</div></div>
        <div className="kpi"><div className="kpi-label">Draft (pending)</div><div className="kpi-value">{formatMoney(summary.draft)}</div></div>
        <div className="kpi"><div className="kpi-label">Labour</div><div className="kpi-value">{formatMoney(summary.byCategory.labour)}</div></div>
        <div className="kpi"><div className="kpi-label">Plant</div><div className="kpi-value">{formatMoney(summary.byCategory.plant)}</div></div>
        <div className="kpi"><div className="kpi-label">Material</div><div className="kpi-value">{formatMoney(summary.byCategory.material)}</div></div>
      </div>

      <div className="section-head" style={{ marginTop: 10 }}>
        <h3>Dayworks lines</h3>
        {!draft && <button className="btn" onClick={begin} aria-label="Book daywork sheet">+ Book daywork sheet</button>}
      </div>
      <table className="data-table" aria-label="Dayworks lines">
        <thead><tr><th>Code</th><th>Description</th><th className="num">Validated value</th><th className="num">Sheets</th></tr></thead>
        <tbody>
          {dwLines.map((i) => {
            const n = sheets.filter((s) => s.boqItemId === i.id).length;
            return (
              <tr key={i.id}>
                <td className="mono small">{i.code}</td>
                <td>{i.description}</td>
                <td className="num">{formatMoney(validatedDayworkValue(sheets, i.id))}</td>
                <td className="num small">{n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {draft && (
        <div className="card" style={{ marginTop: 12 }} aria-label="New daywork sheet">
          <div className="section-head"><h3>New daywork sheet</h3></div>
          <div className="create-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <label className="small">Line{' '}
              <select aria-label="Dayworks line" value={draft.boqItemId} onChange={(e) => setDraft({ ...draft, boqItemId: e.target.value })}>
                {dwLines.map((i) => <option key={i.id} value={i.id}>{i.code} · {i.description}</option>)}
              </select>
            </label>
            <label className="small">Date{' '}<input type="date" aria-label="Daywork date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
            <label className="small">Ref{' '}<input aria-label="Daywork ref" placeholder="DW-…" value={draft.ref} onChange={(e) => setDraft({ ...draft, ref: e.target.value })} style={{ width: 90 }} /></label>
            <label className="small" style={{ flex: 1, minWidth: 180 }}>Description{' '}<input aria-label="Daywork description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={{ width: '100%' }} /></label>
          </div>

          <table className="data-table" aria-label="Daywork resources" style={{ marginTop: 8 }}>
            <thead><tr><th>Type</th><th>Description</th><th>Unit</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>
              {draft.resources.map((r, i) => (
                <tr key={i}>
                  <td><select aria-label={`Resource type ${i + 1}`} value={r.kind} onChange={(e) => patchRes(i, 'kind', e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{DAYWORK_KIND_LABEL[k]}</option>)}</select></td>
                  <td><input aria-label={`Resource description ${i + 1}`} value={r.description} onChange={(e) => patchRes(i, 'description', e.target.value)} style={{ width: '100%' }} /></td>
                  <td><input aria-label={`Resource unit ${i + 1}`} value={r.unit} onChange={(e) => patchRes(i, 'unit', e.target.value)} style={{ width: 56 }} /></td>
                  <td className="num"><input type="number" aria-label={`Resource qty ${i + 1}`} value={r.qty || ''} onChange={(e) => patchRes(i, 'qty', e.target.value)} style={{ width: 72 }} /></td>
                  <td className="num"><input type="number" aria-label={`Resource rate ${i + 1}`} value={r.rate || ''} onChange={(e) => patchRes(i, 'rate', e.target.value)} style={{ width: 90 }} /></td>
                  <td className="num">{formatMoney(r.qty * r.rate)}</td>
                  <td><button className="btn-ghost" aria-label={`Remove resource ${i + 1}`} onClick={() => setDraft({ ...draft, resources: draft.resources.filter((_, j) => j !== i) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}><button className="btn-ghost btn-mini" onClick={() => setDraft({ ...draft, resources: [...draft.resources, blankRes()] })}>+ Add resource</button></td>
                <td className="num"><strong>{formatMoney(sheetTotal({ resources: draft.resources }))}</strong></td><td /></tr>
            </tfoot>
          </table>
          <div className="create-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button className="btn" onClick={saveDraft} aria-label="Save daywork sheet">Save as draft</button>
          </div>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 16 }}><h3>Daywork sheets</h3><span className="muted">{sheets.length} sheet{sheets.length === 1 ? '' : 's'}</span></div>
      <table className="data-table" aria-label="Daywork sheets">
        <thead><tr><th>Ref</th><th>Date</th><th>Line</th><th>Description</th><th className="num">Value</th><th>Status</th><th /></tr></thead>
        <tbody>
          {sheets.length === 0 ? <tr><td colSpan={7} className="muted">No daywork sheets booked yet.</td></tr> :
            sheets.map((s) => (
              <tr key={s.id}>
                <td className="mono small">{s.ref ?? '—'}</td>
                <td className="small">{s.date}</td>
                <td className="mono small">{codeOf.get(s.boqItemId) ?? '—'}</td>
                <td>{s.description}</td>
                <td className="num">{formatMoney(sheetTotal(s))}</td>
                <td><span className={`status-pill ${s.status === 'validated' ? 'st-vetted' : 'st-draft'}`}>{s.status === 'validated' ? 'Validated' : 'Draft'}</span></td>
                <td>
                  <div className="create-row" style={{ gap: 4 }}>
                    {s.status === 'draft' && <button className="btn-ghost btn-mini" disabled={role !== 'pm'} title={role !== 'pm' ? 'Only the PM validates' : ''} aria-label={`Validate ${s.ref ?? s.id}`} onClick={() => validate(s.id)}>Validate</button>}
                    <button className="btn-ghost btn-mini" aria-label={`Delete ${s.ref ?? s.id}`} onClick={() => remove(s.id)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

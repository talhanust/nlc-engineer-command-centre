import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import type {
  HrUnit, HrPerson, HrCredential, HrTransfer, HrEstablishmentVersion, CredentialKind, OrgNode,
} from '../data/types';
import { CREDENTIAL_KINDS, expiryStatus, expiringCredentials, daysToExpiry } from '../domain/credentials';
import { diffEstablishment } from '../domain/estabversion';
import { TRANSFER_STAGE_LABEL } from '../domain/postingchain';
import {
  establishmentToAoa, parseEstablishmentRows, toCsv, downloadText, organogramSvg, downloadSvgAsPng,
} from './hrExport';
import { downloadWorkbook } from './xlsxExport';
import { readSheetRows } from './xlsxImport';

// =============================================================== Skills =====
export function SkillsView({ nodeId, people }: { nodeId: string; people: HrPerson[] }) {
  const { provider } = useData();
  const [creds, setCreds] = useState<HrCredential[]>([]);
  const [personId, setPersonId] = useState('');
  const [kind, setKind] = useState<CredentialKind>('PEC');
  const [ref, setRef] = useState('');
  const [issued, setIssued] = useState('');
  const [expires, setExpires] = useState('');

  async function load() { setCreds(await provider.listCredentials(nodeId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, nodeId]);

  const attention = useMemo(() => expiringCredentials(creds), [creds]);
  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? '—';

  async function add() {
    if (!personId || !ref.trim()) return;
    await provider.upsertCredential(nodeId, { personId, personName: personName(personId), kind, ref: ref.trim(), issued: issued || undefined, expires: expires || undefined });
    setRef(''); setIssued(''); setExpires(''); await load();
  }
  async function remove(id: string) { setCreds(await provider.deleteCredential(nodeId, id)); }

  return (
    <div>
      <div className="section-head"><h3>Skills & qualifications</h3><span className="muted small">{creds.length} on file</span></div>

      {attention.length > 0 && (
        <div className="alert-banner" role="status">
          <strong>{attention.length}</strong> credential{attention.length > 1 ? 's' : ''} need attention —
          {' '}{attention.slice(0, 3).map((c) => `${c.personName} (${c.kind}${c.expires ? ', ' + (daysToExpiry(c.expires) < 0 ? 'expired' : `${daysToExpiry(c.expires)}d`) : ''})`).join('; ')}
          {attention.length > 3 ? '…' : ''}
        </div>
      )}

      <div className="card create-row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <select aria-label="Credential person" value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          <option value="">— Select person —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Credential kind" value={kind} onChange={(e) => setKind(e.target.value as CredentialKind)} style={{ width: 140 }}>
          {CREDENTIAL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input aria-label="Credential reference" placeholder="Ref / number" value={ref} onChange={(e) => setRef(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
        <label className="field-inline">Issued <input aria-label="Credential issued" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></label>
        <label className="field-inline">Expires <input aria-label="Credential expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        <button className="btn" onClick={add}>Add</button>
      </div>

      <table className="data-table" aria-label="Credentials">
        <thead><tr><th>Person</th><th>Type</th><th>Reference</th><th>Issued</th><th>Expires</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {creds.length === 0 ? <tr><td colSpan={7} className="muted">No credentials recorded.</td></tr> :
            creds.map((c) => {
              const st = expiryStatus(c.expires);
              return (
                <tr key={c.id}>
                  <td>{c.personName}</td>
                  <td>{c.kind}</td>
                  <td className="small">{c.ref}</td>
                  <td className="small">{c.issued ?? '—'}</td>
                  <td className="small">{c.expires ?? '—'}</td>
                  <td><span className={`expiry-badge st-${st}`}>{st === 'none' ? 'non-expiring' : st}</span></td>
                  <td><button className="btn-ghost" aria-label={`Delete credential ${c.ref}`} onClick={() => remove(c.id)}>✕</button></td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================= Postings =====
export function PostingsView({
  nodeId, nodeName, nodes, units, people, onChanged,
}: { nodeId: string; nodeName: string; nodes: OrgNode[]; units: HrUnit[]; people: HrPerson[]; onChanged: () => void }) {
  const { provider } = useData();
  const [transfers, setTransfers] = useState<HrTransfer[]>([]);
  const [personId, setPersonId] = useState('');
  const [toNodeId, setToNodeId] = useState(nodeId);
  const [toUnitId, setToUnitId] = useState('');
  const [toUnitTitleManual, setToUnitTitleManual] = useState('');
  const [reason, setReason] = useState('');
  const [targetUnits, setTargetUnits] = useState<HrUnit[]>(units);

  async function load() { setTransfers(await provider.listTransfersForNode(nodeId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, nodeId]);
  useEffect(() => {
    if (toNodeId === nodeId) { setTargetUnits(units); return; }
    void provider.listHrUnits(toNodeId).then(setTargetUnits);
  }, [toNodeId, nodeId, units, provider]);

  const unitTitle = (id: string) => targetUnits.find((u) => u.id === id)?.title ?? toUnitTitleManual;
  const sameNode = toNodeId === nodeId;

  async function raise() {
    const person = people.find((p) => p.id === personId);
    if (!person) return;
    const toNode = nodes.find((n) => n.id === toNodeId);
    await provider.raiseTransfer({
      personId: person.id, personName: person.name,
      fromNodeId: nodeId, fromNodeName: nodeName, fromUnitId: person.unitId,
      toNodeId, toNodeName: toNode?.name ?? toNodeId,
      toUnitId: sameNode ? (toUnitId || null) : (toUnitId || null),
      toUnitTitle: sameNode ? unitTitle(toUnitId) : (toUnitId ? unitTitle(toUnitId) : toUnitTitleManual),
      reason: reason.trim() || undefined,
    });
    setPersonId(''); setToUnitId(''); setToUnitTitleManual(''); setReason('');
    await load(); onChanged();
  }
  async function advance(t: HrTransfer) { setTransfers(await provider.advanceTransfer(t.id)); }
  async function effect(t: HrTransfer) { await provider.effectTransfer(t.id); await load(); onChanged(); }
  async function reject(t: HrTransfer) { setTransfers(await provider.rejectTransfer(t.id)); }
  async function drop(t: HrTransfer) { setTransfers(await provider.deleteTransfer(t.id)); }

  return (
    <div>
      <div className="section-head"><h3>Postings & deployment</h3><span className="muted small">{transfers.filter((t) => t.stage !== 'effected' && t.stage !== 'rejected').length} in motion</span></div>

      <div className="card create-row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <select aria-label="Transfer person" value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
          <option value="">— Person to move —</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Destination node" value={toNodeId} onChange={(e) => { setToNodeId(e.target.value); setToUnitId(''); }} style={{ flex: 1, minWidth: 150 }}>
          {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}{n.id === nodeId ? ' (here)' : ''}</option>)}
        </select>
        {(sameNode || targetUnits.length > 0) ? (
          <select aria-label="Destination post" value={toUnitId} onChange={(e) => setToUnitId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
            <option value="">— Bench / unassigned —</option>
            {targetUnits.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
          </select>
        ) : (
          <input aria-label="Destination post title" placeholder="Destination post" value={toUnitTitleManual} onChange={(e) => setToUnitTitleManual(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
        )}
        <input aria-label="Transfer reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
        <button className="btn" onClick={raise}>Raise posting</button>
      </div>

      <table className="data-table" aria-label="Postings">
        <thead><tr><th>Person</th><th>From</th><th>To</th><th>Stage</th><th>Actions</th></tr></thead>
        <tbody>
          {transfers.length === 0 ? <tr><td colSpan={5} className="muted">No postings raised.</td></tr> :
            transfers.map((t) => (
              <tr key={t.id}>
                <td>{t.personName}</td>
                <td className="small muted">{t.fromNodeName}{t.fromUnitId ? '' : ' · bench'}</td>
                <td className="small">{t.toNodeName} › {t.toUnitTitle || 'bench'}</td>
                <td><span className={`posting-stage st-${t.stage}`}>{TRANSFER_STAGE_LABEL[t.stage]}</span></td>
                <td>
                  <div className="row-actions no-print">
                    {t.stage === 'raised' || t.stage === 'recommended' ? <button className="btn-ghost btn-mini" onClick={() => advance(t)} aria-label={`Advance posting for ${t.personName}`}>Advance →</button> : null}
                    {t.stage === 'approved' ? <button className="btn btn-mini" onClick={() => effect(t)} aria-label={`Effect posting for ${t.personName}`}>Effect move</button> : null}
                    {t.stage !== 'effected' && t.stage !== 'rejected' ? <button className="btn-ghost btn-mini" onClick={() => reject(t)} aria-label={`Reject posting for ${t.personName}`}>Reject</button> : null}
                    <button className="icon-mini" onClick={() => drop(t)} aria-label={`Delete posting for ${t.personName}`}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================= Versions =====
export function VersionsView({ nodeId, units }: { nodeId: string; units: HrUnit[] }) {
  const { provider } = useData();
  const [versions, setVersions] = useState<HrEstablishmentVersion[]>([]);
  const [label, setLabel] = useState('');
  const [diffOpen, setDiffOpen] = useState<string | null>(null);

  async function load() { setVersions(await provider.listEstablishmentVersions(nodeId)); }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, nodeId]);

  async function snapshot() { await provider.snapshotEstablishment(nodeId, label.trim() || `Snapshot`); setLabel(''); await load(); }
  async function sanction(v: HrEstablishmentVersion) {
    const by = window.prompt('Sanctioned by (name / appointment):', 'Comd Engrs');
    if (by == null) return;
    await provider.sanctionEstablishmentVersion(nodeId, v.id, by); await load();
  }
  async function remove(id: string) { setVersions(await provider.deleteEstablishmentVersion(nodeId, id)); }

  return (
    <div>
      <div className="section-head"><h3>Establishment versions</h3><span className="muted small">{versions.length} snapshot{versions.length === 1 ? '' : 's'}</span></div>

      <div className="card create-row" style={{ marginBottom: 12 }}>
        <input aria-label="Snapshot label" placeholder="Label (e.g. Sanctioned TO&E 2026)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn" onClick={snapshot}>Snapshot current</button>
      </div>

      {versions.length === 0 ? <p className="muted">No snapshots yet. Capture the current establishment to start a version history.</p> :
        versions.map((v) => {
          const d = diffEstablishment(v.snapshot, units);
          const changes = d.added.length + d.removed.length + d.changed.length;
          return (
            <div className="card" key={v.id} style={{ marginBottom: 10 }}>
              <div className="section-head">
                <h3>v{v.version} · {v.label} {v.status === 'sanctioned' ? <span className="posting-stage st-effected">sanctioned</span> : <span className="posting-stage st-raised">draft</span>}</h3>
                <span className="muted small">{v.createdAt.slice(0, 10)}{v.approvedBy ? ` · by ${v.approvedBy}` : ''}</span>
              </div>
              <div className="row-actions no-print" style={{ marginBottom: 6 }}>
                <button className="btn-ghost btn-mini" onClick={() => setDiffOpen(diffOpen === v.id ? null : v.id)}>{diffOpen === v.id ? 'Hide diff' : `Diff vs current (${changes})`}</button>
                {v.status !== 'sanctioned' && <button className="btn-ghost btn-mini" onClick={() => sanction(v)}>Sanction</button>}
                <button className="icon-mini" onClick={() => remove(v.id)} aria-label={`Delete version v${v.version}`}>✕</button>
              </div>
              {diffOpen === v.id && (
                <div className="version-diff">
                  <p className="small muted">vs current: AUTH {d.authDelta >= 0 ? '+' : ''}{d.authDelta} · HELD {d.heldDelta >= 0 ? '+' : ''}{d.heldDelta}</p>
                  {changes === 0 ? <p className="small pos">No changes — current matches this snapshot.</p> : (
                    <ul className="diff-list small">
                      {d.added.map((x) => <li key={x.id}><span className="diff-add">+ added</span> {x.title} ({x.authTo} auth)</li>)}
                      {d.removed.map((x) => <li key={x.id}><span className="diff-rem">− removed</span> {x.title} ({x.authFrom} auth)</li>)}
                      {d.changed.map((x) => <li key={x.id}><span className="diff-chg">~ changed</span> {x.title}: auth {x.authFrom}→{x.authTo}, held {x.heldFrom}→{x.heldTo}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

// ===================================================== Import / export =======
export function EstablishmentIO({ nodeId, units, onImported }: { nodeId: string; units: HrUnit[]; onImported: () => void }) {
  const { provider } = useData();
  const [msg, setMsg] = useState('');

  async function importFile(file: File) {
    try {
      const rows = await readSheetRows(file);
      const parsed = parseEstablishmentRows(rows as Array<Array<string | number>>);
      if (parsed.length === 0) { setMsg('No rows found. Expected columns: Title, Reports to, Scale, Category, Auth, Held.'); return; }
      // Two passes: create roots/sections by title, then resolve parents by title.
      const titleToId = new Map<string, string>();
      for (const u of units) titleToId.set(u.title, u.id);
      // First create units without parents that don't yet exist.
      for (const r of parsed) {
        if (titleToId.has(r.title)) continue;
        const res = await provider.upsertHrUnit(nodeId, { parentId: null, title: r.title, scale: r.scale, category: r.category, auth: r.auth, held: r.held, order: titleToId.size });
        const created = res.find((u) => u.title === r.title && !titleToId.has(u.id));
        if (created) titleToId.set(r.title, created.id);
      }
      // Resolve parent links.
      const current = await provider.listHrUnits(nodeId);
      for (const r of parsed) {
        if (!r.parentTitle) continue;
        const child = current.find((u) => u.title === r.title);
        const parentId = titleToId.get(r.parentTitle);
        if (child && parentId && child.parentId !== parentId) {
          await provider.upsertHrUnit(nodeId, { ...child, parentId });
        }
      }
      setMsg(`Imported ${parsed.length} post(s).`);
      onImported();
    } catch {
      setMsg('Could not read that file.');
    }
  }

  function exportXlsx() { void downloadWorkbook([{ name: 'Establishment', aoa: establishmentToAoa(units) }], 'establishment.xlsx'); }
  function exportCsv() { downloadText('establishment.csv', toCsv(establishmentToAoa(units)), 'text/csv'); }

  return (
    <div className="card create-row" style={{ alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <strong className="small">Import / export</strong>
      <button className="btn-ghost" onClick={exportXlsx} disabled={units.length === 0}>Export .xlsx</button>
      <button className="btn-ghost" onClick={exportCsv} disabled={units.length === 0}>Export .csv</button>
      <label className="btn-ghost" style={{ cursor: 'pointer' }}>
        Import Anx-D sheet
        <input type="file" accept=".xlsx,.xls,.csv" aria-label="Import establishment" style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </label>
      {msg && <span className="muted small" role="status">{msg}</span>}
    </div>
  );
}

// =================================================== Organogram export =======
export function OrganogramExport({ units, title }: { units: HrUnit[]; title: string }) {
  function svg() { downloadText(`${title.replace(/\s+/g, '-')}-organogram.svg`, organogramSvg(units, title), 'image/svg+xml'); }
  function png() { downloadSvgAsPng(organogramSvg(units, title), `${title.replace(/\s+/g, '-')}-organogram.png`); }
  return (
    <div className="orgo-export no-print">
      <span className="muted small">Export chart:</span>
      <button className="btn-ghost btn-mini" onClick={svg} disabled={units.length === 0}>SVG</button>
      <button className="btn-ghost btn-mini" onClick={png} disabled={units.length === 0}>PNG</button>
      <button className="btn-ghost btn-mini" onClick={() => window.print()}>Print / PDF</button>
    </div>
  );
}

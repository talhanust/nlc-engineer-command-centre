import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { formatMoney, getMoneyFormat, setMoneyFormat, MONEY_FORMATS, type MoneyFormat } from '../domain/money';
import { getPowers, setPowers, DEFAULT_POWERS, ROLE_LABEL } from '../domain/chains';
import {
  getAccessMatrix, setAccessMatrix, CAPABILITIES, CAPABILITY_LABEL, MATRIX_ROLES,
  type Capability, type AccessMatrix,
} from '../domain/access';
import type { AuditEntry } from '../data/types';

export function Settings() {
  return (
    <div className="content">
      <div className="breadcrumb"><Link to="/node/hq-nlc">HQ NLC</Link><span className="sep">/</span><strong>Settings</strong></div>
      <h1>Settings</h1>
      <DisplaySettings />
      <BackupRestore />
      <PowersEditor />
      <AccessMatrixEditor />
      <AuditLog />
    </div>
  );
}

function AccessMatrixEditor() {
  const [matrix, setMatrix] = useState<AccessMatrix>(() => structuredClone(getAccessMatrix()));
  const [saved, setSaved] = useState(false);

  function toggle(role: string, cap: Capability) {
    setMatrix((prev) => {
      const has = (prev[role] ?? []).includes(cap);
      const caps = has ? prev[role].filter((c) => c !== cap) : [...(prev[role] ?? []), cap];
      return { ...prev, [role]: caps };
    });
    setSaved(false);
  }
  function save() { setAccessMatrix(matrix); setSaved(true); }

  return (
    <div className="card">
      <h3>Access matrix</h3>
      <p className="muted small">Role × capability permissions. In <code>api</code> mode these map to RBAC enforced server-side.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" aria-label="Access matrix">
          <thead>
            <tr><th>Capability</th>{MATRIX_ROLES.map((r) => (<th key={r} className="num">{ROLE_LABEL[r]}</th>))}</tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap) => (
              <tr key={cap}>
                <td>{CAPABILITY_LABEL[cap]}</td>
                {MATRIX_ROLES.map((r) => (
                  <td key={r} className="num">
                    <input
                      type="checkbox"
                      aria-label={`${r} can ${cap}`}
                      checked={(matrix[r] ?? []).includes(cap)}
                      onChange={() => toggle(r, cap)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="create-row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={save}>Save matrix</button>
        {saved && <span className="pos small" role="status">Saved.</span>}
      </div>
    </div>
  );
}

function DisplaySettings() {
  const [fmt, setFmt] = useState<MoneyFormat>(getMoneyFormat());
  const sample = 19284461163;
  function choose(next: MoneyFormat) {
    setFmt(next);
    setMoneyFormat(next);
  }
  return (
    <div className="card">
      <h3>Display</h3>
      <p className="muted small">Currency units used across dashboards, registers and KPIs.</p>
      <div className="create-row">
        <label>
          Currency format:{' '}
          <select aria-label="Currency format" value={fmt} onChange={(e) => choose(e.target.value as MoneyFormat)}>
            {MONEY_FORMATS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
          </select>
        </label>
        <span className="muted small" role="status">Sample: {formatMoney(sample, fmt)}</span>
      </div>
      <p className="muted small">Applies as you navigate; charts keep compact axes.</p>
    </div>
  );
}

function BackupRestore() {
  const [msg, setMsg] = useState('');

  function exportAll() {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('nlc-ecc.')) data[k] = localStorage.getItem(k)!;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nlc-ecc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    try {
      const data = JSON.parse(await file.text()) as Record<string, string>;
      Object.entries(data).forEach(([k, v]) => {
        if (k.startsWith('nlc-ecc.')) localStorage.setItem(k, v);
      });
      setMsg('Backup restored. Reload to see changes.');
    } catch {
      setMsg('Could not read that backup file.');
    }
  }

  function resetAll() {
    if (!confirm('Clear all local NLC-ECC data? This cannot be undone.')) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('nlc-ecc.')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    setMsg('All local data cleared. Reload to re-seed.');
  }

  return (
    <div className="card">
      <h3>Backup &amp; restore</h3>
      <p className="muted small">Local-mode data lives in your browser. Export a JSON snapshot, restore it, or reset to seeds.</p>
      <div className="create-row">
        <button className="btn" onClick={exportAll}>Export backup</button>
        <label className="btn-ghost" style={{ cursor: 'pointer' }}>
          Import backup
          <input type="file" accept="application/json" aria-label="Import backup" style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        <button className="btn-ghost" onClick={resetAll}>Reset to seeds</button>
      </div>
      {msg && <p className="muted small" role="status">{msg}</p>}
    </div>
  );
}

function PowersEditor() {
  const [powers, setLocal] = useState(getPowers());
  const [saved, setSaved] = useState(false);

  function update(role: string, value: string) {
    const n = value.trim() === '' ? null : Number(value.replace(/,/g, ''));
    setLocal((prev) => ({ ...prev, [role]: Number.isFinite(n as number) ? n : null }));
    setSaved(false);
  }
  function save() {
    setPowers(powers);
    setSaved(true);
  }
  function reset() {
    setLocal({ ...DEFAULT_POWERS });
    setPowers({ ...DEFAULT_POWERS });
    setSaved(true);
  }

  return (
    <div className="card">
      <h3>Financial powers</h3>
      <p className="muted small">Ceilings (PKR) used to gate procurement approvals. Blank = unlimited.</p>
      <table className="data-table" aria-label="Powers editor">
        <thead><tr><th>Role</th><th className="num">Ceiling (PKR)</th><th>=</th></tr></thead>
        <tbody>
          {Object.keys(DEFAULT_POWERS).map((r) => (
            <tr key={r}>
              <td>{ROLE_LABEL[r]}</td>
              <td className="num">
                <input className="qty-input" aria-label={`Power for ${r}`} style={{ width: 160 }}
                  value={powers[r] == null ? '' : String(powers[r])}
                  placeholder="unlimited"
                  onChange={(e) => update(r, e.target.value)} />
              </td>
              <td className="muted small">{powers[r] == null ? 'Unlimited' : formatMoney(powers[r] as number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="create-row">
        <button className="btn" onClick={save}>Save powers</button>
        <button className="btn-ghost" onClick={reset}>Reset defaults</button>
        {saved && <span className="pos small" role="status">Saved.</span>}
      </div>
    </div>
  );
}

function AuditLog() {
  const { provider } = useData();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  useEffect(() => {
    let a = true;
    provider.listAudit().then((e) => a && setEntries(e));
    return () => { a = false; };
  }, [provider]);

  return (
    <div className="card">
      <h3>Audit log</h3>
      <p className="muted small">Append-only record of workflow events (transitions and approvals).</p>
      {entries.length === 0 ? (
        <p className="muted">No events yet — advance an IPC, RAR, demand or payment to populate the trail.</p>
      ) : (
        <table className="data-table" aria-label="Audit log">
          <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Ref</th><th>Detail</th></tr></thead>
          <tbody>
            {entries.slice(0, 50).map((e) => (
              <tr key={e.id}>
                <td className="small">{new Date(e.at).toLocaleString()}</td>
                <td>{e.action}</td>
                <td>{e.entity}</td>
                <td>{e.ref}</td>
                <td className="muted small">{e.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

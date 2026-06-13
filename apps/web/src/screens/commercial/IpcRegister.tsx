import { useEffect, useState, Fragment } from 'react';
import { useData } from '../../data/DataContext';
import { downloadWorkbook } from '../../components/xlsxExport';
import { formatMoney } from '../../domain/money';
import { nextTransition, IPC_STATUS_LABEL, computeNet } from '../../domain/ipc';
import { computeDeductions, DEFAULT_DEDUCTION_SETTINGS } from '../../domain/deductions';
import { useBulkSelection } from '../../components/useBulkSelection';
import { ROLE_LABEL } from '../../domain/chains';
import { IpcDetailModal } from '../../components/IpcDetailModal';
import type { Ipc } from '../../data/types';

export function IpcRegister({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [detailIpc, setDetailIpc] = useState<Ipc | null>(null);
  const [period, setPeriod] = useState('');
  const [gross, setGross] = useState('');
  const [busy, setBusy] = useState(false);
  const [openIpc, setOpenIpc] = useState<string | null>(null);
  const [filer, setFiler] = useState(true);
  const sel = useBulkSelection();

  useEffect(() => {
    let alive = true;
    provider.listIpcs(projectId).then((x) => alive && setIpcs(x));
    return () => { alive = false; };
  }, [provider, projectId]);

  async function create() {
    const g = Number(gross.replace(/,/g, ''));
    if (!period.trim() || !Number.isFinite(g) || g <= 0 || busy) return;
    setBusy(true);
    try {
      const created = await provider.createIpc(projectId, { period: period.trim(), gross: g });
      setIpcs((prev) => [...prev, created]);
      setPeriod('');
      setGross('');
    } finally {
      setBusy(false);
    }
  }

  async function advance(ipc: Ipc) {
    const t = nextTransition(ipc.status);
    if (!t) return;
    const updated = await provider.transitionIpc(projectId, ipc.ipcNo, t.action);
    setIpcs((prev) => prev.map((i) => (i.ipcNo === updated.ipcNo ? updated : i)));
  }

  async function reverse(ipc: Ipc) {
    try {
      const updated = await provider.reverseIpc(projectId, ipc.ipcNo);
      setIpcs((prev) => prev.map((i) => (i.ipcNo === updated.ipcNo ? updated : i)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function advanceSelected() {
    const updates = await Promise.all(
      ipcs
        .filter((i) => sel.selected.has(i.ipcNo) && nextTransition(i.status))
        .map((i) => provider.transitionIpc(projectId, i.ipcNo, nextTransition(i.status)!.action)),
    );
    if (updates.length) {
      const byNo = new Map(updates.map((u) => [u.ipcNo, u]));
      setIpcs((prev) => prev.map((i) => byNo.get(i.ipcNo) ?? i));
      sel.clear();
    }
  }

  async function saveNote(ipc: Ipc, note: string) {
    if ((ipc.note ?? '') === note) return;
    const updated = await provider.setIpcNote(projectId, ipc.ipcNo, note);
    setIpcs((prev) => prev.map((i) => (i.ipcNo === updated.ipcNo ? updated : i)));
  }

  const advanceableSelected = ipcs.filter((i) => sel.selected.has(i.ipcNo) && nextTransition(i.status)).length;

  return (
    <div>
      {detailIpc && <IpcDetailModal projectId={projectId} ipc={detailIpc} onClose={() => setDetailIpc(null)} />}
      <div className="section-head">
        <h3>IPC register</h3>
        <div className="head-tools">
          <span className="muted">{ipcs.length} certificates</span>
          <button className="btn-ghost" onClick={() => void downloadWorkbook([{ name: 'IPC register', aoa: [
            ['IPC', 'Period', 'Status', 'Gross', 'Net payable', 'Cumulative'],
            ...ipcs.map((i) => [i.ipcNo, i.period, i.status, Math.round(i.gross), Math.round(i.netPayable), Math.round(i.cumGross)]),
          ] }], `${projectId}-ipc-register.xlsx`)}>Export Excel</button>
        </div>
      </div>

      <div className="card create-row">
        <input aria-label="IPC period" placeholder="Period (e.g. Jul-2026)" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <input aria-label="IPC gross amount" placeholder="Gross amount (PKR)" value={gross} onChange={(e) => setGross(e.target.value)} />
        <span className="muted small">
          {gross && Number(gross.replace(/,/g, '')) > 0
            ? `Net after deductions: ${formatMoney(computeNet(Number(gross.replace(/,/g, ''))))}`
            : 'Net computed from deductions'}
        </span>
        <button className="btn" onClick={create} disabled={busy}>New draft IPC</button>
      </div>

      {sel.count > 0 && (
        <div className="bulk-bar">
          <span>{sel.count} selected</span>
          <button className="btn" onClick={advanceSelected} disabled={advanceableSelected === 0}>
            Advance {advanceableSelected} eligible
          </button>
          <button className="btn-ghost" onClick={sel.clear}>Clear</button>
        </div>
      )}

      {ipcs.length === 0 ? (
        <p className="muted">No IPCs yet.</p>
      ) : (
        <table className="data-table" aria-label="IPC register">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all IPCs"
                  checked={sel.count === ipcs.length && ipcs.length > 0}
                  onChange={(e) => sel.setAll(ipcs.map((i) => i.ipcNo), e.target.checked)}
                />
              </th>
              <th>IPC</th>
              <th>Period</th>
              <th>Status</th>
              <th className="num">Gross</th>
              <th className="num">Net payable</th>
              <th className="num">Cumulative</th>
              <th>Action</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {ipcs.map((ipc) => {
              const t = nextTransition(ipc.status);
              return (
                <Fragment key={ipc.ipcNo}>
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${ipc.ipcNo}`}
                      checked={sel.selected.has(ipc.ipcNo)}
                      onChange={() => sel.toggle(ipc.ipcNo)}
                    />
                  </td>
                  <td>
                    <button className="btn-ghost" style={{ padding: '2px 7px', marginRight: 6 }} aria-label={`Deductions for ${ipc.ipcNo}`}
                      onClick={() => setOpenIpc(openIpc === ipc.ipcNo ? null : ipc.ipcNo)}>
                      {openIpc === ipc.ipcNo ? '▾' : '▸'}
                    </button>
                    <span>{ipc.ipcNo}</span>
                    <button className="btn-ghost" style={{ marginLeft: 8, padding: '1px 7px' }} aria-label={`Details for ${ipc.ipcNo}`}
                      onClick={() => setDetailIpc(ipc)}>Details</button>
                  </td>
                  <td>{ipc.period}</td>
                  <td><span className={`status-pill st-${ipc.status}`}>{IPC_STATUS_LABEL[ipc.status]}</span></td>
                  <td className="num">{formatMoney(ipc.gross)}</td>
                  <td className="num">{formatMoney(ipc.netPayable)}</td>
                  <td className="num">{formatMoney(ipc.cumGross)}</td>
                  <td>
                    {t ? <button className="btn-ghost" title={`Responsible: ${ROLE_LABEL[t.role] ?? t.role}`} onClick={() => advance(ipc)}>{t.label}</button> : <span className="muted small">—</span>}
                    {ipc.status !== 'draft' && (
                      <button className="btn-ghost" style={{ marginLeft: 6 }} aria-label={`Reverse ${ipc.ipcNo}`} title="Reverse last transition (audited)" onClick={() => reverse(ipc)}>↶</button>
                    )}
                  </td>
                  <td>
                    <input
                      className="note-input"
                      aria-label={`Note for ${ipc.ipcNo}`}
                      defaultValue={ipc.note ?? ''}
                      placeholder="Add note…"
                      onBlur={(e) => saveNote(ipc, e.target.value)}
                    />
                  </td>
                </tr>
                {openIpc === ipc.ipcNo && (() => {
                  const d = computeDeductions(ipc.gross, 0, { ...DEFAULT_DEDUCTION_SETTINGS, filer });
                  return (
                    <tr key={`${ipc.ipcNo}-ded`}>
                      <td colSpan={9}>
                        <div className="card" style={{ margin: '6px 0' }}>
                          <div className="section-head">
                            <h3>{ipc.ipcNo} — deduction waterfall</h3>
                            <label className="small">
                              <input type="checkbox" aria-label="Filer status" checked={filer} onChange={(e) => setFiler(e.target.checked)} /> Filer
                            </label>
                          </div>
                          <table className="data-table" aria-label={`Deductions ${ipc.ipcNo}`}>
                            <tbody>
                              <tr><td>Gross certified</td><td className="num">{formatMoney(d.gross)}</td></tr>
                              {d.lines.map((l) => (
                                <tr key={l.label}>
                                  <td>{l.label}{l.pct ? ` (${l.pct}%)` : ''}</td>
                                  <td className="num neg">− {formatMoney(l.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot><tr><td>Net payable</td><td className="num">{formatMoney(d.net)}</td></tr></tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  );
                })()}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

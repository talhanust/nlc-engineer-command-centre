import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { RarDetailModal } from '../../components/RarDetailModal';
import { downloadWorkbook } from '../../components/xlsxExport';
import { formatMoney } from '../../domain/money';
import { nextRarTransition, RAR_STATUS_LABEL, RAR_PIPELINE } from '../../domain/rar';
import { useBulkSelection } from '../../components/useBulkSelection';
import type { Rar, Subcontractor, Ipc, RarIpcLink } from '../../data/types';
import { useToast } from '../../components/Toast';

export function RarRegister({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [rars, setRars] = useState<Rar[]>([]);
  const [detailRar, setDetailRar] = useState<Rar | null>(null);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [links, setLinks] = useState<RarIpcLink[]>([]);
  const [fSub, setFSub] = useState('all');
  const [fStage, setFStage] = useState('all');
  const sel = useBulkSelection();

  useEffect(() => {
    let alive = true;
    Promise.all([
      provider.listRars(projectId),
      provider.listSubcontractors(projectId),
      provider.listIpcs(projectId),
      provider.listRarIpcLinks(projectId),
    ]).then(([r, s, i, l]) => {
      if (!alive) return;
      setRars(r);
      setSubs(s);
      setIpcs(i);
      setLinks(l);
    });
    return () => {
      alive = false;
    };
  }, [provider, projectId]);

  const subName = useMemo(() => {
    const m = new Map(subs.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? id;
  }, [subs]);

  async function advance(rar: Rar) {
    const t = nextRarTransition(rar.status);
    if (!t) return;
    const updated = await provider.transitionRar(projectId, rar.rarNo, t.action);
    setRars((prev) => prev.map((r) => (r.rarNo === updated.rarNo ? updated : r)));
    toast({ message: `${updated.rarNo} → ${RAR_STATUS_LABEL[updated.status]}`, kind: 'success' });
  }

  async function advanceSelected() {
    const updates = await Promise.all(
      rars
        .filter((r) => sel.selected.has(r.rarNo) && nextRarTransition(r.status))
        .map((r) => provider.transitionRar(projectId, r.rarNo, nextRarTransition(r.status)!.action)),
    );
    if (updates.length) {
      const byNo = new Map(updates.map((u) => [u.rarNo, u]));
      setRars((prev) => prev.map((r) => byNo.get(r.rarNo) ?? r));
      sel.clear();
    }
  }

  async function saveNote(rar: Rar, note: string) {
    if ((rar.note ?? '') === note) return;
    const updated = await provider.setRarNote(projectId, rar.rarNo, note);
    setRars((prev) => prev.map((r) => (r.rarNo === updated.rarNo ? updated : r)));
  }

  const advanceableSelected = rars.filter((r) => sel.selected.has(r.rarNo) && nextRarTransition(r.status)).length;

  const shown = useMemo(() => rars.filter((r) => (fSub === 'all' || r.subcontractorId === fSub) && (fStage === 'all' || r.status === fStage)), [rars, fSub, fStage]);
  const totalGross = shown.reduce((s, r) => s + r.gross, 0);
  const totalPaid = shown.filter((r) => r.status === 'paid').reduce((s, r) => s + r.netPayable, 0);

  return (
    <div>
      {detailRar && <RarDetailModal projectId={projectId} rar={detailRar} onClose={() => setDetailRar(null)} />}
      <div className="section-head">
        <div>
          <h3>RAR Register <span className="muted" style={{ fontWeight: 400 }}>(Subcontractor &amp; Labour Billing)</span></h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>All Running Account Receipts issued · 6-stage pipeline (draft → validated → verified → approved → marked → paid).</p>
        </div>
        <div className="head-tools">
          <button className="btn-ghost" disabled={rars.length === 0}
            onClick={() => void downloadWorkbook([{ name: 'RAR register', aoa: [
              ['RAR', 'Period', 'Subcontractor', 'Status', 'Gross', 'Net payable'],
              ...rars.map((r) => [r.rarNo, r.period, subName(r.subcontractorId), r.status, Math.round(r.gross), Math.round(r.netPayable)]),
            ] }], `${projectId}-rar-register.xlsx`)}>Export Excel</button>
        </div>
      </div>

      <div className="filter-bar card" role="group" aria-label="RAR filter">
        <span className="muted small" style={{ fontWeight: 600 }}>Filter</span>
        <select aria-label="Filter contractor" value={fSub} onChange={(e) => setFSub(e.target.value)}>
          <option value="all">All Contractors</option>
          {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Filter stage" value={fStage} onChange={(e) => setFStage(e.target.value)}>
          <option value="all">All Stages</option>
          {RAR_PIPELINE.map((st) => <option key={st} value={st}>{RAR_STATUS_LABEL[st]}</option>)}
        </select>
        <span className="muted small filter-count">{shown.length} RARs · GROSS {formatMoney(totalGross)} · PAID {formatMoney(totalPaid)}</span>
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

      {shown.length === 0 ? (
        <div className="empty-state card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36 }}>📋</div>
          <h4 style={{ margin: '8px 0 4px' }}>{rars.length === 0 ? 'No RARs yet' : 'No RARs match the filter'}</h4>
          <p className="muted small" style={{ margin: 0 }}>{rars.length === 0 ? 'Generate the first RAR from the "Generate RAR" tab.' : 'Try a different contractor or stage.'}</p>
        </div>
      ) : (
        <table className="data-table" aria-label="RAR register">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all RARs"
                  checked={sel.count === shown.length && shown.length > 0}
                  onChange={(e) => sel.setAll(shown.map((r) => r.rarNo), e.target.checked)}
                />
              </th>
              <th>RAR</th>
              <th>Period</th>
              <th>Subcontractor</th>
              <th>Status</th>
              <th className="num">Gross</th>
              <th className="num">Net</th>
              <th>Action</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((rar) => {
              const t = nextRarTransition(rar.status);
              return (
                <tr key={rar.rarNo}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${rar.rarNo}`}
                      checked={sel.selected.has(rar.rarNo)}
                      onChange={() => sel.toggle(rar.rarNo)}
                    />
                  </td>
                  <td>{rar.rarNo}
                    <button className="btn-ghost" style={{ marginLeft: 8, padding: '1px 7px' }} aria-label={`Details for ${rar.rarNo}`}
                      onClick={() => setDetailRar(rar)}>Details</button>
                  </td>
                  <td>{rar.period}</td>
                  <td>{subName(rar.subcontractorId)}</td>
                  <td><span className={`status-pill st-${rar.status}`}>{RAR_STATUS_LABEL[rar.status]}</span></td>
                  <td className="num">{formatMoney(rar.gross)}</td>
                  <td className="num">{formatMoney(rar.netPayable)}</td>
                  <td>
                    {t ? (
                      <button className="btn-ghost" onClick={() => advance(rar)}>{t.label}</button>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <td>
                    <input
                      className="note-input"
                      aria-label={`Note for ${rar.rarNo}`}
                      defaultValue={rar.note ?? ''}
                      placeholder="Add note…"
                      onBlur={(e) => saveNote(rar, e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <RecoveryLinks
        projectId={projectId}
        rars={rars}
        ipcs={ipcs}
        links={links}
        onAdded={(l) => setLinks((prev) => [...prev, l])}
      />
    </div>
  );
}

function RecoveryLinks({
  projectId,
  rars,
  ipcs,
  links,
  onAdded,
}: {
  projectId: string;
  rars: Rar[];
  ipcs: Ipc[];
  links: RarIpcLink[];
  onAdded: (l: RarIpcLink) => void;
}) {
  const { provider } = useData();
  const [rarId, setRarId] = useState('');
  const [ipcId, setIpcId] = useState('');
  const [amount, setAmount] = useState('');

  const rarNo = (id: string) => rars.find((r) => r.id === id)?.rarNo ?? id;
  const ipcNo = (id: string) => ipcs.find((i) => i.id === id)?.ipcNo ?? id;

  async function add() {
    const a = Number(amount.replace(/,/g, ''));
    if (!rarId || !ipcId || !Number.isFinite(a) || a <= 0) return;
    const link = await provider.addRarIpcLink(projectId, { rarId, ipcId, amount: a });
    onAdded(link);
    setAmount('');
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>RAR ↔ IPC recovery links</h3>
      <p className="muted small">
        Record amounts recovered from a subcontractor RAR against a client IPC.
      </p>
      <div className="create-row">
        <select aria-label="Recovery RAR" value={rarId} onChange={(e) => setRarId(e.target.value)}>
          <option value="">Select RAR</option>
          {rars.map((r) => (<option key={r.id} value={r.id}>{r.rarNo}</option>))}
        </select>
        <select aria-label="Recovery IPC" value={ipcId} onChange={(e) => setIpcId(e.target.value)}>
          <option value="">Select IPC</option>
          {ipcs.map((i) => (<option key={i.id} value={i.id}>{i.ipcNo}</option>))}
        </select>
        <input aria-label="Recovery amount" placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={add}>Link recovery</button>
      </div>
      {links.length > 0 && (
        <table className="data-table" aria-label="Recovery links" style={{ marginTop: 10 }}>
          <thead><tr><th>RAR</th><th>IPC</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}><td>{rarNo(l.rarId)}</td><td>{ipcNo(l.ipcId)}</td><td className="num">{formatMoney(l.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

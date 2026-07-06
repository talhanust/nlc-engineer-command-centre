import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { RarDetailModal } from '../../components/RarDetailModal';
import { ExportMenu } from '../../components/ExportMenu';
import { SavedViews } from '../../components/SavedViews';
import { formatMoney } from '../../domain/money';
import { nextRarTransition, RAR_STATUS_LABEL, RAR_PIPELINE } from '../../domain/rar';
import { ChainStatus, ChainControls } from '../../components/ApptChainControls';
import { useSort } from '../../components/useSort';
import { rarCertificate } from '../../domain/certificate';
import { ROLE_LABEL } from '../../domain/chains';
import { useRole } from '../../state/Role';
import { downloadCertificatePdf } from '../../components/certificatePdf';
import { SortTh } from '../../components/SortTh';
import { useBulkSelection } from '../../components/useBulkSelection';
import type { Rar, Subcontractor, BoqItem, Contract } from '../../data/types';
import { useToast } from '../../components/Toast';

export function RarRegister({ projectId }: { projectId: string }) {
  const { provider, projects, nodes } = useData();
  const { toast } = useToast();
  const { can, role, user } = useRole();
  const [rars, setRars] = useState<Rar[]>([]);
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [detailRar, setDetailRar] = useState<Rar | null>(null);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [fSub, setFSub] = useState('all');
  const [fStage, setFStage] = useState('all');
  const sel = useBulkSelection();

  useEffect(() => {
    let alive = true;
    Promise.all([
      provider.listRars(projectId),
      provider.listSubcontractors(projectId),
      provider.listBoq(projectId),
      provider.listContracts(projectId),
    ]).then(([r, s, b, c]) => {
      if (!alive) return;
      setRars(r);
      setSubs(s);
      setBoq(b);
      setContracts(c);
    });
    return () => {
      alive = false;
    };
  }, [provider, projectId]);

  const subName = useMemo(() => {
    const m = new Map(subs.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? id;
  }, [subs]);

  function patchRar(updated: Rar) {
    setRars((prev) => prev.map((r) => (r.rarNo === updated.rarNo ? updated : r)));
  }
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
  const boqById = useMemo(() => new Map(boq.map((b) => [b.id, b])), [boq]);
  const projectName = nodes.find((n) => n.id === projectId)?.name ?? projectId;
  const client = projects.find((p) => p.id === projectId)?.clientName ?? 'Client';
  async function pdf(rar: Rar) { await downloadCertificatePdf(rarCertificate(rar, { projectName, client, subName: subName(rar.subcontractorId), boqById })); }
  const { sorted, sort, toggle } = useSort(shown, {
    period: (r) => r.period,
    sub: (r) => subName(r.subcontractorId),
    status: (r) => r.status,
    gross: (r) => r.gross,
    net: (r) => r.netPayable,
  });
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
          <ExportMenu
            filename={`${projectId.replace('proj-', '')}-rar-register`}
            title="RAR Register"
            subtitle="Subcontractor & labour billing"
            meta={[['RARs', String(rars.length)], ['Gross', formatMoney(totalGross)], ['Paid', formatMoney(totalPaid)]]}
            columns={[
              { label: 'RAR' }, { label: 'Period' }, { label: 'Contract' }, { label: 'Subcontractor' },
              { label: 'Status' }, { label: 'Gross', align: 'right' }, { label: 'Net payable', align: 'right' },
            ]}
            rows={rars.map((r) => [
              r.rarNo, r.period, contracts.find((c) => c.id === r.contractId)?.contractNo ?? '—',
              subName(r.subcontractorId), RAR_STATUS_LABEL[r.status], Math.round(r.gross), Math.round(r.netPayable),
            ])}
          />
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
        <SavedViews
          scope={`rar:${projectId}`}
          current={{ sub: fSub, stage: fStage }}
          onApply={(f) => { setFSub(f.sub ?? 'all'); setFStage(f.stage ?? 'all'); }}
        />
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
              <SortTh k="period" label="Period" sort={sort} toggle={toggle} />
              <SortTh k="sub" label="Subcontractor" sort={sort} toggle={toggle} />
              <SortTh k="status" label="Status" sort={sort} toggle={toggle} />
              <SortTh k="gross" label="Gross" sort={sort} toggle={toggle} className="num" />
              <SortTh k="net" label="Net" sort={sort} toggle={toggle} className="num" />
              <th>Action</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((rar) => {
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
                    <button className="btn-ghost" style={{ marginLeft: 6, padding: '1px 7px' }} aria-label={`Certificate for ${rar.rarNo}`}
                      onClick={() => pdf(rar)}>PDF</button>
                  </td>
                  <td>{rar.period}</td>
                  <td>{subName(rar.subcontractorId)}</td>
                  <td>
                    <span className={`status-pill st-${rar.status}`}>{RAR_STATUS_LABEL[rar.status]}</span>
                    <ChainStatus chain={rar.chain} refNo={rar.rarNo} />
                  </td>
                  <td className="num">{formatMoney(rar.gross)}</td>
                  <td className="num">{formatMoney(rar.netPayable)}</td>
                  <td>
                    {/* Spec §5 appointment ladder (incl. Pre-Audit). Legacy quick-advance remains until migration completes. */}
                    {!rar.chain && rar.status === 'draft' && (
                      <button className="btn btn-mini" aria-label={`Submit ${rar.rarNo} for approval`}
                        onClick={async () => patchRar(await provider.submitRarApproval(projectId, rar.rarNo, user?.name ?? role))}>
                        Submit (chain)
                      </button>
                    )}
                    <ChainControls chain={rar.chain} refNo={rar.rarNo} me={user?.appointmentId} isAdmin={role === 'admin'}
                      canResubmit={['sqs', 'contract_engr', 'spm']}
                      onAct={async () => patchRar(await provider.actOnRar(projectId, rar.rarNo, user?.name ?? role))}
                      onReturn={async (rm) => patchRar(await provider.returnRar(projectId, rar.rarNo, user?.name ?? role, rm))}
                      onResubmit={async () => patchRar(await provider.resubmitRar(projectId, rar.rarNo, user?.name ?? role))}
                    />
                    {!rar.chain && t ? (
                      <button className="btn-ghost" disabled={!can(t.role)} title={can(t.role) ? `Responsible: ${ROLE_LABEL[t.role] ?? t.role}` : `Requires ${ROLE_LABEL[t.role] ?? t.role}`} onClick={() => advance(rar)}>{t.label}</button>
                    ) : !rar.chain ? (
                      <span className="muted small">—</span>
                    ) : null}
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
    </div>
  );
}

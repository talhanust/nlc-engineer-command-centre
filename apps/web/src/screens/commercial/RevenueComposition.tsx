import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { buildBoqRows, boqTotals } from '../../domain/boqrollup';
import { ipcVettedPaidByItem } from '../../domain/ipc';
import { revenueComposition, isAdvanceReceipt } from '../../domain/revenue';
import { IPC_STATUS_LABEL } from '../../domain/ipc';
import type {
  BoqItem, Distribution, ProgressUpdate, Ipc, Rar, Epc, FinancialReceipt, CommercialConfig,
} from '../../data/types';
import { DEFAULT_COMMERCIAL_CONFIG } from '../../domain/ipc';

const CERTIFIED: Ipc['status'][] = ['vetted', 'forwarded_to_client', 'approved', 'paid_pending_ack', 'paid'];

export function RevenueComposition({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [boq, setBoq] = useState<BoqItem[]>([]);
  const [dists, setDists] = useState<Distribution[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [ipcs, setIpcs] = useState<Ipc[]>([]);
  const [rars, setRars] = useState<Rar[]>([]);
  const [epcs, setEpcs] = useState<Epc[]>([]);
  const [receipts, setReceipts] = useState<FinancialReceipt[]>([]);
  const [cfg, setCfg] = useState<CommercialConfig>(DEFAULT_COMMERCIAL_CONFIG);
  const [drill, setDrill] = useState<'billed' | 'vetted' | 'receipts' | null>(null);

  useEffect(() => {
    let on = true;
    Promise.all([
      provider.listBoq(projectId), provider.listDistributions(projectId), provider.listProgress(projectId),
      provider.listIpcs(projectId), provider.listRars(projectId), provider.listEpcs(projectId),
      provider.listReceipts(projectId), provider.getCommercialConfig(projectId),
    ]).then(([b, d, p, i, r, e, rc, c]) => {
      if (!on) return;
      setBoq(b); setDists(d); setProgress(p); setIpcs(i); setRars(r); setEpcs(e); setReceipts(rc); setCfg(c);
    });
    return () => { on = false; };
  }, [provider, projectId]);

  const codeOf = useMemo(() => Object.fromEntries(boq.map((b) => [b.id, `${b.code} · ${b.description}`])), [boq]);

  const comp = useMemo(() => {
    const vp = ipcVettedPaidByItem(ipcs);
    const rows = buildBoqRows(boq, dists, progress, { vetted: vp.vetted, paid: vp.paid });
    const t = boqTotals(rows);
    const escalation = epcs.reduce((a, e) => a + e.amount, 0);
    const billed = ipcs.reduce((a, i) => a + i.gross, 0);
    const advances = receipts.filter((r) => isAdvanceReceipt(r.source)).reduce((a, r) => a + r.amount, 0);
    const receiptsTotal = receipts.reduce((a, r) => a + r.amount, 0);
    return revenueComposition({
      executed: t.executedValue, vetted: t.vettedValue, billed, escalation, receiptsTotal, advances, cfg,
    });
  }, [boq, dists, progress, ipcs, epcs, receipts, cfg]);

  const certifiedIpcs = ipcs.filter((i) => CERTIFIED.includes(i.status));

  return (
    <div className="stack-lg">
      <section className="card" aria-label="Revenue composition">
        <div className="section-head"><h3>Gross revenue composition</h3>
          <span className="muted small">executed work + escalation, certified to net</span>
        </div>

        <div className="rev-waterfall" role="table" aria-label="Revenue waterfall">
          <Row label="Executed work (IPC)" value={comp.executed} drill onClick={() => setDrill('billed')} />
          <Row label="+ Price escalation (EPC)" value={comp.escalation} muted={comp.escalation === 0} />
          <Row label="= Gross revenue" value={comp.gross} strong divider />
          <Row label={`− Retention @ ${cfg.ipcRetentionPct}%`} value={-comp.retention} neg />
          <Row label={`− Income tax @ ${cfg.incomeTaxPct}%`} value={-comp.incomeTax} neg />
          {cfg.gstPct > 0 && <Row label={`− GST / stamp @ ${cfg.gstPct}%`} value={-comp.gst} neg />}
          <Row label="= Net certified" value={comp.netCertified} strong divider />
          <Row label="Receipts (cash, excl. advances)" value={comp.receipts} drill onClick={() => setDrill('receipts')} />
        </div>

        <div className="rev-side" aria-label="Revenue side facts">
          <Fact label="Vetted (certified)" value={comp.vetted} onClick={() => setDrill('vetted')} drill />
          <Fact label="Billed to date" value={comp.billed} onClick={() => setDrill('billed')} drill />
          <Fact label="Slippage (Executed − Vetted)" value={comp.slippage} accent={comp.slippage > 0} />
          <Fact label="Advances (excluded)" value={comp.advances} muted />
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Advances are financing, not executed revenue, so they're shown separately and excluded from the chain.
          Slippage is executed work not yet vetted.
        </p>
      </section>

      {drill && (
        <section className="card" aria-label={`${drill} breakdown`}>
          <div className="section-head">
            <h3>{drill === 'billed' ? 'Billed — IPC → BOQ line' : drill === 'vetted' ? 'Vetted — IPC → BOQ line' : 'Receipts'}</h3>
            <button className="btn-ghost btn-mini" onClick={() => setDrill(null)} aria-label="Close breakdown">Close ✕</button>
          </div>

          {drill === 'receipts' ? (
            <table className="data-table" aria-label="Receipts breakdown">
              <thead><tr><th>Month</th><th>Source</th><th>Type</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>{r.month}</td><td>{r.source}</td>
                    <td>{isAdvanceReceipt(r.source) ? <span className="pill st-draft">Advance</span> : <span className="pill st-verified">Revenue</span>}</td>
                    <td className="num">{formatMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <IpcDrill ipcs={drill === 'vetted' ? certifiedIpcs : ipcs} rars={rars} codeOf={codeOf} showRars={false} />
          )}
        </section>
      )}
    </div>
  );
}

function IpcDrill({ ipcs, rars, codeOf, showRars }: { ipcs: Ipc[]; rars: Rar[]; codeOf: Record<string, string>; showRars: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <table className="data-table" aria-label="Certificate breakdown">
      <thead><tr><th></th><th>Certificate</th><th>Period</th><th>Status</th><th className="num">Gross</th></tr></thead>
      <tbody>
        {ipcs.map((i) => (
          <CertRows key={i.id} id={i.ipcNo} period={i.period} status={IPC_STATUS_LABEL[i.status] ?? i.status} gross={i.gross}
            lines={(i.lines ?? []).map((l) => ({ label: codeOf[l.boqItemId] ?? l.boqItemId, qty: l.qty, amount: l.amount }))}
            open={open === i.ipcNo} onToggle={() => setOpen(open === i.ipcNo ? null : i.ipcNo)} />
        ))}
        {showRars && rars.map((r) => (
          <CertRows key={r.id} id={r.rarNo} period={r.period} status={r.status} gross={r.gross} kind="RAR"
            lines={(r.lines ?? []).map((l) => ({ label: codeOf[l.boqItemId] ?? l.boqItemId, qty: l.qty, amount: l.amount }))}
            open={open === r.rarNo} onToggle={() => setOpen(open === r.rarNo ? null : r.rarNo)} />
        ))}
      </tbody>
    </table>
  );
}

function CertRows({ id, period, status, gross, lines, open, onToggle, kind }: {
  id: string; period: string; status: string; gross: number;
  lines: { label: string; qty: number; amount: number }[]; open: boolean; onToggle: () => void; kind?: string;
}) {
  return (
    <>
      <tr>
        <td><button className="btn-ghost btn-mini" aria-label={`Expand ${id}`} onClick={onToggle}>{open ? '▾' : '▸'}</button></td>
        <td>{id}{kind && <span className="pill st-draft" style={{ marginLeft: 6 }}>{kind}</span>}</td>
        <td>{period}</td><td className="small">{status}</td>
        <td className="num">{formatMoney(gross)}</td>
      </tr>
      {open && lines.length === 0 && (
        <tr><td></td><td colSpan={4} className="muted small">No line detail recorded.</td></tr>
      )}
      {open && lines.map((l, k) => (
        <tr key={k} className="drill-line">
          <td></td><td colSpan={2}>{l.label}</td>
          <td className="num small">{l.qty.toLocaleString('en-PK')}</td>
          <td className="num">{formatMoney(l.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function Row({ label, value, neg, strong, muted, divider, drill, onClick }: {
  label: string; value: number; neg?: boolean; strong?: boolean; muted?: boolean; divider?: boolean; drill?: boolean; onClick?: () => void;
}) {
  return (
    <div className={`rev-row${strong ? ' strong' : ''}${divider ? ' divider' : ''}`} role="row">
      <span role="cell" className={muted ? 'muted' : undefined}>
        {drill ? <button className="link-btn" onClick={onClick} aria-label={`Drill into ${label}`}>{label}</button> : label}
      </span>
      <span role="cell" className={`num${neg ? ' neg' : ''}`}>{formatMoney(value)}</span>
    </div>
  );
}

function Fact({ label, value, accent, muted, drill, onClick }: {
  label: string; value: number; accent?: boolean; muted?: boolean; drill?: boolean; onClick?: () => void;
}) {
  return (
    <div className={`rev-fact${accent ? ' accent' : ''}`}>
      <span className="muted small">{drill ? <button className="link-btn" onClick={onClick}>{label}</button> : label}</span>
      <strong className={muted ? 'muted' : undefined}>{formatMoney(value)}</strong>
    </div>
  );
}

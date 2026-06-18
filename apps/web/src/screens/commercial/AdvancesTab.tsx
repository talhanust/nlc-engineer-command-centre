import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useToast } from '../../components/Toast';
import { downloadWorkbook } from '../../components/xlsxExport';
import { formatMoney } from '../../domain/money';
import { advanceSummary, bgExpiryStatus, BG_EXPIRY_LABEL, bgActiveCover } from '../../domain/advances';
import type { Advance, BankGuarantee, Subcontractor } from '../../data/types';

type Kind = Advance['kind'];
type View = 'receipts' | 'disbursements' | 'bg';
const KIND_LABEL: Record<Kind, string> = { mob: 'Mobilisation Advance', secure: 'Secure Advance (Material)' };
const money = (n: number) => (n > 0 ? formatMoney(n) : '0');

export function AdvancesTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const { toast } = useToast();
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [bgs, setBgs] = useState<BankGuarantee[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [kind, setKind] = useState<Kind>('mob');
  const [view, setView] = useState<View>('receipts');

  async function load() {
    const [a, b, s] = await Promise.all([provider.listAdvances(projectId), provider.listBankGuarantees(projectId), provider.listSubcontractors(projectId)]);
    setAdvances(a); setBgs(b); setSubs(s);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const subName = useMemo(() => { const m = new Map(subs.map((s) => [s.id, s.name])); return (id?: string) => (id ? m.get(id) ?? id : '—'); }, [subs]);
  const sum = useMemo(() => advanceSummary(advances, kind), [advances, kind]);
  const cover = useMemo(() => bgActiveCover(bgs, kind), [bgs, kind]);

  const receipts = advances.filter((a) => a.kind === kind && a.direction === 'client_receipt');
  const disbursements = advances.filter((a) => a.kind === kind && a.direction === 'sub_disbursement');
  const kindBgs = bgs.filter((b) => b.kind === kind);

  return (
    <div>
      <div className="section-head">
        <div>
          <h3>Advances Ledger</h3>
          <p className="muted small" style={{ margin: '2px 0 0' }}>Two-sided ledgers for Mobilisation (against contract) and Secure (against material procurement) advances. Recovery happens through IPCs and RARs.</p>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Advance kind" style={{ marginBottom: 14 }}>
        {(['mob', 'secure'] as Kind[]).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={`seg-btn${kind === k ? ' active' : ''}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
        ))}
      </div>

      <div className="kpi-row" aria-label="Advance summary">
        <Kpi label="Received from client" value={money(sum.received)} sub={`${receipts.length} receipts`} />
        <Kpi label="Recovered (client)" value={money(sum.recovered)} sub="via IPCs" />
        <Kpi label="Outstanding (client → NLC)" value={money(sum.outstandingClient)} sub="recoverable in future IPCs" />
        <Kpi label="Disbursed to S/C" value={money(sum.disbursed)} sub={`${disbursements.length} disbursements`} />
        <Kpi label="Outstanding (S/C → NLC)" value={money(sum.outstandingSub)} sub="recoverable from future RARs" />
        <Kpi label="Active BG cover" value={money(cover)} sub={`${kindBgs.filter((b) => b.status === 'active').length} guarantees`} />
      </div>

      <div className="seg" role="tablist" aria-label="Ledger view" style={{ margin: '14px 0' }}>
        <button role="tab" aria-selected={view === 'receipts'} className={`seg-btn${view === 'receipts' ? ' active' : ''}`} onClick={() => setView('receipts')}>Client Receipts (FGEHA → NLC)</button>
        <button role="tab" aria-selected={view === 'disbursements'} className={`seg-btn${view === 'disbursements' ? ' active' : ''}`} onClick={() => setView('disbursements')}>Subcontractor Disbursements (NLC → S/C)</button>
        <button role="tab" aria-selected={view === 'bg'} className={`seg-btn${view === 'bg' ? ' active' : ''}`} onClick={() => setView('bg')}>Bank Guarantees</button>
      </div>

      {view === 'receipts' && <Ledger title="Client receipts" rows={receipts} subName={subName} showSub={false}
        onAdd={async (amount) => { await provider.addAdvance(projectId, { kind, direction: 'client_receipt', amount, dated: new Date().toISOString().slice(0, 10) }); await load(); toast({ message: `Receipt recorded · ${formatMoney(amount)}`, kind: 'success' }); }}
        addLabel="New Client Receipt" subs={subs} />}

      {view === 'disbursements' && <Ledger title="Subcontractor disbursements" rows={disbursements} subName={subName} showSub
        onAdd={async (amount, subId) => { await provider.addAdvance(projectId, { kind, direction: 'sub_disbursement', subcontractorId: subId || undefined, amount, dated: new Date().toISOString().slice(0, 10) }); await load(); toast({ message: `Disbursement recorded · ${formatMoney(amount)}`, kind: 'success' }); }}
        addLabel="New Disbursement" subs={subs} />}

      {view === 'bg' && <BgRegister rows={kindBgs} subName={subName} subs={subs}
        onAdd={async (bg) => { await provider.addBankGuarantee(projectId, { ...bg, kind }); await load(); toast({ message: `BG ${bg.bgNo} registered`, kind: 'success' }); }}
        onStatus={async (id, status) => { setBgs(await provider.setBankGuaranteeStatus(projectId, id, status)); }} />}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

function Ledger({ title, rows, onAdd, addLabel, showSub, subName, subs }: {
  title: string; rows: Advance[]; onAdd: (amount: number, subId?: string) => Promise<void>; addLabel: string;
  showSub: boolean; subName: (id?: string) => string; subs: Subcontractor[];
}) {
  const [amount, setAmount] = useState('');
  const [subId, setSubId] = useState('');
  async function submit() {
    const a = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(a) || a <= 0) return;
    await onAdd(a, subId || undefined);
    setAmount(''); setSubId('');
  }
  return (
    <div>
      <div className="card create-row">
        {showSub && (
          <select aria-label="Disbursement subcontractor" value={subId} onChange={(e) => setSubId(e.target.value)}>
            <option value="">Select subcontractor</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <input aria-label={`${addLabel} amount`} placeholder="Amount (PKR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn" onClick={submit}>+ {addLabel}</button>
        <button className="btn-ghost" style={{ marginLeft: 'auto' }} disabled={rows.length === 0}
          onClick={() => void downloadWorkbook([{ name: title, aoa: [['Date', 'Subcontractor', 'Amount'], ...rows.map((r) => [r.dated, subName(r.subcontractorId), Math.round(r.amount)])] }], 'advances.xlsx')}>Export</button>
      </div>
      {rows.length === 0 ? <p className="muted">No {title.toLowerCase()} yet.</p> : (
        <table className="data-table" aria-label={title}>
          <thead><tr><th>Date</th>{showSub && <th>Subcontractor</th>}<th className="num">Amount</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.dated}</td>{showSub && <td>{subName(r.subcontractorId)}</td>}<td className="num">{formatMoney(r.amount)}</td></tr>
            ))}
            <tr className="boq-total-row"><td colSpan={showSub ? 2 : 1}><strong>Total</strong></td><td className="num"><strong>{formatMoney(rows.reduce((s, r) => s + r.amount, 0))}</strong></td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function BgRegister({ rows, onAdd, onStatus, subName, subs }: {
  rows: BankGuarantee[]; onAdd: (bg: Omit<BankGuarantee, 'id' | 'projectId' | 'kind'>) => Promise<void>;
  onStatus: (id: string, status: BankGuarantee['status']) => Promise<void>; subName: (id?: string) => string; subs: Subcontractor[];
}) {
  const [form, setForm] = useState({ party: 'client' as BankGuarantee['party'], subcontractorId: '', bgNo: '', bank: '', amount: '', issued: '', expires: '' });
  async function submit() {
    const a = Number(form.amount.replace(/,/g, ''));
    if (!form.bgNo.trim() || !form.bank.trim() || !Number.isFinite(a) || a <= 0) return;
    await onAdd({ party: form.party, subcontractorId: form.party === 'sub' ? form.subcontractorId || undefined : undefined, bgNo: form.bgNo.trim(), bank: form.bank.trim(), amount: a, issued: form.issued || undefined, expires: form.expires || undefined, status: 'active' });
    setForm({ party: 'client', subcontractorId: '', bgNo: '', bank: '', amount: '', issued: '', expires: '' });
  }
  return (
    <div>
      <div className="card create-row" style={{ flexWrap: 'wrap' }}>
        <select aria-label="BG party" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value as BankGuarantee['party'] })}>
          <option value="client">Client (NLC → FGEHA)</option>
          <option value="sub">Subcontractor (S/C → NLC)</option>
        </select>
        {form.party === 'sub' && (
          <select aria-label="BG subcontractor" value={form.subcontractorId} onChange={(e) => setForm({ ...form, subcontractorId: e.target.value })}>
            <option value="">Select subcontractor</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <input aria-label="BG number" placeholder="BG no." value={form.bgNo} onChange={(e) => setForm({ ...form, bgNo: e.target.value })} />
        <input aria-label="BG bank" placeholder="Bank" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
        <input aria-label="BG amount" placeholder="Amount (PKR)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input type="date" aria-label="BG expiry" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
        <button className="btn" onClick={submit}>+ Register BG</button>
      </div>
      {rows.length === 0 ? <p className="muted">No bank guarantees registered.</p> : (
        <table className="data-table" aria-label="Bank guarantees">
          <thead><tr><th>BG no.</th><th>Bank</th><th>Party</th><th className="num">Amount</th><th>Expires</th><th>Validity</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => {
              const exp = bgExpiryStatus(b.expires);
              return (
                <tr key={b.id} className={exp === 'expired' ? 'row-flag' : ''}>
                  <td className="mono small">{b.bgNo}</td>
                  <td>{b.bank}</td>
                  <td className="small">{b.party === 'sub' ? subName(b.subcontractorId) : 'Client'}</td>
                  <td className="num">{formatMoney(b.amount)}</td>
                  <td className="small">{b.expires ?? '—'}</td>
                  <td><span className={`expiry-badge st-${exp}`}>{BG_EXPIRY_LABEL[exp]}</span></td>
                  <td>{b.status === 'active' ? <span className="status-pill st-vetted">Active</span> : <span className="status-pill st-paid">{b.status}</span>}</td>
                  <td>{b.status === 'active' && <button className="btn-ghost btn-mini" aria-label={`Release ${b.bgNo}`} onClick={() => onStatus(b.id, 'released')}>Release</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

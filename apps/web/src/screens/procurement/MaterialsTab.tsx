import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { formatMoney } from '../../domain/money';
import { materialRegister, type MaterialRegister } from '../../domain/materialRegister';
import { materialLedger } from '../../domain/materialLedger';
import type { Crv, Demand, PurchaseOrder, MaterialIssue, BoqItem, Subcontractor } from '../../data/types';

/**
 * Material stores register — the procurement-side system of record for materials:
 * quantity & value received (from CRVs, valued at the demand rate), issued /
 * consumed (recorded here), and balance on hand, with the BOQ items each material
 * was procured for. Issuance entered here flows to recovery (Mapping) and the
 * reconciliation (Execution) through the shared MaterialIssue store. Wires
 * Demand -> PO -> CRV -> Issue across Procurement, Mapping and Commercial.
 */
export function MaterialsTab({ projectId }: { projectId: string }) {
  const { provider } = useData();
  const [reg, setReg] = useState<MaterialRegister | null>(null);
  const [boq, setBoq] = useState<Map<string, BoqItem>>(new Map());
  const [issues, setIssues] = useState<MaterialIssue[]>([]);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [raw, setRaw] = useState<{ crvs: Crv[]; demands: Demand[]; pos: PurchaseOrder[] }>({ crvs: [], demands: [], pos: [] });
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // issue/consumption form
  const [dated, setDated] = useState('2026-06-09');
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('');
  const [to, setTo] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [crvs, demands, pos, iss, items, sc] = await Promise.all([
      provider.listCrvs(projectId),
      provider.listDemands(projectId),
      provider.listPurchaseOrders(projectId),
      provider.listMaterialIssues(projectId),
      provider.listBoq(projectId),
      provider.listSubcontractors(projectId),
    ]);
    setReg(materialRegister(crvs, demands, pos, iss));
    setIssues(iss);
    setBoq(new Map(items.map((i) => [i.id, i])));
    setSubs(sc);
    setRaw({ crvs, demands, pos });
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [provider, projectId]);

  const onHand = reg?.rows.find((r) => r.code === code)?.balanceQty;
  const avgRate = reg?.rows.find((r) => r.code === code)?.avgRate ?? 0;

  async function addIssue() {
    const q = Number(qty);
    if (!code.trim() || !Number.isFinite(q) || q <= 0 || !to.trim()) return;
    setBusy(true);
    try {
      const r = Number(rate);
      await provider.createMaterialIssue(projectId, {
        dated,
        materialCode: code.trim(),
        qty: q,
        issuedTo: to.trim(),
        ...(contractorId ? { contractorId } : {}),
        ...(Number.isFinite(r) && r > 0 ? { rate: r } : contractorId && avgRate > 0 ? { rate: avgRate } : {}),
      });
      setQty(''); setTo(''); setRate('');
      await reload();
    } finally { setBusy(false); }
  }

  if (!reg) return <p className="muted">Loading material register...</p>;

  const boqLabel = (id: string) => { const it = boq.get(id); return it ? it.code : id; };
  const subName = (id: string) => subs.find((s) => s.id === id)?.name ?? id;
  const codes = reg.rows.map((r) => r.code);

  return (
    <div>
      <div className="section-head"><h3>Material register</h3>
        <span className="muted">{reg.rows.length} materials{reg.negativeCodes > 0 ? ` \u00b7 ${reg.negativeCodes} negative \u26a0` : ''}</span>
      </div>

      {reg.rows.length > 0 && (
        <div className="kpi-grid" aria-label="Material register totals">
          <div className="kpi"><div className="kpi-label">Received value</div><div className="kpi-value">{formatMoney(reg.totalReceivedValue)}</div></div>
          <div className="kpi"><div className="kpi-label">Issued / consumed</div><div className="kpi-value">{formatMoney(reg.totalIssuedValue)}</div></div>
          <div className="kpi"><div className="kpi-label">On-hand value</div><div className="kpi-value">{formatMoney(reg.totalBalanceValue)}</div></div>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 12 }}><h3>Record issue / consumption</h3></div>
      <div className="card create-row">
        <input aria-label="Issue date" type="date" value={dated} onChange={(e) => setDated(e.target.value)} />
        <input aria-label="Material code" placeholder="Material code" list="material-codes" value={code} onChange={(e) => setCode(e.target.value)} />
        <datalist id="material-codes">{codes.map((c) => <option key={c} value={c} />)}</datalist>
        <input aria-label="Issue qty" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 90 }} />
        <input aria-label="Issued to" placeholder="Issued to (activity / location)" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
        <select aria-label="Issue contractor" value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
          <option value="">Own works (no recovery)</option>
          {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {contractorId && <input aria-label="Issue rate" placeholder={avgRate ? `Rate (avg ${Math.round(avgRate)})` : 'Recovery rate'} value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 130 }} />}
        <button className="btn" disabled={busy} onClick={addIssue}>Issue</button>
      </div>
      {code.trim() !== '' && onHand != null && (
        <p className={`small ${onHand - (Number(qty) || 0) < 0 ? 'neg' : 'muted'}`}>
          On hand for {code}: {onHand.toLocaleString('en-PK')}{Number(qty) > 0 ? ` \u00b7 after issue: ${(onHand - Number(qty)).toLocaleString('en-PK')}` : ''}
          {onHand - (Number(qty) || 0) < 0 ? ' \u26a0 exceeds recorded stock' : ''}
        </p>
      )}
      <p className="muted small">Issuing to a contractor creates a recoverable balance (Mapping &rarr; Material recovery); the recovery rate defaults to the store's average if left blank.</p>

      {reg.rows.length === 0 ? (
        <p className="muted">No materials received yet. Receipts post from procurement CRVs (POs &amp; CRVs).</p>
      ) : (
        <table className="data-table" aria-label="Material register">
          <thead>
            <tr>
              <th>Code</th><th>Description</th><th>Unit</th>
              <th className="num">Received</th><th className="num">Rec. value</th>
              <th className="num">Avg rate</th>
              <th className="num">Issued</th><th className="num">On hand</th><th className="num">On-hand value</th>
              <th>For BOQ</th>
            </tr>
          </thead>
          <tbody>
            {reg.rows.map((r) => (
              <tr key={r.code}>
                <td><button className="link-btn" aria-label={`Ledger for ${r.code}`} onClick={() => setSelectedCode(r.code)}>{r.code}</button></td>
                <td>{r.description || <span className="muted small">&mdash;</span>}</td>
                <td>{r.unit}</td>
                <td className="num">{r.receivedQty.toLocaleString('en-PK')}</td>
                <td className="num">{formatMoney(r.receivedValue)}</td>
                <td className="num">{formatMoney(r.avgRate)}</td>
                <td className="num">{r.issuedQty.toLocaleString('en-PK')}</td>
                <td className={`num ${r.negative ? 'neg' : ''}`}>{r.balanceQty.toLocaleString('en-PK')}{r.negative ? ' \u26a0' : ''}</td>
                <td className={`num ${r.negative ? 'neg' : ''}`}>{formatMoney(r.balanceValue)}</td>
                <td className="small">{r.boqItemIds.length ? r.boqItemIds.map(boqLabel).join(', ') : <span className="muted">&mdash;</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {issues.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 16 }}><h3>Recent issues</h3><span className="muted">{issues.length} issues</span></div>
          <table className="data-table" aria-label="Material issues log">
            <thead><tr><th>Date</th><th>Material</th><th className="num">Qty</th><th>Issued to</th><th>Contractor</th></tr></thead>
            <tbody>
              {issues.slice().reverse().slice(0, 25).map((i) => (
                <tr key={i.id}>
                  <td>{i.dated}</td><td>{i.materialCode}</td><td className="num">{i.qty.toLocaleString('en-PK')}</td>
                  <td>{i.issuedTo}</td>
                  <td>{i.contractorId ? subName(i.contractorId) : <span className="muted small">Own works</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {selectedCode && (
        <MaterialLedgerModal
          code={selectedCode}
          crvs={raw.crvs}
          demands={raw.demands}
          pos={raw.pos}
          issues={issues}
          subName={subName}
          onClose={() => setSelectedCode(null)}
        />
      )}
    </div>
  );
}

function MaterialLedgerModal({
  code, crvs, demands, pos, issues, subName, onClose,
}: {
  code: string;
  crvs: Crv[];
  demands: Demand[];
  pos: PurchaseOrder[];
  issues: MaterialIssue[];
  subName: (id: string) => string;
  onClose: () => void;
}) {
  const l = materialLedger(code, crvs, demands, pos, issues);
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-label={`Material ledger ${code}`} aria-modal="true">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="section-head"><h3>Material ledger — {code}</h3><button className="btn-ghost" onClick={onClose}>Close</button></div>
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-label">Received</div><div className="kpi-value">{l.receivedQty.toLocaleString('en-PK')}</div></div>
          <div className="kpi"><div className="kpi-label">Issued</div><div className="kpi-value">{l.issuedQty.toLocaleString('en-PK')}</div></div>
          <div className="kpi"><div className="kpi-label">On hand</div><div className={`kpi-value ${l.balanceQty < 0 ? 'neg' : ''}`}>{l.balanceQty.toLocaleString('en-PK')}</div></div>
          <div className="kpi"><div className="kpi-label">Avg rate</div><div className="kpi-value">{formatMoney(l.avgRate)}</div></div>
        </div>

        <div className="section-head" style={{ marginTop: 8 }}><h3>Receipts (CRV)</h3><span className="muted">{l.receipts.length}</span></div>
        {l.receipts.length === 0 ? <p className="muted small">No receipts recorded.</p> : (
          <table className="data-table" aria-label="Ledger receipts">
            <thead><tr><th>CRV</th><th>PO</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Value</th></tr></thead>
            <tbody>{l.receipts.map((r, i) => (<tr key={i}><td>{r.crvNo}</td><td>{r.poNo}</td><td className="num">{r.qty.toLocaleString('en-PK')}</td><td className="num">{formatMoney(r.rate)}</td><td className="num">{formatMoney(r.value)}</td></tr>))}</tbody>
          </table>
        )}

        <div className="section-head" style={{ marginTop: 12 }}><h3>Issues / consumption</h3><span className="muted">{l.issues.length}</span></div>
        {l.issues.length === 0 ? <p className="muted small">No issues recorded.</p> : (
          <table className="data-table" aria-label="Ledger issues">
            <thead><tr><th>Date</th><th>Issued to</th><th>Contractor</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Value</th></tr></thead>
            <tbody>{l.issues.map((i) => (<tr key={i.id}><td>{i.dated}</td><td>{i.issuedTo}</td><td>{i.contractorId ? subName(i.contractorId) : <span className="muted small">Own works</span>}</td><td className="num">{i.qty.toLocaleString('en-PK')}</td><td className="num">{formatMoney(i.rate)}</td><td className="num">{formatMoney(i.value)}</td></tr>))}</tbody>
          </table>
        )}

        <div className="section-head" style={{ marginTop: 12 }}><h3>Movement ledger</h3></div>
        <table className="data-table" aria-label="Ledger movements">
          <thead><tr><th>Movement</th><th>Ref</th><th>Date</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
          <tbody>{l.movements.map((m, i) => (
            <tr key={i}>
              <td>{m.kind === 'receipt' ? 'Receipt' : 'Issue'}</td>
              <td>{m.ref}</td>
              <td className="small">{m.dated || '—'}</td>
              <td className="num">{m.qtyIn ? m.qtyIn.toLocaleString('en-PK') : ''}</td>
              <td className="num">{m.qtyOut ? m.qtyOut.toLocaleString('en-PK') : ''}</td>
              <td className={`num ${m.balance < 0 ? 'neg' : ''}`}>{m.balance.toLocaleString('en-PK')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

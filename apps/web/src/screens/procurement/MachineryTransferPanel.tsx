import { useEffect, useState } from 'react';
import { useData } from '../../data/DataContext';
import { useRole } from '../../state/Role';
import { useToast } from '../../components/Toast';
import { ChainStatus, ChainControls } from '../../components/ApptChainControls';
import type { MachineryAsset, MachineryTransfer } from '../../data/types';

/**
 * Machinery inter-project transfer (spec §6): SM Procurement (HQ PD) moves
 * integral plant between projects with technical justification; the asset locks
 * while the DPD → PD → SM Proc (HQ Engrs) ladder runs, and books to the
 * receiving project on approval.
 */
export function MachineryTransferPanel({ projectId }: { projectId: string }) {
  const { provider, nodes } = useData();
  const { role, user } = useRole();
  const { toast } = useToast();
  const [assets, setAssets] = useState<MachineryAsset[]>([]);
  const [transfers, setTransfers] = useState<MachineryTransfer[]>([]);
  const [assetId, setAssetId] = useState('');
  const [justification, setJustification] = useState('');
  const by = user?.name ?? role;

  const mayInitiate = role === 'admin' || user?.appointmentId === 'sm_proc_pd';
  const nameOf = (id?: string) => (id ? nodes.find((n) => n.id === id)?.name ?? id : 'HQ pool');

  async function load() {
    const [a, t] = await Promise.all([provider.listMachineryAssets(), provider.listMachineryTransfers()]);
    setAssets(a); setTransfers(t);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [provider]);

  async function initiate() {
    if (!assetId || justification.trim().length < 5) return;
    try {
      await provider.initiateMachineryTransfer({ assetId, toProjectId: projectId, justification: justification.trim(), by });
      setAssetId(''); setJustification('');
      await load();
      toast({ message: 'Transfer initiated — asset locked pending approval', kind: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    }
  }

  function patch(updated: MachineryTransfer) {
    setTransfers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    void load(); // refresh asset booking/lock
  }

  // Assets not already booked here and not locked can be pulled in.
  const transferable = assets.filter((a) => a.currentProjectId !== projectId && !a.locked);
  const bookedHere = assets.filter((a) => a.currentProjectId === projectId);

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="section-head"><h3>Integral machinery booked to this project</h3></div>
        {bookedHere.length === 0 ? (
          <p className="muted small">No integral machinery booked here yet.</p>
        ) : (
          <table className="data-table" aria-label="Booked machinery">
            <thead><tr><th>Code</th><th>Description</th><th>Category</th><th>State</th></tr></thead>
            <tbody>
              {bookedHere.map((a) => (
                <tr key={a.id}>
                  <td className="mono small">{a.code}</td>
                  <td className="small">{a.description}</td>
                  <td className="small">{a.category.replace('_', ' ')}</td>
                  <td>{a.locked ? <span className="status-pill st-ack">transfer in flight</span> : <span className="status-pill st-resolved">booked</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h3>Transfer machinery in</h3>
          <span className="muted small">SM Procurement (HQ PD) · locks the asset, books it here on approval · justify vs BOQ quantities</span>
        </div>
        {mayInitiate ? (
          <div className="create-row" style={{ flexWrap: 'wrap' }}>
            <select aria-label="Transfer asset" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Select asset…</option>
              {transferable.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.description} ({nameOf(a.currentProjectId)})</option>)}
            </select>
            <input aria-label="Transfer justification" placeholder="Technical justification vs BOQ quantities" value={justification} onChange={(e) => setJustification(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
            <button className="btn" aria-label="Initiate transfer" disabled={!assetId || justification.trim().length < 5} onClick={initiate}>Initiate transfer</button>
          </div>
        ) : (
          <p className="muted small">Transfers are initiated by SM Procurement (HQ PD).</p>
        )}
      </section>

      <section className="card">
        <div className="section-head"><h3>Transfers to this project</h3></div>
        {transfers.filter((t) => t.toProjectId === projectId).length === 0 ? (
          <p className="muted small">No transfers raised.</p>
        ) : (
          <table className="data-table" aria-label="Machinery transfers">
            <thead><tr><th>Asset</th><th>From</th><th>Justification</th><th>Status / chain</th><th></th></tr></thead>
            <tbody>
              {transfers.filter((t) => t.toProjectId === projectId).map((t) => {
                const asset = assets.find((a) => a.id === t.assetId);
                return (
                  <tr key={t.id}>
                    <td className="mono small">{asset?.code ?? t.assetId}</td>
                    <td className="small">{nameOf(t.fromProjectId)}</td>
                    <td className="small">{t.justification}</td>
                    <td>
                      <span className={`status-pill st-${t.status === 'approved' ? 'resolved' : t.status === 'returned' ? 'open' : 'ack'}`}>{t.status.replace('_', ' ')}</span>
                      <ChainStatus chain={t.chain} refNo={asset?.code ?? t.id} />
                    </td>
                    <td>
                      <ChainControls chain={t.chain} refNo={asset?.code ?? t.id} me={user?.appointmentId} isAdmin={role === 'admin'}
                        canResubmit={['sm_proc_pd']}
                        onAct={async () => patch(await provider.actOnMachineryTransfer(t.id, by))}
                        onReturn={async (rm) => patch(await provider.returnMachineryTransfer(t.id, by, rm))}
                        onResubmit={async () => { /* returned transfers are re-initiated fresh */ }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

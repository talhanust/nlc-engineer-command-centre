import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { DetailDrawer } from './DetailDrawer';
import { HrAvatar } from './HrAvatar';
import { STATUS_LABEL } from '../domain/roster';
import { expiryStatus } from '../domain/credentials';
import { TRANSFER_STAGE_LABEL } from '../domain/postingchain';
import type { HrPerson, HrUnit, HrCredential, HrTransfer } from '../data/types';

interface Bundle {
  person: HrPerson;
  unitTitle: string;
  creds: HrCredential[];
  transfers: HrTransfer[];
}

/** Open with: window.dispatchEvent(new CustomEvent('nlc:person-drawer', { detail: { personId, nodeId } })). */
export function PersonDrawerHost() {
  const { provider } = useData();
  const navigate = useNavigate();
  const [target, setTarget] = useState<{ personId: string; nodeId: string } | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const d = (e as CustomEvent<{ personId?: string; nodeId?: string }>).detail;
      if (d?.personId && d?.nodeId) setTarget({ personId: d.personId, nodeId: d.nodeId });
    }
    window.addEventListener('nlc:person-drawer', onOpen);
    return () => window.removeEventListener('nlc:person-drawer', onOpen);
  }, []);

  useEffect(() => {
    if (!target) { setBundle(null); return; }
    let alive = true;
    void Promise.all([
      provider.listPeople(target.nodeId),
      provider.listHrUnits(target.nodeId),
      provider.listCredentials(target.nodeId),
      provider.listTransfersForNode(target.nodeId),
    ]).then(([people, units, creds, transfers]) => {
      if (!alive) return;
      const person = people.find((p) => p.id === target.personId);
      if (!person) { setBundle(null); return; }
      const unitTitle = person.unitId ? (units.find((u: HrUnit) => u.id === person.unitId)?.title ?? '—') : 'Bench / unassigned';
      setBundle({
        person, unitTitle,
        creds: creds.filter((c) => c.personId === person.id),
        transfers: transfers.filter((t) => t.personId === person.id),
      });
    });
    return () => { alive = false; };
  }, [target, provider]);

  const close = () => setTarget(null);
  if (!bundle) return <DetailDrawer open={false} title="" onClose={close}>{null}</DetailDrawer>;

  const { person, unitTitle, creds, transfers } = bundle;
  const meta: Array<[string, string]> = [
    ['Post', unitTitle],
    ['Status', STATUS_LABEL[person.status]],
    ...(person.rank ? [['Rank / scale', person.rank] as [string, string]] : []),
    ...(person.category ? [['Category', person.category] as [string, string]] : []),
    ...(person.cnic ? [['CNIC', person.cnic] as [string, string]] : []),
    ...(person.contact ? [['Contact', person.contact] as [string, string]] : []),
    ...(person.postingDate ? [['Posted', person.postingDate] as [string, string]] : []),
  ];

  return (
    <DetailDrawer
      open
      title={person.name}
      subtitle={person.rank || undefined}
      badge={<span className={`drawer-badge status-person-${person.status}`}>{STATUS_LABEL[person.status]}</span>}
      onClose={close}
      actions={
        <>
          <button className="btn" onClick={() => { navigate(`/node/${target!.nodeId}/hr`); close(); }}>Open HR →</button>
          <button className="btn-ghost" onClick={close}>Close</button>
        </>
      }
    >
      <div className="person-drawer-head">
        <HrAvatar person={person} size={48} />
      </div>

      <table className="drawer-kpis">
        <tbody>{meta.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
      </table>

      <h3 className="drawer-section">Credentials ({creds.length})</h3>
      {creds.length === 0 ? <p className="muted small">None recorded.</p> : (
        <ul className="drawer-list">
          {creds.map((c) => {
            const st = expiryStatus(c.expires);
            return (
              <li key={c.id}>
                <span className="drawer-list-main">{c.kind} · {c.ref}</span>
                <span className={`expiry-badge st-${st}`}>{st === 'none' ? 'non-expiring' : st}</span>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="drawer-section">Postings ({transfers.length})</h3>
      {transfers.length === 0 ? <p className="muted small">No movements.</p> : (
        <ul className="drawer-list">
          {transfers.map((t) => (
            <li key={t.id}>
              <span className="drawer-list-main">{t.toNodeName} › {t.toUnitTitle || 'bench'}</span>
              <span className={`posting-stage st-${t.stage}`}>{TRANSFER_STAGE_LABEL[t.stage]}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailDrawer>
  );
}

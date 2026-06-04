// Admin-fane: godkend/afvis ligaer og tilmeld medlemmer.
import { useState } from 'react';
import { useAllLeagues } from '../leagues/useAllLeagues';
import { useUsers } from './useUsers';
import { setLeagueStatus, adminAddMember, removeMember } from '../leagues/leagueActions';
import { LEAGUE_STATUS, USER_STATUS } from '../../lib/constants';

const STATUS_BADGE = {
  [LEAGUE_STATUS.PENDING]:  { cls: 'badge--yellow', label: 'Afventer' },
  [LEAGUE_STATUS.APPROVED]: { cls: 'badge--green',  label: 'Godkendt' },
  [LEAGUE_STATUS.REJECTED]: { cls: 'badge--red',    label: 'Afvist' },
};

export default function LeaguesAdminTab() {
  const { leagues, loading, error } = useAllLeagues();
  const { users } = useUsers();
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState({}); // { [leagueId]: uid }

  const nameOf = (uid) => {
    const u = users.find((x) => x.id === uid);
    return u?.displayName || u?.email || uid;
  };
  const approvedUsers = users.filter((u) => u.status === USER_STATUS.APPROVED);

  async function run(key, fn) {
    setBusy(key);
    try { await fn(); }
    catch (e) { console.error(e); alert('Fejl: ' + (e.message ?? 'ukendt')); }
    finally { setBusy(''); }
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>Henter ligaer…</p>;
  if (error) return <p role="alert" style={{ color: 'var(--c-err)' }}>{error}</p>;
  if (leagues.length === 0) return <p style={{ color: 'var(--c-muted)' }}>Ingen ligaer oprettet endnu.</p>;

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {leagues.map((lg) => {
        const status = lg.status ?? LEAGUE_STATUS.PENDING;
        const badge = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
        const members = lg.memberUids ?? [];
        const candidates = approvedUsers.filter((u) => !members.includes(u.id));
        return (
          <li key={lg.id} style={{ padding: '0.85rem 0', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1rem' }}>{lg.name}</strong>
              <span className={`badge ${badge.cls}`}>{badge.label}</span>
              <span className="badge badge--muted">{members.length} medlem{members.length === 1 ? '' : 'mer'}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                Ejer: {nameOf(lg.ownerUid)} · Kode: <strong>{lg.joinCode}</strong>
              </span>
            </div>

            {/* Godkend / afvis */}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {status !== LEAGUE_STATUS.APPROVED && (
                <button className="btn btn--sm" disabled={busy === lg.id}
                  onClick={() => run(lg.id, () => setLeagueStatus(lg.id, LEAGUE_STATUS.APPROVED))}>
                  ✓ Godkend
                </button>
              )}
              {status !== LEAGUE_STATUS.REJECTED && (
                <button className="btn btn--ghost btn--sm" disabled={busy === lg.id}
                  onClick={() => run(lg.id, () => setLeagueStatus(lg.id, LEAGUE_STATUS.REJECTED))}>
                  Afvis
                </button>
              )}
            </div>

            {/* Tilmeld medlem */}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="select"
                style={{ maxWidth: 240 }}
                value={pick[lg.id] ?? ''}
                onChange={(e) => setPick((p) => ({ ...p, [lg.id]: e.target.value }))}
              >
                <option value="">– Vælg spiller –</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName || u.email}</option>
                ))}
              </select>
              <button
                className="btn btn--sm"
                disabled={!pick[lg.id] || busy === lg.id}
                onClick={() => run(lg.id, async () => {
                  await adminAddMember(lg.id, pick[lg.id]);
                  setPick((p) => ({ ...p, [lg.id]: '' }));
                })}
              >
                Tilmeld medlem
              </button>
            </div>

            {/* Medlemsliste */}
            {members.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {members.map((uid) => (
                  <span key={uid} className="badge badge--muted" style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                    {nameOf(uid)}{uid === lg.ownerUid ? ' (ejer)' : ''}
                    {uid !== lg.ownerUid && (
                      <button
                        className="btn--icon"
                        title="Fjern medlem"
                        style={{ background: 'none', border: 'none', color: 'var(--c-err)', cursor: 'pointer', padding: 0 }}
                        disabled={busy === lg.id}
                        onClick={() => run(lg.id, () => removeMember(lg.id, uid, lg.ownerUid))}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

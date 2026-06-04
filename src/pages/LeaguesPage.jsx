/**
 * LeaguesPage – oversigt over private mini-ligaer.
 *
 * Funktionalitet:
 *  - Se dine ligaer med antal medlemmer og top-3 miniature
 *  - Opret ny liga (genererer join-kode)
 *  - Tilmeld dig via join-kode
 *  - Åbn detaljevisning: ligaens rangering + admin-muligheder for ejere
 */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLeagues } from '../features/leagues/useLeagues';
import { useStandings } from '../features/leaderboard/useStandings';
import {
  createLeague,
  joinLeague,
  leaveLeague,
  deleteLeague,
  removeMember,
} from '../features/leagues/leagueActions';
import { filterUsersByLeague } from '../features/leagues/leagueUtils';
import { sortByPoints } from '../features/leaderboard/standingsUtils';
import StandingsTable from '../features/leaderboard/StandingsTable';

// ── Liga-kort (listevisning) ─────────────────────────────────────────────────
function LeagueCard({ league, standings, meUid, onOpen }) {
  // Top 3 spillere i ligaen
  const members = sortByPoints(filterUsersByLeague(standings, league.memberUids));
  const top3 = members.slice(0, 3);

  return (
    <div className="league-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      aria-label={`Åbn liga: ${league.name}`}
    >
      <div className="flex items-center justify-between">
        <div className="league-card__name">{league.name}</div>
        <span className="badge badge--blue">{league.memberUids?.length ?? 0} 👤</span>
      </div>
      <div className="league-card__meta">
        Kode: <strong>{league.joinCode}</strong>
        {league.ownerUid === meUid && (
          <span className="badge badge--green" style={{ marginLeft: '0.5rem' }}>ejer</span>
        )}
        {league.status === 'pending' && (
          <span className="badge badge--yellow" style={{ marginLeft: '0.5rem' }}>afventer godkendelse</span>
        )}
        {league.status === 'rejected' && (
          <span className="badge badge--red" style={{ marginLeft: '0.5rem' }}>afvist</span>
        )}
      </div>
      {top3.length > 0 && (
        <div className="league-card__top3">
          {top3.map((u, i) => (
            <span key={u.uid} className="badge badge--muted">
              {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {u.displayName}
              &nbsp;<span style={{ color: 'var(--c-pitch)', fontWeight: 700 }}>{u.totalPoints ?? 0}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ligadetalje-panel ─────────────────────────────────────────────────────────
function LeagueDetail({ league, standings, meUid, onClose }) {
  const [removing, setRemoving] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const isOwner = league.ownerUid === meUid;
  const members = filterUsersByLeague(standings, league.memberUids);

  async function handleRemoveMember(memberUid) {
    setRemoving(memberUid);
    setActionError('');
    try {
      await removeMember(league.id, memberUid, meUid);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setRemoving(null);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Slet ligaen "${league.name}"? Dette kan ikke fortrydes.`)) return;
    setDeleting(true);
    setActionError('');
    try {
      await deleteLeague(league.id, meUid, league.ownerUid);
      onClose();
    } catch (e) {
      setActionError(e.message);
      setDeleting(false);
    }
  }

  async function handleLeave() {
    if (!window.confirm('Forlad ligaen?')) return;
    try {
      await leaveLeague(league.id, meUid, league.ownerUid);
      onClose();
    } catch (e) {
      setActionError(e.message);
    }
  }

  return (
    <div>
      {/* Tilbage-knap */}
      <button className="btn btn--ghost btn--sm mb-2" onClick={onClose}>
        ← Tilbage
      </button>

      {/* Overskrift */}
      <div className="card mb-2">
        <div className="card__header">
          <h2 className="card__title" style={{ fontSize: '1.25rem' }}>{league.name}</h2>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            <span className="badge badge--muted">
              Kode: <strong>{league.joinCode}</strong>
            </span>
            <span className="badge badge--blue">{league.memberUids?.length ?? 0} spillere</span>
          </div>
        </div>

        {/* Admin-handlinger (kun ejer) */}
        {isOwner && (
          <div className="flex gap-1" style={{ flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button
              className="btn btn--danger btn--sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Sletter…' : '🗑 Slet liga'}
            </button>
          </div>
        )}

        {/* Forlad liga (ikke-ejere) */}
        {!isOwner && (
          <div style={{ marginTop: '0.5rem' }}>
            <button className="btn btn--ghost btn--sm" onClick={handleLeave}>
              Forlad liga
            </button>
          </div>
        )}

        {actionError && (
          <p className="form-error mt-1">{actionError}</p>
        )}
      </div>

      {/* Rangering */}
      <div className="card card--flat">
        <h3 className="card__title mb-2">Ligaens stilling</h3>
        <StandingsTable
          users={standings}
          meUid={meUid}
          memberUids={league.memberUids}
          emptyMsg="Ingen spillere i ligaen."
        />
      </div>

      {/* Medlemsliste med fjern-knapper for ejeren */}
      {isOwner && members.length > 0 && (
        <div className="card mt-2">
          <h3 className="card__title mb-2">Administrér medlemmer</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {members.map((u) => (
              <div key={u.uid} className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
                <span>
                  {u.displayName || '(ukendt)'}
                  {u.uid === meUid && (
                    <span className="badge badge--blue" style={{ marginLeft: '0.4rem' }}>dig</span>
                  )}
                  {u.uid === league.ownerUid && (
                    <span className="badge badge--green" style={{ marginLeft: '0.4rem' }}>ejer</span>
                  )}
                </span>
                {u.uid !== meUid && (
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={() => handleRemoveMember(u.uid)}
                    disabled={removing === u.uid}
                    aria-label={`Fjern ${u.displayName}`}
                  >
                    {removing === u.uid ? '…' : 'Fjern'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Opret liga-formular ───────────────────────────────────────────────────────
function CreateLeagueForm({ uid, onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await createLeague(name, uid);
      setSuccess(`Ligaen "${name}" er oprettet og afventer nu admin-godkendelse. Når den er godkendt, kan andre tilmelde sig med koden.`);
      setName('');
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label" htmlFor="league-name">Ligaens navn</label>
        <input
          id="league-name"
          className="input"
          type="text"
          placeholder="fx 'Kontoret' eller 'Familie'"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          required
        />
      </div>
      {error && <p className="form-error mt-1">{error}</p>}
      {success && <p className="badge badge--green mt-1" style={{ display: 'block' }}>{success}</p>}
      <button className="btn mt-2" type="submit" disabled={loading || !name.trim()}>
        {loading ? 'Opretter…' : 'Opret liga'}
      </button>
    </form>
  );
}

// ── Tilmeld via kode-formular ─────────────────────────────────────────────────
function JoinLeagueForm({ uid }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const { name } = await joinLeague(code, uid);
      setSuccess(`Du er nu med i "${name}"! 🎉`);
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label" htmlFor="join-code">Kode</label>
        <input
          id="join-code"
          className="input"
          type="text"
          placeholder="fx 'X4KR2M'"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          required
          style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
        />
      </div>
      {error && <p className="form-error mt-1">{error}</p>}
      {success && <p className="badge badge--green mt-1" style={{ display: 'block' }}>{success}</p>}
      <button className="btn mt-2" type="submit" disabled={loading || !code.trim()}>
        {loading ? 'Tilmelder…' : 'Tilmeld via kode'}
      </button>
    </form>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────
export default function LeaguesPage() {
  const { user } = useAuth();
  const { leagues, loading: loadingLeagues, error: leagueError } = useLeagues(user?.uid);
  const { standings, loading: loadingStandings } = useStandings();

  // Hvilken liga er åben i detaljevisning
  const [openLeagueId, setOpenLeagueId] = useState(null);

  // Fold/åbn formular-sektioner
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const openLeague = leagues.find((l) => l.id === openLeagueId) ?? null;

  // ── Detaljevisning ──────────────────────────────────────────────────────
  if (openLeague) {
    return (
      <div>
        <LeagueDetail
          league={openLeague}
          standings={standings}
          meUid={user?.uid}
          onClose={() => setOpenLeagueId(null)}
        />
      </div>
    );
  }

  // ── Listevisning ────────────────────────────────────────────────────────
  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.4rem', fontWeight: 800 }}>
        🏅 Mine ligaer
      </h1>

      {/* Fejlbesked */}
      {leagueError && (
        <p className="badge badge--red mb-2" role="alert">{leagueError}</p>
      )}

      {/* Ligaliste */}
      {loadingLeagues || loadingStandings ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : leagues.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🏟️</div>
          <div className="empty-state__title">Du er ikke med i nogen liga endnu</div>
          <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            Opret en liga eller tilmeld dig med en kode nedenfor.
          </p>
        </div>
      ) : (
        <div className="grid-2 mb-2">
          {leagues.map((l) => (
            <LeagueCard
              key={l.id}
              league={l}
              standings={standings}
              meUid={user?.uid}
              onOpen={() => setOpenLeagueId(l.id)}
            />
          ))}
        </div>
      )}

      {/* Handlingsknapper */}
      <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap' }}>
        <button
          className={`btn${showCreate ? ' btn--ghost' : ''}`}
          onClick={() => { setShowCreate((v) => !v); setShowJoin(false); }}
        >
          {showCreate ? 'Luk' : '+ Opret liga'}
        </button>
        <button
          className={`btn btn--accent${showJoin ? ' btn--ghost' : ''}`}
          onClick={() => { setShowJoin((v) => !v); setShowCreate(false); }}
        >
          {showJoin ? 'Luk' : 'Tilmeld via kode'}
        </button>
      </div>

      {/* Opret liga */}
      {showCreate && (
        <div className="card mb-2">
          <h2 className="card__title mb-2">Opret ny liga</h2>
          <CreateLeagueForm uid={user?.uid} onCreated={() => setShowCreate(false)} />
        </div>
      )}

      {/* Tilmeld via kode */}
      {showJoin && (
        <div className="card mb-2">
          <h2 className="card__title mb-2">Tilmeld via kode</h2>
          <JoinLeagueForm uid={user?.uid} />
        </div>
      )}
    </div>
  );
}

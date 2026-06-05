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
  adminAddMember,
  renameLeague,
} from '../features/leagues/leagueActions';
import { filterUsersByLeague } from '../features/leagues/leagueUtils';
import { sortByPoints } from '../features/leaderboard/standingsUtils';
import StandingsTable from '../features/leaderboard/StandingsTable';
import LeagueWall from '../features/comments/LeagueWall';
import LeagueTipCounter from '../features/leagues/LeagueTipCounter';
import LeagueActivity from '../features/leagues/LeagueActivity';
import { tryLogActivity, ACTIVITY } from '../features/leagues/activityActions';

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
function LeagueDetail({ league, standings, meUid, meName, meEmoji = null, meTeam = null, isAdmin = false, onClose }) {
  const [removing, setRemoving] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [addPick, setAddPick] = useState('');
  const [adding, setAdding] = useState(false);
  const [renameVal, setRenameVal] = useState(null); // null = ikke i gang
  const [renaming, setRenaming] = useState(false);

  const isOwner = league.ownerUid === meUid;
  const leagueAdminUids = league.adminUids ?? [];
  const isLeagueAdmin = leagueAdminUids.includes(meUid);
  // "Manager" = liga-ejer eller udpeget liga-admin (eller global match-admin)
  const isManager = isOwner || isLeagueAdmin || isAdmin;
  const members = filterUsersByLeague(standings, league.memberUids);
  // Spillere der kan tilføjes (godkendte, ikke allerede medlem)
  const addable = standings.filter((u) => !(league.memberUids ?? []).includes(u.uid));

  async function handleRemoveMember(memberUid) {
    setRemoving(memberUid);
    setActionError('');
    try {
      // 3. arg = liga-ejeren, så hverken admin eller ejer kan fjerne liga-ejeren
      await removeMember(league.id, memberUid, league.ownerUid);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setRemoving(null);
    }
  }

  async function handleAddMember() {
    if (!addPick) return;
    setAdding(true);
    setActionError('');
    try {
      await adminAddMember(league.id, addPick);
      setAddPick('');
    } catch (e) {
      setActionError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRename() {
    setRenaming(true);
    setActionError('');
    try {
      await renameLeague(league.id, renameVal);
      setRenameVal(null);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setRenaming(false);
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
      await tryLogActivity({ leagueId: league.id, type: ACTIVITY.LEAVE, actorUid: meUid, actorName: meName, text: 'forlod ligaen' });
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
          {renameVal !== null ? (
            <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input" style={{ maxWidth: 240 }} maxLength={40}
                value={renameVal} aria-label="Nyt liganavn"
                onChange={(e) => setRenameVal(e.target.value)}
              />
              <button className="btn btn--sm" disabled={renaming || !renameVal.trim()} onClick={handleRename}>
                {renaming ? 'Gemmer…' : 'Gem'}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setRenameVal(null)}>Annullér</button>
            </span>
          ) : (
            <h2 className="card__title" style={{ fontSize: '1.25rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              {league.name}
              {isManager && (
                <button
                  className="btn--icon" title="Omdøb liga" aria-label="Omdøb liga"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.9rem' }}
                  onClick={() => setRenameVal(league.name)}
                >
                  ✏️
                </button>
              )}
            </h2>
          )}
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            <span className="badge badge--muted">
              Kode: <strong>{league.joinCode}</strong>
            </span>
            <span className="badge badge--blue">{league.memberUids?.length ?? 0} spillere</span>
            {isLeagueAdmin && !isOwner && <span className="badge badge--green">du er liga-admin</span>}
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

      {/* Hvem har tippet på de kommende kampe */}
      <div className="card mt-2">
        <h3 className="card__title mb-2">✅ Hvem har tippet?</h3>
        <LeagueTipCounter members={members} />
      </div>

      {/* Aktivitets-feed */}
      <LeagueActivity leagueId={league.id} />

      {/* Liga-væg (kommentarer) */}
      <LeagueWall
        leagueId={league.id}
        meUid={meUid}
        myName={meName}
        myEmoji={meEmoji}
        myTeam={meTeam}
        isOwner={isOwner}
        isAdmin={isAdmin}
      />

      {/* Administrér medlemmer (liga-ejer eller liga-admin) */}
      {isManager && (
        <div className="card mt-2">
          <h3 className="card__title mb-2">Administrér medlemmer</h3>

          {/* Tilføj medlem */}
          <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="select" style={{ maxWidth: 220 }}
              value={addPick} onChange={(e) => setAddPick(e.target.value)}
              aria-label="Tilføj spiller til ligaen"
            >
              <option value="">– Tilføj spiller –</option>
              {addable.map((u) => (
                <option key={u.uid} value={u.uid}>{u.displayName || '(ukendt)'}</option>
              ))}
            </select>
            <button className="btn btn--sm" disabled={!addPick || adding} onClick={handleAddMember}>
              {adding ? 'Tilføjer…' : 'Tilføj'}
            </button>
          </div>

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
                  {u.uid !== league.ownerUid && leagueAdminUids.includes(u.uid) && (
                    <span className="badge badge--blue" style={{ marginLeft: '0.4rem' }}>liga-admin</span>
                  )}
                </span>
                {u.uid !== league.ownerUid && (
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
          <p style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginTop: '0.5rem' }}>
            Liga-admins udpeges af den globale administrator.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Opret liga-formular ───────────────────────────────────────────────────────
function CreateLeagueForm({ uid, meName, onCreated }) {
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
      const newId = await createLeague(name, uid);
      tryLogActivity({ leagueId: newId, type: ACTIVITY.CREATED, actorUid: uid, actorName: meName, text: 'oprettede ligaen' });
      const msg = `Ligaen "${name}" er oprettet og afventer nu admin-godkendelse. Når den er godkendt, kan andre tilmelde sig med koden.`;
      setSuccess(msg);
      setName('');
      onCreated?.(msg);
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
function JoinLeagueForm({ uid, meName }) {
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
      const { id, name } = await joinLeague(code, uid);
      tryLogActivity({ leagueId: id, type: ACTIVITY.JOIN, actorUid: uid, actorName: meName, text: 'tilmeldte sig ligaen' });
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
  const { user, profile, isMatchAdmin } = useAuth();
  // (profil bruges til avatar i liga-væggen)
  const { leagues, loading: loadingLeagues, error: leagueError } = useLeagues(user?.uid);
  const { standings, loading: loadingStandings } = useStandings();

  // Hvilken liga er åben i detaljevisning
  const [openLeagueId, setOpenLeagueId] = useState(null);

  // Fold/åbn formular-sektioner
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  // Side-besked (fx kvittering efter oprettelse)
  const [pageMsg, setPageMsg] = useState('');

  const openLeague = leagues.find((l) => l.id === openLeagueId) ?? null;

  // ── Detaljevisning ──────────────────────────────────────────────────────
  if (openLeague) {
    return (
      <div>
        <LeagueDetail
          league={openLeague}
          standings={standings}
          meUid={user?.uid}
          meName={profile?.displayName}
          meEmoji={profile?.avatarEmoji}
          meTeam={profile?.favoriteTeam}
          isAdmin={isMatchAdmin}
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

      {/* Kvittering (fx efter oprettelse) */}
      {pageMsg && (
        <p className="badge badge--green mb-2" role="status" style={{ display: 'block' }}>{pageMsg}</p>
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
          <CreateLeagueForm uid={user?.uid} meName={profile?.displayName} onCreated={(msg) => { setShowCreate(false); setPageMsg(msg); }} />
        </div>
      )}

      {/* Tilmeld via kode */}
      {showJoin && (
        <div className="card mb-2">
          <h2 className="card__title mb-2">Tilmeld via kode</h2>
          <JoinLeagueForm uid={user?.uid} meName={profile?.displayName} />
        </div>
      )}
    </div>
  );
}

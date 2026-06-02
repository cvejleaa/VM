/**
 * StandingsTable – genbrugelig rangeringstabel.
 * Tager en sorteret liste af brugere og valgfrit fremhæver den indloggede bruger.
 * Bruges til global stilling, dagsvisning og liga-stilling.
 */
import { useMemo } from 'react';
import { filterByMembers } from './standingsUtils';

/**
 * @param {object}   props
 * @param {Array}    props.users        – liste af brugerobjekter (uid, displayName, totalPoints)
 * @param {string}   [props.meUid]      – den indloggede brugers uid (fremhæves)
 * @param {string[]} [props.memberUids] – filtrer til kun disse uid'er (null = alle)
 * @param {function} [props.getPoints]  – fn(uid) → number; overskriver totalPoints-feltet
 * @param {boolean}  [props.loading]    – vis spinner
 * @param {string}   [props.emptyMsg]   – tekst når listen er tom
 */
export default function StandingsTable({
  users = [],
  meUid = null,
  memberUids = null,
  getPoints = null,
  loading = false,
  emptyMsg = 'Ingen spillere at vise.',
}) {
  // Filtrer og sorter brugerene
  const rows = useMemo(() => {
    // Filtrer til medlemmer af valgt liga
    const filtered = filterByMembers(users, memberUids);

    // Beregn point (evt. fra ekstern funktion, f.eks. dagspoint)
    const withPoints = filtered.map((u) => ({
      ...u,
      displayPoints: getPoints ? (getPoints(u.uid) ?? 0) : (u.totalPoints ?? 0),
    }));

    // Sortér faldende efter point
    return withPoints.sort((a, b) => b.displayPoints - a.displayPoints);
  }, [users, memberUids, getPoints]);

  if (loading) {
    return <div className="spinner" role="status" aria-label="Indlæser" />;
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏆</div>
        <div className="empty-state__title">{emptyMsg}</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '2.5rem' }}>#</th>
            <th>Spiller</th>
            <th style={{ textAlign: 'right' }}>Point</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u, idx) => {
            const isMe = u.uid === meUid;
            const rank = idx + 1;

            return (
              <tr key={u.uid} className={isMe ? 'is-me' : ''}>
                {/* Placering med medalje til top 3 */}
                <td>
                  {rank <= 3 ? (
                    <span className={`medal medal--${rank}`} aria-label={`Placering ${rank}`}>
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
                    </span>
                  ) : (
                    <span className="medal medal--n">{rank}</span>
                  )}
                </td>

                {/* Spillernavn + evt. "dig"-badge */}
                <td>
                  <span className="text-bold" style={{ fontSize: '0.95rem' }}>
                    {u.displayName || '(ukendt)'}
                  </span>
                  {isMe && (
                    <span className="badge badge--blue" style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>
                      dig
                    </span>
                  )}
                </td>

                {/* Point */}
                <td style={{ textAlign: 'right' }}>
                  <span className="pts">{u.displayPoints}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

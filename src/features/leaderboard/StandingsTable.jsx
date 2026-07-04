/**
 * StandingsTable – genbrugelig rangeringstabel.
 * Tager en sorteret liste af brugere og valgfrit fremhæver den indloggede bruger.
 * Bruges til global stilling, dagsvisning og liga-stilling.
 */
import { useMemo, useState, Fragment } from 'react';
import { filterByMembers } from './standingsUtils';
import Avatar from '../../components/Avatar';
import { teamName } from '../../lib/teams';

/** Udfoldet liste over de kampe en spiller har fået point i, med point-type. */
function PointBreakdown({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: '0.6rem 0.9rem', fontSize: '0.85rem', color: 'var(--c-muted)', background: 'var(--c-surface-2, #f7f7f7)' }}>
        Ingen kamp-point endnu.
      </div>
    );
  }
  const sum = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div style={{ padding: '0.5rem 0.9rem', background: 'var(--c-surface-2, #f7f7f7)' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((r) => (
          <li
            key={r.matchId}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
              padding: '0.35rem 0', borderTop: '1px solid var(--c-border)',
            }}
          >
            <span style={{ fontSize: '0.85rem', minWidth: 0 }}>
              <strong>{teamName(r.homeTeam) || r.homeTeam || '?'}</strong>
              {' '}{r.result.home}–{r.result.away}{' '}
              <strong>{teamName(r.awayTeam) || r.awayTeam || '?'}</strong>
              {r.result.advance ? <span style={{ color: 'var(--c-muted)' }}> · videre: {teamName(r.result.advance) || r.result.advance}</span> : null}
            </span>
            <span style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
              {r.parts.map((p) => (
                <span key={p.label} className="badge badge--muted" style={{ fontSize: '0.7rem' }}>
                  {p.label} +{p.points}
                </span>
              ))}
              <span className="pts" style={{ fontSize: '0.9rem', minWidth: '2.2rem', textAlign: 'right' }}>+{r.total}</span>
            </span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', padding: '0.4rem 0 0.1rem', fontSize: '0.85rem', fontWeight: 700 }}>
        <span style={{ color: 'var(--c-muted)' }}>Kamp-point i alt:</span>
        <span>+{sum}</span>
      </div>
    </div>
  );
}

/** Lille pil der viser bevægelse i stillingen siden i går. */
function MovementArrow({ delta }) {
  if (delta === null || delta === undefined) return null;
  if (delta > 0) {
    return <span title={`Op ${delta}`} style={{ color: 'var(--c-pitch, #16a34a)', fontWeight: 700, fontSize: '0.8rem' }}>▲{delta}</span>;
  }
  if (delta < 0) {
    return <span title={`Ned ${-delta}`} style={{ color: 'var(--c-err, #dc2626)', fontWeight: 700, fontSize: '0.8rem' }}>▼{-delta}</span>;
  }
  return <span title="Uændret" style={{ color: 'var(--c-muted)', fontSize: '0.8rem' }}>–</span>;
}

/**
 * @param {object}   props
 * @param {Array}    props.users        – liste af brugerobjekter (uid, displayName, totalPoints)
 * @param {string}   [props.meUid]      – den indloggede brugers uid (fremhæves)
 * @param {string[]} [props.memberUids] – filtrer til kun disse uid'er (null = alle)
 * @param {function} [props.getPoints]  – fn(uid) → number; overskriver totalPoints-feltet
 * @param {boolean}  [props.loading]    – vis spinner
 * @param {string}   [props.emptyMsg]   – tekst når listen er tom
 * @param {boolean}  [props.showAvg]    – vis "Gns."-kolonne (point pr. tippet kamp)
 * @param {function} [props.getTipped]  – fn(uid) → antal tippede kampe (nævner i gns.)
 * @param {'total'|'avg'} [props.sortMode] – sortér efter total eller gennemsnit
 * @param {boolean}  [props.showBreakdown] – vis "Kampe"- og "Bonus"-kolonner (kun global total)
 * @param {function} [props.getBreakdown] – fn(user) → {match, bonus}; overstyrer standard-opdelingen (fx liga-scoring)
 * @param {function} [props.getMatchBreakdown] – fn(uid) → Array af kampe med point-opdeling; aktiverer udfoldelig pointhøst pr. spiller
 */
export default function StandingsTable({
  users = [],
  meUid = null,
  memberUids = null,
  getPoints = null,
  loading = false,
  emptyMsg = 'Ingen spillere at vise.',
  showMovement = false,
  showAvg = false,
  getTipped = null,
  sortMode = 'total',
  showBreakdown = false,
  getBreakdown = null,
  getMatchBreakdown = null,
}) {
  const [expandedUid, setExpandedUid] = useState(null);
  // Filtrer og sorter brugerene
  const rows = useMemo(() => {
    // Filtrer til medlemmer af valgt liga
    const filtered = filterByMembers(users, memberUids);

    // Beregn point (evt. fra ekstern funktion, f.eks. dagspoint) + gns. pr. tippet kamp
    const withPoints = filtered.map((u) => {
      const displayPoints = getPoints ? (getPoints(u.uid) ?? 0) : (u.totalPoints ?? 0);
      const tipped = getTipped ? (getTipped(u.uid) ?? 0) : 0;
      const bd = getBreakdown ? getBreakdown(u) : null;
      const matchPoints = bd ? bd.match : (u.groupPoints ?? 0) + (u.knockoutPoints ?? 0);
      const bonus = bd ? bd.bonus : (u.bonusPoints ?? 0);
      // Gns. = point pr. tippet kamp. Nævneren (tipped) tæller KUN kampe, så
      // tælleren skal også kun være kamp-point — bonus-spørgsmål hører ikke med,
      // ellers får spillere med mange bonuspoint et kunstigt højt snit.
      const avg = tipped > 0 ? Math.round((matchPoints / tipped) * 10) / 10 : null;
      return { ...u, displayPoints, tipped, avg, matchPoints, bonus };
    });

    // Sortér faldende — efter gns. når valgt, ellers efter total. Tiebreak: total, så navn.
    return withPoints.sort((a, b) => {
      if (showAvg && sortMode === 'avg') {
        const av = a.avg ?? -Infinity;
        const bv = b.avg ?? -Infinity;
        if (bv !== av) return bv - av;
      }
      if (b.displayPoints !== a.displayPoints) return b.displayPoints - a.displayPoints;
      return (a.displayName || '').localeCompare(b.displayName || '', 'da');
    });
  }, [users, memberUids, getPoints, getTipped, showAvg, sortMode, getBreakdown]);

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

  const colCount = 1 + (showMovement ? 1 : 0) + 1 + (showBreakdown ? 2 : 0) + 1 + (showAvg ? 1 : 0);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '2.5rem' }}>#</th>
            {showMovement && <th style={{ width: '2.5rem' }} title="Bevægelse siden i går">±</th>}
            <th>Spiller</th>
            {showBreakdown && <th style={{ textAlign: 'right' }} title="Point fra kampe (gruppe + slutspil)">Kampe</th>}
            {showBreakdown && <th style={{ textAlign: 'right' }} title="Point fra bonusspørgsmål">Bonus</th>}
            <th style={{ textAlign: 'right' }}>{showBreakdown ? 'Total' : 'Point'}</th>
            {showAvg && <th style={{ textAlign: 'right' }} title="Gennemsnitlige point pr. tippet kamp">Gns.</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((u, idx) => {
            const isMe = u.uid === meUid;
            const rank = idx + 1;
            const delta = showMovement && typeof u.previousRank === 'number'
              ? u.previousRank - rank
              : null;

            const canExpand = !!getMatchBreakdown;
            const isExpanded = canExpand && expandedUid === u.uid;
            const breakdown = isExpanded ? (getMatchBreakdown(u.uid) || []) : null;

            return (
              <Fragment key={u.uid}>
              <tr
                className={`${isMe ? 'is-me' : ''}${canExpand ? ' is-expandable' : ''}`}
                onClick={canExpand ? () => setExpandedUid(isExpanded ? null : u.uid) : undefined}
                style={canExpand ? { cursor: 'pointer' } : undefined}
              >
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

                {showMovement && (
                  <td><MovementArrow delta={delta} /></td>
                )}

                {/* Avatar + spillernavn + evt. "dig"-badge */}
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    {canExpand && (
                      <span
                        aria-hidden="true"
                        style={{ color: 'var(--c-muted)', fontSize: '0.7rem', width: '0.7rem', display: 'inline-block', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}
                      >
                        ▶
                      </span>
                    )}
                    <Avatar uid={u.uid} name={u.displayName} emoji={u.avatarEmoji}
                      favoriteTeam={u.favoriteTeam} size={28} />
                    <span className="text-bold" style={{ fontSize: '0.95rem' }}>
                      {u.displayName || '(ukendt)'}
                    </span>
                    {isMe && (
                      <span className="badge badge--blue" style={{ verticalAlign: 'middle' }}>
                        dig
                      </span>
                    )}
                  </span>
                </td>

                {/* Point fra kampe / bonus (kun global total) */}
                {showBreakdown && (
                  <td style={{ textAlign: 'right' }}>
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>{u.matchPoints}</span>
                  </td>
                )}
                {showBreakdown && (
                  <td style={{ textAlign: 'right' }}>
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>{u.bonus}</span>
                  </td>
                )}

                {/* Total (eller point når breakdown er skjult) */}
                <td style={{ textAlign: 'right' }}>
                  <span className="pts">{u.displayPoints}</span>
                </td>

                {/* Gns. point pr. tippet kamp */}
                {showAvg && (
                  <td style={{ textAlign: 'right' }} title={u.tipped ? `${u.matchPoints} kamp-point på ${u.tipped} tippede kampe` : 'Ingen tippede kampe endnu'}>
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>
                      {u.avg === null ? '–' : u.avg.toFixed(1).replace('.', ',')}
                    </span>
                  </td>
                )}
              </tr>

              {/* Udfoldet pointhøst: kampe spilleren har fået point i + type */}
              {isExpanded && (
                <tr className="breakdown-row">
                  <td colSpan={colCount} style={{ padding: 0 }}>
                    <PointBreakdown rows={breakdown} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

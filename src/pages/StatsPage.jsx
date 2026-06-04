// ---------------------------------------------------------------------------
// StatsPage – lækker statistik om dagens afgjorte kampe:
//   hvor mange ramte eksakt/udfald, gennemsnitspoint, mest populære tip,
//   hvem der ramte plet, og dagens topscorere.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { useTodayStats } from '../features/stats/useTodayStats';
import { computeMatchStats, topScorersOfDay, maxPointsForMatch } from '../features/stats/statsUtils';
import { teamName } from '../lib/teams';
import { ROUNDS } from '../lib/constants';
import Flag from '../components/Flag';
import Hero from '../components/Hero';

// Lille søjle med procent-fyld
function StatBar({ label, value, total, pct, color = 'var(--c-pitch)' }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 2 }}>
        <span>{label}</span>
        <strong>{value}/{total} · {pct}%</strong>
      </div>
      <div style={{ height: 8, background: 'var(--c-bg)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function MatchStatCard({ match, bets, usersById }) {
  const stats = computeMatchStats(match, bets);
  const maxPts = maxPointsForMatch(match);
  const r = match.result;
  const homeName = match.homeTeam ? teamName(match.homeTeam) : (match.homePlaceholder ?? '?');
  const awayName = match.awayTeam ? teamName(match.awayTeam) : (match.awayPlaceholder ?? '?');
  const exactNames = stats.exactUids.map((uid) => usersById?.[uid]?.displayName || 'Spiller');

  return (
    <div className="card" style={{ marginBottom: '0.85rem' }}>
      {/* Kamp + resultat */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
          {match.homeTeam && <Flag code={match.homeTeam} size={22} />} {homeName}
        </span>
        <span className="badge badge--blue" style={{ fontWeight: 800, fontSize: '0.9rem' }}>
          {r ? `${r.home}–${r.away}` : '—'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
          {awayName} {match.awayTeam && <Flag code={match.awayTeam} size={22} />}
        </span>
        {match.round && match.round !== ROUNDS.GROUP && r?.advance && (
          <span className="badge badge--muted">Videre: {teamName(r.advance)}</span>
        )}
      </div>

      {stats.total === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: 0 }}>Ingen tips på denne kamp.</p>
      ) : (
        <>
          <StatBar label="🎯 Ramte eksakt score" value={stats.exact} total={stats.total} pct={stats.exactPct} color="var(--c-ok)" />
          <StatBar label="✅ Ramte rigtigt udfald" value={stats.correctOutcome} total={stats.total} pct={stats.outcomePct} color="var(--c-pitch)" />

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
            <span className="badge badge--muted">{stats.total} tips</span>
            <span className="badge badge--yellow">⌀ {stats.avgPoints} af {maxPts} point</span>
            {stats.popular && (
              <span className="badge badge--blue">
                Mest tippet: {stats.popular.home}–{stats.popular.away} ({stats.popular.count}×)
              </span>
            )}
          </div>

          {exactNames.length > 0 && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--c-muted)' }}>Ramte plet: </span>
              {exactNames.map((n) => (
                <span key={n} className="badge badge--green" style={{ marginRight: 4 }}>🎯 {n}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StatsPage() {
  const { todayMatches, betsByMatch, usersById, pointsByUid, loading, error } = useTodayStats();

  const topScorers = useMemo(() => topScorersOfDay(pointsByUid, usersById, 3), [pointsByUid, usersById]);
  const totalTipsToday = useMemo(
    () => todayMatches.reduce((sum, m) => sum + (betsByMatch.get(m.id)?.length ?? 0), 0),
    [todayMatches, betsByMatch],
  );

  return (
    <div className="container">
      <Hero
        title="Statistik"
        subtitle="Se hvordan dagens kampe gik – hvor mange der ramte rigtigt, mest populære tip og dagens skarpeste spillere."
      />

      {error && <div className="card" style={{ borderColor: 'var(--c-err)', marginBottom: '1rem' }}>{error}</div>}
      {loading && <p style={{ color: 'var(--c-muted)' }}>Henter statistik…</p>}

      {!loading && !error && (
        <>
          {/* Dagens overblik */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card__header"><h2 className="card__title">Dagens overblik</h2></div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: topScorers.length ? '0.75rem' : 0 }}>
              <span className="badge badge--blue">{todayMatches.length} afgjorte kampe</span>
              <span className="badge badge--muted">{totalTipsToday} tips i dag</span>
            </div>
            {topScorers.length > 0 ? (
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                  Dagens topscorere
                </div>
                {topScorers.map((p, i) => (
                  <div key={p.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0' }}>
                    <span className={`medal medal--${i + 1}`}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ color: 'var(--c-pitch)', fontWeight: 800 }}>{p.points} point</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: 0 }}>
                Ingen point uddelt i dag endnu.
              </p>
            )}
          </div>

          {/* Per kamp */}
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.6rem' }}>Dagens kampe</h2>
          {todayMatches.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--c-muted)' }}>
              <div style={{ fontSize: '2rem' }}>📅</div>
              Ingen afgjorte kampe i dag endnu. Kom tilbage, når resultaterne er indtastet!
            </div>
          ) : (
            todayMatches.map((m) => (
              <MatchStatCard key={m.id} match={m} bets={betsByMatch.get(m.id) ?? []} usersById={usersById} />
            ))
          )}
        </>
      )}
    </div>
  );
}

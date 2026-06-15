// ---------------------------------------------------------------------------
// StatsPage – lækker statistik. To faner:
//   "I dag"            – dagens afsluttede kampe (træf, snit, populært tip, plet)
//   "Hele turneringen" – samlet overblik, mest overraskende resultat,
//                        bedst forudsagte kamp, og per-spiller træfsikkerhed.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { useStatsData } from '../features/stats/useStatsData';
import {
  computeMatchStats, topScorersOfDay, maxPointsForMatch,
  computeSeasonOverview, computePlayerAccuracy, mostSurprising, bestPredicted,
} from '../features/stats/statsUtils';
import { teamName } from '../lib/teams';
import { ROUNDS } from '../lib/constants';
import Flag from '../components/Flag';
import Hero from '../components/Hero';

const TAB_TODAY = 'today';
const TAB_SEASON = 'season';

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

function Teams({ match, size = 22 }) {
  const homeName = match.homeTeam ? teamName(match.homeTeam) : (match.homePlaceholder ?? '?');
  const awayName = match.awayTeam ? teamName(match.awayTeam) : (match.awayPlaceholder ?? '?');
  const r = match.result;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
        {match.homeTeam && <Flag code={match.homeTeam} size={size} />} {homeName}
      </span>
      <span className="badge badge--blue" style={{ fontWeight: 800, fontSize: '0.9rem' }}>
        {r ? `${r.home}–${r.away}` : '—'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
        {awayName} {match.awayTeam && <Flag code={match.awayTeam} size={size} />}
      </span>
    </div>
  );
}

function MatchStatCard({ match, bets, usersById }) {
  const stats = computeMatchStats(match, bets);
  const maxPts = maxPointsForMatch(match);
  const exactNames = stats.exactUids.map((uid) => usersById?.[uid]?.displayName || 'Spiller');

  return (
    <div className="card" style={{ marginBottom: '0.85rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Teams match={match} />
        {match.round && match.round !== ROUNDS.GROUP && match.result?.advance && (
          <span className="badge badge--muted" style={{ marginTop: 6 }}>Videre: {teamName(match.result.advance)}</span>
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
              <span className="badge badge--blue">Mest tippet: {stats.popular.home}–{stats.popular.away} ({stats.popular.count}×)</span>
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

// ─── "I dag"-fane ───────────────────────────────────────────────────────────
function TodayTab({ todayMatches, betsByMatch, usersById, pointsByUidToday }) {
  const topScorers = useMemo(() => topScorersOfDay(pointsByUidToday, usersById, 3), [pointsByUidToday, usersById]);
  const totalTips = useMemo(
    () => todayMatches.reduce((s, m) => s + (betsByMatch.get(m.id)?.length ?? 0), 0),
    [todayMatches, betsByMatch],
  );

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card__header"><h2 className="card__title">Dagens overblik</h2></div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: topScorers.length ? '0.75rem' : 0 }}>
          <span className="badge badge--blue">{todayMatches.length} afgjorte kampe</span>
          <span className="badge badge--muted">{totalTips} tips i dag</span>
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
          <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: 0 }}>Ingen point uddelt i dag endnu.</p>
        )}
      </div>

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
  );
}

// ─── "Hele turneringen"-fane ────────────────────────────────────────────────
function HighlightCard({ title, emoji, data, captionFor }) {
  if (!data) return null;
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card__header"><h2 className="card__title">{emoji} {title}</h2></div>
      <Teams match={data.match} />
      <p style={{ margin: '0.5rem 0 0', color: 'var(--c-muted)', fontSize: '0.88rem' }}>{captionFor(data.stats)}</p>
    </div>
  );
}

function SeasonTab({ matches, betsByMatch, usersById }) {
  const overview = useMemo(() => computeSeasonOverview(matches, betsByMatch), [matches, betsByMatch]);
  const players = useMemo(() => computePlayerAccuracy(matches, betsByMatch, usersById), [matches, betsByMatch, usersById]);
  const surprise = useMemo(() => mostSurprising(matches, betsByMatch), [matches, betsByMatch]);
  const best = useMemo(() => bestPredicted(matches, betsByMatch), [matches, betsByMatch]);

  if (overview.matches === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--c-muted)' }}>
        <div style={{ fontSize: '2rem' }}>📊</div>
        Sæson-statistikken fyldes, så snart de første kampe er afgjort.
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card__header"><h2 className="card__title">Hele turneringen</h2></div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge badge--blue">{overview.matches} afgjorte kampe</span>
          <span className="badge badge--muted">{overview.tips} tips</span>
          <span className="badge badge--green">🎯 {overview.exactPct}% eksakt</span>
          <span className="badge badge--green">✅ {overview.outcomePct}% udfald</span>
          <span className="badge badge--yellow">⌀ {overview.avgPoints} point/tip</span>
        </div>
      </div>

      <HighlightCard
        title="Mest overraskende resultat" emoji="😱" data={surprise}
        captionFor={(s) => `Kun ${s.outcomePct}% ramte udfaldet (${s.correctOutcome} af ${s.total} tips).`}
      />
      <HighlightCard
        title="Bedst forudsagte kamp" emoji="🔮" data={best}
        captionFor={(s) => `${s.exactPct}% ramte den eksakte score (${s.exact} af ${s.total} tips).`}
      />

      <div className="card">
        <div className="card__header"><h2 className="card__title">Træfsikkerhed pr. spiller</h2></div>
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Spiller</th>
                <th className="text-center">Tips</th>
                <th className="text-center">🎯 Eksakt</th>
                <th className="text-center">✅ Udfald</th>
                <th className="text-center" style={{ color: 'var(--c-pitch)' }}>Point</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.uid}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="text-center text-muted">{p.tips}</td>
                  <td className="text-center">{p.exact} <span style={{ color: 'var(--c-muted)' }}>({p.exactPct}%)</span></td>
                  <td className="text-center">{p.correctOutcome} <span style={{ color: 'var(--c-muted)' }}>({p.outcomePct}%)</span></td>
                  <td className="text-center"><strong>{p.points}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function StatsPage() {
  const [tab, setTab] = useState(TAB_SEASON);
  const { todayMatches, matches, betsByMatch, usersById, pointsByUidToday, loading, error } = useStatsData();

  return (
    <div className="container">
      <Hero
        title="Statistik"
        subtitle="Se hvordan kampene gik – hvem der rammer skarpest, hele turneringens facts og dagens overblik."
      />

      <div className="tabs" role="tablist">
        <button role="tab" className={`tab${tab === TAB_SEASON ? ' tab--active' : ''}`} aria-selected={tab === TAB_SEASON} onClick={() => setTab(TAB_SEASON)}>
          🏆 Hele turneringen
        </button>
        <button role="tab" className={`tab${tab === TAB_TODAY ? ' tab--active' : ''}`} aria-selected={tab === TAB_TODAY} onClick={() => setTab(TAB_TODAY)}>
          📅 I dag
        </button>
      </div>

      {error && <div className="card" style={{ borderColor: 'var(--c-err)', marginBottom: '1rem' }}>{error}</div>}
      {loading && <p style={{ color: 'var(--c-muted)' }}>Henter statistik…</p>}

      {!loading && !error && (
        tab === TAB_TODAY
          ? <TodayTab todayMatches={todayMatches} betsByMatch={betsByMatch} usersById={usersById} pointsByUidToday={pointsByUidToday} />
          : <SeasonTab matches={matches} betsByMatch={betsByMatch} usersById={usersById} />

      )}
    </div>
  );
}

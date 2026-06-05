// ---------------------------------------------------------------------------
// MatchesPage – kampoversigt med tip-formular.
// Sorterer kampe efter kickoff, grupperer visuelt per dag og runde.
// Filtre: Alle / I dag / Kommende / Mine utippede.
// ---------------------------------------------------------------------------
import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import {
  groupMatchesByDay,
  isMatchLocked,
  dayKey,
  roundLabel,
} from '../features/matches/matchHelpers';
import MatchCard from '../features/matches/MatchCard';
import DashboardHub from '../features/matches/DashboardHub';
import Hero from '../components/Hero';
import PointRules from '../components/PointRules';
import { useStandings } from '../features/leaderboard/useStandings';
import { TIMEZONE } from '../lib/constants';

// Filterkonstanter
const FILTER_ALL = 'alle';
const FILTER_TODAY = 'idag';
const FILTER_UPCOMING = 'kommende';
const FILTER_UNTIPPED = 'utippede';

/** Returnerer dansk dagsnøgle for i dag (til sammenligning). */
function todayKey() {
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export default function MatchesPage() {
  const { user } = useAuth();
  const { matches, loading, error } = useMatches();
  const { bets, loading: betsLoading } = useMyBets(user?.uid ?? null);
  const { standings } = useStandings();
  const [filter, setFilter] = useState(FILTER_ALL);

  // Opslag uid → profil (til avatar/navn i "se alles tips")
  const usersByUid = useMemo(() => {
    const m = {};
    for (const u of standings) m[u.uid] = u;
    return m;
  }, [standings]);

  const uid = user?.uid ?? '';
  const today = todayKey();

  // Anvend valgt filter på kamplisten
  const filteredMatches = useMemo(() => {
    switch (filter) {
      case FILTER_TODAY:
        return matches.filter((m) => dayKey(m.kickoff) === today);

      case FILTER_UPCOMING:
        return matches.filter((m) => !isMatchLocked(m.kickoff));

      case FILTER_UNTIPPED:
        return matches.filter(
          (m) => !isMatchLocked(m.kickoff) && !bets.has(m.id),
        );

      default:
        return matches;
    }
  }, [matches, filter, bets, today]);

  // Gruppér de filtrerede kampe per dag
  const dayGroups = useMemo(
    () => groupMatchesByDay(filteredMatches),
    [filteredMatches],
  );

  // Tæl utippede kampe til filterlabel
  const untippedCount = useMemo(
    () =>
      matches.filter((m) => !isMatchLocked(m.kickoff) && !bets.has(m.id))
        .length,
    [matches, bets],
  );

  const isLoading = loading || betsLoading;

  return (
    <div className="container">
      <Hero
        title="VM 2026 Tip"
        subtitle="Afgiv dine tips inden kampstart – point beregnes automatisk, og stillingen opdateres live."
        chips={['48 hold', '104 kampe', 'Dansk tid']}
      />

      {!isLoading && !error && (
        <DashboardHub
          matches={matches}
          bets={bets}
          onJumpToUntipped={() => setFilter(FILTER_UNTIPPED)}
        />
      )}

      <PointRules />

      {/* Filtre */}
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        {[
          { key: FILTER_ALL, label: 'Alle' },
          { key: FILTER_TODAY, label: 'I dag' },
          { key: FILTER_UPCOMING, label: 'Kommende' },
          {
            key: FILTER_UNTIPPED,
            label: `Mine utippede${untippedCount > 0 ? ` (${untippedCount})` : ''}`,
          },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`tab${filter === key ? ' tab--active' : ''}`}
            onClick={() => setFilter(key)}
            data-testid={`filter-${key}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && <div className="spinner" aria-label="Henter kampe…" />}

      {/* Fejl */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--c-err)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--c-err)', margin: 0 }}>
            Kunne ikke hente kampe. Tjek din internetforbindelse.
          </p>
        </div>
      )}

      {/* Tom tilstand */}
      {!isLoading && !error && filteredMatches.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🏟️</div>
          <div className="empty-state__title">
            {filter === FILTER_UNTIPPED
              ? 'Alle tilgængelige kampe er tippet!'
              : 'Ingen kampe fundet'}
          </div>
          <p>
            {filter === FILTER_TODAY
              ? 'Der er ingen kampe i dag.'
              : filter === FILTER_UPCOMING
              ? 'Ingen kommende kampe.'
              : ''}
          </p>
        </div>
      )}

      {/* Dag-grupper */}
      {!isLoading &&
        dayGroups.map((group) => {
          // Grupper yderligere per runde inden for dagen
          const roundGroups = group.matches.reduce((acc, m) => {
            const key = m.round;
            if (!acc[key]) acc[key] = [];
            acc[key].push(m);
            return acc;
          }, {});

          return (
            <div key={group.label} style={{ marginBottom: '1.5rem' }}>
              {/* Dag-overskrift */}
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--c-pitch)',
                  textTransform: 'capitalize',
                  margin: '0 0 0.75rem',
                  paddingBottom: '0.3rem',
                  borderBottom: '2px solid var(--c-pitch)',
                  display: 'inline-block',
                }}
              >
                {group.label}
              </h2>

              {/* Runde-undergrupper */}
              {Object.entries(roundGroups).map(([round, roundMatches]) => (
                <div key={round} style={{ marginBottom: '0.75rem' }}>
                  {/* Vis rundenavn kun for knockout */}
                  {round !== 'group' && (
                    <p
                      style={{
                        margin: '0 0 0.4rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: 'var(--c-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {roundLabel(round)}
                    </p>
                  )}
                  {roundMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      uid={uid}
                      bet={bets.get(match.id) ?? null}
                      usersByUid={usersByUid}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
    </div>
  );
}

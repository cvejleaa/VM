/**
 * DashboardPage — brugerens forside ("/"). Samler overblik og handlinger:
 * personlig velkomst, "Mine opgaver", næste kamp, og placering. Selve
 * kamplisten bor nu på sin egen side (/kampe).
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStandings } from '../features/leaderboard/useStandings';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import Hero from '../components/Hero';
import DashboardHub from '../features/matches/DashboardHub';
import TodoCard from '../features/dashboard/TodoCard';
import OnboardingChecklist from '../features/onboarding/OnboardingChecklist';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { standings } = useStandings();
  const { matches, loading: matchesLoading, error } = useMatches();
  const { bets } = useMyBets(user?.uid ?? null);

  const name = profile?.displayName || 'spiller';

  // Min placering + point ud fra (allerede sorterede) standings
  const { rank, points, playerCount } = useMemo(() => {
    const idx = standings.findIndex((u) => u.uid === user?.uid);
    return {
      rank: idx >= 0 ? idx + 1 : null,
      points: idx >= 0 ? (standings[idx].totalPoints ?? 0) : (profile?.totalPoints ?? 0),
      playerCount: standings.length,
    };
  }, [standings, user?.uid, profile?.totalPoints]);

  const chips = [
    rank ? `#${rank} af ${playerCount}` : 'Ny spiller',
    `${points} point`,
  ];

  return (
    <div className="container">
      <Hero
        title={`Hej, ${name}`}
        subtitle="Her er dit overblik – hvad mangler du at svare på, og hvornår er næste kamp?"
        chips={chips}
      />

      <OnboardingChecklist uid={user?.uid} />

      <TodoCard />

      {!matchesLoading && !error && (
        <DashboardHub
          matches={matches}
          bets={bets}
          onJumpToUntipped={() => navigate('/kampe?filter=utippede')}
        />
      )}

      {/* Genveje */}
      <div className="card" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link className="btn" to="/kampe">⚽ Til kampene</Link>
        <Link className="btn btn--ghost" to="/stilling">🏆 Stilling</Link>
        <Link className="btn btn--ghost" to="/ligaer">👥 Ligaer</Link>
        <Link className="btn btn--ghost" to="/hjaelp">❓ Sådan virker det</Link>
      </div>
    </div>
  );
}

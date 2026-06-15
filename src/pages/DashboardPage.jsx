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
import DayMatchesCard from '../features/matches/DayMatchesCard';
import MyStatsCard from '../features/dashboard/MyStatsCard';
import MiniStandings from '../features/dashboard/MiniStandings';
import RecentResultsCard from '../features/dashboard/RecentResultsCard';
import TodoCard from '../features/dashboard/TodoCard';
import OnboardingChecklist from '../features/onboarding/OnboardingChecklist';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { standings } = useStandings();
  const { matches, loading: matchesLoading, error } = useMatches();
  const { bets } = useMyBets(user?.uid ?? null);

  const name = profile?.displayName || 'spiller';

  // Min placering + point ud fra samlet pointstilling.
  // Ægte konkurrence-placering: deler man point, deler man plads
  // (alle på 0 point → alle nr. 1).
  const { rank, points, playerCount } = useMemo(() => {
    const mine = standings.find((u) => u.uid === user?.uid);
    const myPoints = mine?.totalPoints ?? profile?.totalPoints ?? 0;
    const ahead = standings.filter((u) => (u.totalPoints ?? 0) > myPoints).length;
    return { rank: ahead + 1, points: myPoints, playerCount: standings.length };
  }, [standings, user?.uid, profile?.totalPoints]);

  const chips = [
    playerCount > 0 ? `Placering: #${rank} af ${playerCount}` : 'Placering: –',
    `Point: ${points}`,
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

      {!matchesLoading && !error && <DayMatchesCard matches={matches} />}

      <MiniStandings standings={standings} uid={user?.uid} />

      {!matchesLoading && !error && (
        <div className="dashboard-stats-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <MyStatsCard matches={matches} bets={bets} />
          <RecentResultsCard matches={matches} bets={bets} />
        </div>
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

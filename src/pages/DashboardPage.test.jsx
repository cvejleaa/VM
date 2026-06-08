import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' }, profile: { displayName: 'Carsten', totalPoints: 12 } }),
}));
vi.mock('../features/leaderboard/useStandings', () => ({
  useStandings: () => ({ standings: [{ uid: 'x', totalPoints: 30 }, { uid: 'me', totalPoints: 12 }] }),
}));
vi.mock('../features/matches/useMatches', () => ({
  useMatches: () => ({ matches: [], loading: false, error: null }),
}));
vi.mock('../features/matches/useMyBets', () => ({
  useMyBets: () => ({ bets: new Map() }),
}));
vi.mock('../context/TasksContext', () => ({
  useTasks: () => ({ matchCount: 1, bonusCount: 0, leagueBonus: { total: 0, byLeague: [] }, total: 1 }),
}));

function renderPage() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage', () => {
  beforeEach(() => localStorage.clear());

  it('hilser brugeren personligt', () => {
    renderPage();
    expect(screen.getByText(/Hej, Carsten/)).toBeInTheDocument();
  });

  it('viser placering og point som chips', () => {
    renderPage();
    expect(screen.getByText('#2 af 2')).toBeInTheDocument();
    expect(screen.getByText('12 point')).toBeInTheDocument();
  });

  it('viser "Mine opgaver"-kortet', () => {
    renderPage();
    expect(screen.getByText('📋 Mine opgaver')).toBeInTheDocument();
    expect(screen.getByText(/kamp mangler tip/)).toBeInTheDocument();
  });

  it('viser genvej til kampene', () => {
    renderPage();
    expect(screen.getByText(/Til kampene/)).toBeInTheDocument();
  });
});

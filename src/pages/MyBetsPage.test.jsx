// Tests for MyBetsPage – overblik over brugerens tips.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock Firebase
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
}));

// Mock hooks
vi.mock('../features/matches/useMatches', () => ({
  useMatches: vi.fn(),
}));
vi.mock('../features/matches/useMyBets', () => ({
  useMyBets: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import MyBetsPage from './MyBetsPage';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import { useAuth } from '../context/AuthContext';

function renderPage() {
  return render(
    <MemoryRouter>
      <MyBetsPage />
    </MemoryRouter>,
  );
}

const pastKickoff = new Date('2020-06-15T18:00:00Z');
const futureKickoff = new Date('2099-06-15T18:00:00Z');

const mockMatches = [
  {
    id: 'm1',
    round: 'group',
    groupName: 'A',
    homeTeam: 'DK',
    awayTeam: 'FR',
    kickoff: pastKickoff,
    status: 'finished',
    result: { home: 2, away: 1 },
  },
  {
    id: 'm2',
    round: 'group',
    groupName: 'B',
    homeTeam: 'DE',
    awayTeam: 'ES',
    kickoff: futureKickoff,
    status: 'scheduled',
    result: null,
  },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'user1' } });
});

describe('MyBetsPage', () => {
  it('viser tom-tilstand når ingen tips er afgivet', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    useMyBets.mockReturnValue({ bets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText(/Ingen tips endnu/)).toBeInTheDocument();
  });

  it('viser tippede kampe i tabellen', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // DK og FR vises i tabellen
    expect(screen.getByText(/DK/)).toBeInTheDocument();
    expect(screen.getByText(/FR/)).toBeInTheDocument();
  });

  it('beregner korrekte totale point (5 for eksakt)', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    // Eksakt score 2-1 mod resultat 2-1 = 5 point
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-points')).toHaveTextContent('5');
  });

  it('beregner 2 point for korrekt udfald men forkert score', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    // Tip 3-1 mod resultat 2-1 = korrekt udfald men forkert score = 2 point
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 3, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-points')).toHaveTextContent('2');
  });

  it('viser rediger-link for ulåste kampe', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m2', { matchId: 'm2', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // m2 er i fremtiden, så der er et redigeringslink
    expect(screen.getByTitle('Rediger tip')).toBeInTheDocument();
  });

  it('viser spinner under indlæsning', () => {
    useMatches.mockReturnValue({ matches: [], loading: true });
    useMyBets.mockReturnValue({ bets: new Map(), loading: true });
    renderPage();
    expect(screen.getByLabelText('Henter tips…')).toBeInTheDocument();
  });

  it('viser statistik-oversigt med tippede kampe', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
      ['m2', { matchId: 'm2', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // 2 tippede kampe vises i statistikken
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

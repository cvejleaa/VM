// Tests for MatchesPage – mock Firebase og hooks.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock Firebase
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
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
vi.mock('../features/matches/Countdown', () => ({
  default: () => <span>Countdown</span>,
}));

import MatchesPage from './MatchesPage';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import { useAuth } from '../context/AuthContext';

function renderPage() {
  return render(
    <MemoryRouter>
      <MatchesPage />
    </MemoryRouter>,
  );
}

// Faste testkampe
const futureKickoff = new Date('2099-06-15T18:00:00Z');
const pastKickoff = new Date('2020-06-15T18:00:00Z');

const mockMatches = [
  {
    id: 'm1',
    round: 'group',
    groupName: 'A',
    homeTeam: 'DK',
    awayTeam: 'FR',
    kickoff: futureKickoff,
    status: 'scheduled',
    result: null,
  },
  {
    id: 'm2',
    round: 'group',
    groupName: 'B',
    homeTeam: 'DE',
    awayTeam: 'ES',
    kickoff: pastKickoff,
    status: 'finished',
    result: { home: 2, away: 1 },
  },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'user1' } });
  useMatches.mockReturnValue({ matches: mockMatches, loading: false, error: null });
  useMyBets.mockReturnValue({ bets: new Map(), loading: false, error: null });
});

describe('MatchesPage', () => {
  it('renderer filterknapper', () => {
    renderPage();
    expect(screen.getByTestId('filter-alle')).toBeInTheDocument();
    expect(screen.getByTestId('filter-idag')).toBeInTheDocument();
    expect(screen.getByTestId('filter-kommende')).toBeInTheDocument();
    expect(screen.getByTestId('filter-utippede')).toBeInTheDocument();
  });

  it('viser alle kampe som standard', () => {
    renderPage();
    const cards = screen.getAllByTestId('match-card');
    expect(cards.length).toBe(2);
  });

  it('filtrer til kun kommende kampe', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('filter-kommende'));
    const cards = screen.getAllByTestId('match-card');
    // Kun m1 er i fremtiden
    expect(cards.length).toBe(1);
  });

  it('viser spinner under indlæsning', () => {
    useMatches.mockReturnValue({ matches: [], loading: true, error: null });
    renderPage();
    expect(screen.getByLabelText('Henter kampe…')).toBeInTheDocument();
  });

  it('viser fejlbesked ved netværksfejl', () => {
    useMatches.mockReturnValue({ matches: [], loading: false, error: new Error('Fejl') });
    renderPage();
    expect(screen.getByText(/Kunne ikke hente kampe/)).toBeInTheDocument();
  });

  it('viser tom-tilstand når ingen kampe matcher filter', () => {
    useMatches.mockReturnValue({ matches: [], loading: false, error: null });
    renderPage();
    expect(screen.getByText(/Ingen kampe fundet/)).toBeInTheDocument();
  });

  it('filteret "Mine utippede" viser kun ulåste kampe uden bet', () => {
    // m2 er låst (pastKickoff), m1 er åben og ikke tippet
    renderPage();
    fireEvent.click(screen.getByTestId('filter-utippede'));
    const cards = screen.getAllByTestId('match-card');
    expect(cards.length).toBe(1);
  });

  it('viser (1) i utippede-filter når der er utippede kampe', () => {
    renderPage();
    expect(screen.getByTestId('filter-utippede').textContent).toContain('(1)');
  });
});

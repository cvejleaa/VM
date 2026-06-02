// Tests for MatchCard – bekræfter låst-tilstand, resultat og point.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Firebase
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

// Mock Countdown-komponenten (undgå timer-problemer)
vi.mock('./Countdown', () => ({
  default: () => <span data-testid="countdown">Countdown</span>,
}));

import MatchCard from './MatchCard';

// Hjælper: kickoff i fortiden (låst)
const pastKickoff = new Date('2020-01-01T12:00:00Z');
// Hjælper: kickoff i fremtiden (åben)
const futureKickoff = new Date('2099-01-01T12:00:00Z');

function makeMatch(overrides = {}) {
  return {
    id: 'match1',
    round: 'group',
    groupName: 'A',
    homeTeam: 'DK',
    awayTeam: 'FR',
    kickoff: futureKickoff,
    status: 'scheduled',
    result: null,
    stadium: 'Parken',
    city: 'København',
    ...overrides,
  };
}

describe('MatchCard', () => {
  it('viser to hold korrekt', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    // DK og FR er landekoder - de vises som navne i kortet
    expect(screen.getByText('DK')).toBeInTheDocument();
    expect(screen.getByText('FR')).toBeInTheDocument();
  });

  it('viser IKKE låst-badge for fremtidig kamp', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.queryByTestId('locked-badge')).not.toBeInTheDocument();
  });

  it('viser låst-badge for en kamp der allerede er startet', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('locked-badge')).toBeInTheDocument();
  });

  it('viser resultatet når kampen er finished', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 },
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('match-result')).toHaveTextContent('2–1');
  });

  it('viser optjente point for bruger med tip', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 },
    });
    // Korrekt udfald men forkert score → 2 point
    const bet = { home: 3, away: 1, matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toBeInTheDocument();
  });

  it('viser +5 point ved eksakt score', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 },
    });
    const bet = { home: 2, away: 1, matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toHaveTextContent('+5 point');
  });

  it('viser "Intet tip afgivet" for låst kamp uden tip', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('no-bet-msg')).toBeInTheDocument();
  });

  it('viser ScoreInput for fremtidig åben kamp', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByTestId('score-home')).toBeInTheDocument();
    expect(screen.getByTestId('score-away')).toBeInTheDocument();
  });

  it('skjuler ScoreInput for låst kamp', () => {
    const m = makeMatch({ kickoff: pastKickoff });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.queryByTestId('score-home')).not.toBeInTheDocument();
  });

  it('viser pending-teams besked for ukendte hold', () => {
    const m = makeMatch({
      homeTeam: null,
      awayTeam: null,
      homePlaceholder: 'Vinder gruppe A',
      awayPlaceholder: 'Vinder gruppe B',
      status: 'pendingTeams',
      kickoff: futureKickoff,
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('pending-teams-msg')).toBeInTheDocument();
  });

  it('viser advance-valg for knockout-kamp', () => {
    const m = makeMatch({ round: 'qf' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    // Advance-knapper for begge hold
    expect(screen.getByTestId('advance-DK')).toBeInTheDocument();
    expect(screen.getByTestId('advance-FR')).toBeInTheDocument();
  });

  it('viser videre-resultat for afgjort knockout', () => {
    const m = makeMatch({
      round: 'sf',
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 1, away: 0, advance: 'DK' },
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('advance-result')).toHaveTextContent('DK');
  });
});

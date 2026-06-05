/**
 * Tests for LeagueBonus — besvarelse/visning af liga-bonusspørgsmål.
 * Firebase-handlinger mockes.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LeagueBonus from './LeagueBonus';
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';

vi.mock('./leagueBonusActions', () => ({
  createLeagueBonus: vi.fn(),
  setLeagueBonusFacit: vi.fn(),
  deleteLeagueBonus: vi.fn(),
  saveLeagueBonusAnswer: vi.fn(),
  updateLeagueBonus: vi.fn(),
  approveLeagueBonusAnswer: vi.fn(),
  removeLeagueBonusAnswer: vi.fn(),
}));

const past = new Date(Date.now() - 3600_000);
const future = new Date(Date.now() + 3600_000);

const questions = [
  { id: 'q1', leagueId: 'L', type: LEAGUE_BONUS_TYPE.TEXT, label: 'Hvem bliver topscorer?', deadline: future, facit: null },
  { id: 'q2', leagueId: 'L', type: LEAGUE_BONUS_TYPE.TEXT, label: 'Hvem vinder?', deadline: past, facit: 'Messi' },
];

function renderBonus(props = {}) {
  return render(
    <LeagueBonus
      leagueId="L" meUid="me" isManager={false}
      questions={questions} myAnswers={{ q2: 'Messi' }} answersByQid={{}}
      {...props}
    />,
  );
}

describe('LeagueBonus', () => {
  it('viser spørgsmål med Åben/Låst status', () => {
    renderBonus();
    expect(screen.getByText('Hvem bliver topscorer?')).toBeInTheDocument();
    expect(screen.getByText('Åben')).toBeInTheDocument();
    expect(screen.getByText('Låst')).toBeInTheDocument();
  });

  it('viser "mangler at svare"-indikator for ubesvarede åbne spørgsmål', () => {
    renderBonus();
    expect(screen.getByText(/mangler at svare på 1/i)).toBeInTheDocument();
  });

  it('viser "Gem svar"-knap på åbne spørgsmål', () => {
    renderBonus();
    expect(screen.getByText('Gem svar')).toBeInTheDocument();
  });

  it('viser facit, dit svar og point på låst, afgjort spørgsmål', () => {
    renderBonus();
    expect(screen.getByText(/Facit:/)).toBeInTheDocument();
    expect(screen.getByText(/Dit svar:/)).toBeInTheDocument();
    expect(screen.getByText(/\+3 point/)).toBeInTheDocument(); // korrekt fritekst = 3
  });

  it('viser tom-tilstand uden spørgsmål', () => {
    renderBonus({ questions: [], myAnswers: {} });
    expect(screen.getByText(/Ingen bonusspørgsmål endnu/i)).toBeInTheDocument();
  });

  it('viser opret-knap for managere', () => {
    renderBonus({ isManager: true });
    expect(screen.getByText(/Nyt bonusspørgsmål/i)).toBeInTheDocument();
  });
});

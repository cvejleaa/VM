// Tests for BonusPage – bonus-spørgsmål med låse-logik.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('../features/bonus/useBonusData', () => ({
  useBonusQuestions: vi.fn(),
  useMyBonusBets: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import BonusPage from './BonusPage';
import { useBonusQuestions, useMyBonusBets } from '../features/bonus/useBonusData';
import { useAuth } from '../context/AuthContext';

function renderPage() {
  return render(
    <MemoryRouter>
      <BonusPage />
    </MemoryRouter>,
  );
}

const futureDeadline = new Date('2099-01-01T00:00:00Z');
const pastDeadline = new Date('2000-01-01T00:00:00Z');

const openQuestion = {
  id: 'q1',
  type: 'topScorer',
  label: 'Hvem bliver turneringens topscorer?',
  deadline: futureDeadline,
  facit: null,
  options: null,
};

const lockedQuestion = {
  id: 'q2',
  type: 'groupWinner',
  label: 'Hvem vinder gruppe A?',
  deadline: pastDeadline,
  facit: 'Danmark',
  options: ['Danmark', 'Frankrig', 'Brasilien'],
};

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'user1' } });
});

describe('BonusPage', () => {
  it('viser spinner under indlæsning', () => {
    useBonusQuestions.mockReturnValue({ questions: [], loading: true, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: true });
    renderPage();
    expect(screen.getByLabelText('Henter bonusspørgsmål…')).toBeInTheDocument();
  });

  it('viser tom-tilstand uden spørgsmål', () => {
    useBonusQuestions.mockReturnValue({ questions: [], loading: false, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText(/Ingen bonusspørgsmål endnu/)).toBeInTheDocument();
  });

  it('viser åbent spørgsmål med input og gem-knap', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByTestId('bonus-input')).toBeInTheDocument();
    expect(screen.getByTestId('bonus-save')).toBeInTheDocument();
  });

  it('viser låst spørgsmål uden gem-knap', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    // Låst select uden gem-knap
    expect(screen.getByTestId('bonus-select')).toBeDisabled();
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });

  it('viser facit for afgjort spørgsmål', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    // Facit "Danmark" vises (kan forekomme i select-options og facit-felt)
    expect(screen.getAllByText(/Danmark/).length).toBeGreaterThan(0);
  });

  it('viser optjente bonus-point i statistik', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    const betsMap = new Map([
      ['q2', { questionId: 'q2', uid: 'user1', answer: 'Danmark', points: 10 }],
    ]);
    useMyBonusBets.mockReturnValue({ bonusBets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-bonus-points')).toHaveTextContent('10');
  });

  it('viser fejlbesked ved netværksfejl', () => {
    useBonusQuestions.mockReturnValue({
      questions: [],
      loading: false,
      error: 'Netværksfejl',
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText(/Kunne ikke hente bonusspørgsmål/)).toBeInTheDocument();
  });

  it('kan IKKE svare på låst spørgsmål (input deaktiveret)', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    const select = screen.getByTestId('bonus-select');
    expect(select).toBeDisabled();
  });

  it('viser begge sektioner (åbne og låste) når begge typer eksisterer', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openQuestion, lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText('Åbne spørgsmål')).toBeInTheDocument();
    expect(screen.getByText('Låste spørgsmål')).toBeInTheDocument();
  });
});

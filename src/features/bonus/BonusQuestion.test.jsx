// Tests for BonusQuestion – sikrer at bonus-svar låses efter deadline.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Firebase
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

// Mock bonusHelpers for at kontrollere locked-tilstand
vi.mock('./bonusHelpers', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real };
});

import BonusQuestion from './BonusQuestion';

// Hjælper: lav et mock-spørgsmål
function makeQuestion(overrides = {}) {
  return {
    id: 'q1',
    type: 'topScorer',
    label: 'Hvem bliver turneringens topscorer?',
    deadline: new Date('2099-01-01T00:00:00Z'), // langt i fremtiden = åben
    facit: null,
    options: null,
    ...overrides,
  };
}

describe('BonusQuestion', () => {
  it('viser input-felt og gem-knap når åben', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-input')).toBeInTheDocument();
    expect(screen.getByTestId('bonus-save')).toBeInTheDocument();
  });

  it('viser select i stedet for input når options er sat', () => {
    const q = makeQuestion({ options: ['Belgien', 'Frankrig', 'Brasilien'] });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeInTheDocument();
    expect(screen.queryByTestId('bonus-input')).not.toBeInTheDocument();
  });

  it('deaktiverer svar-felt og skjuler gem-knap efter deadline (locked)', () => {
    // deadline i fortiden = låst
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-input')).toBeDisabled();
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });

  it('viser "Låst"-badge efter deadline', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText('Låst')).toBeInTheDocument();
  });

  it('viser facit og point når spørgsmålet er afgjort', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Kylian Mbappé',
    });
    const bet = { answer: 'Kylian Mbappé', points: 10, questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    // Facit vises (kan forekomme flere steder – brug getAllByText)
    expect(screen.getAllByText(/Kylian Mbappé/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+10 point/)).toBeInTheDocument();
  });

  it('viser brugerens eksisterende svar', () => {
    const q = makeQuestion();
    const bet = { answer: 'Erling Haaland', questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByText(/Erling Haaland/)).toBeInTheDocument();
  });

  it('deaktiverer select-felt efter deadline', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({
      deadline: past,
      options: ['Danmark', 'Frankrig'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeDisabled();
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });
});

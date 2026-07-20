import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { scoreLeagueBonus, leagueBonusPointsByUid } = require('./leagueBonusScoring');

describe('scoreLeagueBonus', () => {
  it('valg/ja-nej: eksakt match (uafhængigt af store/små bogstaver)', () => {
    expect(scoreLeagueBonus({ type: 'choice', facit: 'Brasilien' }, 'brasilien')).toBe(3);
    expect(scoreLeagueBonus({ type: 'choice', facit: 'Brasilien' }, 'Argentina')).toBe(0);
    expect(scoreLeagueBonus({ type: 'yesno', facit: 'Ja' }, 'ja')).toBe(2);
  });
  it('fritekst: fuzzy-match mod facit + godkendte stavemåder', () => {
    expect(scoreLeagueBonus({ type: 'text', facit: 'Mbappé' }, 'mbappe')).toBe(3);
    expect(scoreLeagueBonus({ type: 'text', facit: 'Mbappé', acceptedAnswers: ['Kylian'] }, 'kylian')).toBe(3);
  });
  it('top-liste: point pr. korrekt navn + ekstra for rigtig plads', () => {
    const q = { type: 'toplist', facit: ['Messi', 'Ronaldo', 'Mbappé'] };
    // Messi rigtig plads (2+1), Ronaldo rigtig plads (2+1), Haaland forkert (0)
    expect(scoreLeagueBonus(q, ['Messi', 'Ronaldo', 'Haaland'])).toBe(6);
    // Rigtige navne men ombyttede pladser → kun navne-point (2+2)
    expect(scoreLeagueBonus(q, ['Ronaldo', 'Messi'])).toBe(4);
  });
  it('uden facit eller svar → 0', () => {
    expect(scoreLeagueBonus({ type: 'choice', facit: '' }, 'x')).toBe(0);
    expect(scoreLeagueBonus({ type: 'choice', facit: 'x' }, '')).toBe(0);
  });
});

describe('leagueBonusPointsByUid', () => {
  const questions = [
    { id: 'q1', type: 'choice', facit: 'Brasilien' },
    { id: 'q2', type: 'yesno', facit: 'Ja' },
    { id: 'q3', type: 'choice', facit: '' }, // uden facit → tæller ikke
  ];
  const answers = [
    { uid: 'u1', questionId: 'q1', answer: 'Brasilien' }, // 3
    { uid: 'u1', questionId: 'q2', answer: 'Ja' },        // 2
    { uid: 'u2', questionId: 'q1', answer: 'Argentina' }, // 0
    { uid: 'u2', questionId: 'q2', answer: 'Ja' },        // 2
    { uid: 'u1', questionId: 'q3', answer: 'hvadsomhelst' }, // ignoreres (ingen facit)
  ];
  it('summerer point pr. uid, kun for spørgsmål med facit', () => {
    const totals = leagueBonusPointsByUid(questions, answers);
    expect(totals).toEqual({ u1: 5, u2: 2 });
  });
  it('tomt input → tomt resultat', () => {
    expect(leagueBonusPointsByUid([], [])).toEqual({});
  });
});

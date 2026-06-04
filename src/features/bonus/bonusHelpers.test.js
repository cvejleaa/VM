import { describe, it, expect } from 'vitest';
import { sortBonusQuestions, isBonusLocked } from './bonusHelpers';

describe('sortBonusQuestions', () => {
  it('placerer topscorer øverst og gruppevindere i A→L-rækkefølge', () => {
    const input = [
      { id: 'gw_C', type: 'groupWinner', groupName: 'C' },
      { id: 'gw_A', type: 'groupWinner', groupName: 'A' },
      { id: 'top', type: 'topScorer', groupName: null },
      { id: 'gw_B', type: 'groupWinner', groupName: 'B' },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['top', 'gw_A', 'gw_B', 'gw_C']);
  });

  it('muterer ikke input-arrayet', () => {
    const input = [
      { id: 'gw_B', type: 'groupWinner', groupName: 'B' },
      { id: 'top', type: 'topScorer' },
    ];
    const copy = [...input];
    sortBonusQuestions(input);
    expect(input).toEqual(copy);
  });

  it('håndterer tomt/undefined input', () => {
    expect(sortBonusQuestions([])).toEqual([]);
    expect(sortBonusQuestions(undefined)).toEqual([]);
  });
});

describe('isBonusLocked', () => {
  const now = new Date('2026-06-11T12:00:00Z');
  it('er låst når deadline er passeret', () => {
    expect(isBonusLocked(new Date('2026-06-11T11:00:00Z'), now)).toBe(true);
  });
  it('er åben før deadline', () => {
    expect(isBonusLocked(new Date('2026-06-11T13:00:00Z'), now)).toBe(false);
  });
  it('håndterer Firestore-timestamp (toDate)', () => {
    const ts = { toDate: () => new Date('2026-06-11T10:00:00Z') };
    expect(isBonusLocked(ts, now)).toBe(true);
  });
});

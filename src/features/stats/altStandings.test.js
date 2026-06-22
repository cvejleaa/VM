import { describe, it, expect } from 'vitest';
import { altTeamPoints, altMatchPoints, computeAltStandings } from './altStandings';

describe('altTeamPoints', () => {
  it('rigtigt giver +antal mål (og +2 for rigtigt 0)', () => {
    expect(altTeamPoints(2, 2)).toBe(2);
    expect(altTeamPoints(1, 1)).toBe(1);
    expect(altTeamPoints(0, 0)).toBe(2); // rigtigt 0 → +2
    expect(altTeamPoints(5, 5)).toBe(5);
  });
  it('forkert giver minus den absolutte forskel', () => {
    expect(altTeamPoints(3, 2)).toBe(-1);
    expect(altTeamPoints(2, 0)).toBe(-2);
    expect(altTeamPoints(0, 1)).toBe(-1);
    expect(altTeamPoints(0, 3)).toBe(-3);
  });
  it('ugyldige input giver 0', () => {
    expect(altTeamPoints(undefined, 2)).toBe(0);
    expect(altTeamPoints(2, null)).toBe(0);
  });
});

describe('altMatchPoints (brugerens eksempler)', () => {
  it('3-1 mod 2-1 → 0', () => {
    expect(altMatchPoints({ home: 3, away: 1 }, { home: 2, away: 1 })).toBe(0);
  });
  it('2-2 mod 0-2 → 0', () => {
    expect(altMatchPoints({ home: 2, away: 2 }, { home: 0, away: 2 })).toBe(0);
  });
  it('0-0 mod 1-3 → -4', () => {
    expect(altMatchPoints({ home: 0, away: 0 }, { home: 1, away: 3 })).toBe(-4);
  });
  it('eksakt 2-2 mod 2-2 → +4', () => {
    expect(altMatchPoints({ home: 2, away: 2 }, { home: 2, away: 2 })).toBe(4);
  });
  it('mangler tip eller resultat → 0', () => {
    expect(altMatchPoints({ home: 2 }, { home: 1, away: 1 })).toBe(0);
    expect(altMatchPoints({ home: 1, away: 1 }, null)).toBe(0);
  });
});

describe('computeAltStandings', () => {
  const usersById = { u1: { displayName: 'Anna' }, u2: { displayName: 'Bo' } };
  const matches = [
    { id: 'm1', result: { home: 2, away: 1 } },
    { id: 'm2', result: { home: 0, away: 2 } },
    { id: 'm3', result: null }, // ikke afsluttet → ignoreres
  ];
  const betsByMatch = new Map([
    ['m1', [{ uid: 'u1', home: 2, away: 1 }, { uid: 'u2', home: 3, away: 1 }]], // u1: +2+1=3 ; u2: -1+1=0
    ['m2', [{ uid: 'u1', home: 0, away: 2 }, { uid: 'u2', home: 2, away: 2 }]], // u1: +2+2=4 ; u2: -2+2=0
    ['m3', [{ uid: 'u1', home: 1, away: 1 }]],
  ]);

  it('summerer point pr. spiller og sorterer faldende', () => {
    const rows = computeAltStandings(matches, betsByMatch, usersById);
    expect(rows[0]).toMatchObject({ name: 'Anna', points: 7, matches: 2 });
    expect(rows[1]).toMatchObject({ name: 'Bo', points: 0, matches: 2 });
  });

  it('springer ugyldige tip over', () => {
    const rows = computeAltStandings(
      [{ id: 'm1', result: { home: 1, away: 1 } }],
      new Map([['m1', [{ uid: 'u1', home: 1 }]]]), // mangler away → tæller ikke
      usersById,
    );
    expect(rows).toEqual([]);
  });
});

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
  const players = [{ uid: 'u1', name: 'Anna' }, { uid: 'u2', name: 'Bo' }, { uid: 'u3', name: 'Cecilie' }];
  const matches = [
    { id: 'm1', result: { home: 2, away: 1 } },
    { id: 'm2', result: { home: 0, away: 2 } },
    { id: 'm3', result: null }, // ikke afsluttet → ignoreres
  ];
  const betsByMatch = new Map([
    ['m1', [{ uid: 'u1', home: 2, away: 1 }, { uid: 'u2', home: 3, away: 1 }]], // u1: +2+1=3 ; u2: -1+1=0
    ['m2', [{ uid: 'u1', home: 0, away: 2 }]], // u1: +2+2=4 ; u2 har IKKE tippet → -2
    ['m3', [{ uid: 'u1', home: 1, away: 1 }]],
  ]);

  it('summerer point og giver −2 for utippede kampe', () => {
    const rows = computeAltStandings(matches, betsByMatch, players);
    // u1: 3 + 4 = 7 (tippet begge)
    expect(rows[0]).toMatchObject({ name: 'Anna', points: 7, matches: 2, tipped: 2, untipped: 0 });
    // u2: 0 (m1) − 2 (m2 utippet) = −2
    const bo = rows.find((r) => r.name === 'Bo');
    expect(bo).toMatchObject({ points: -2, tipped: 1, untipped: 1 });
    // u3: −2 − 2 = −4 (intet tippet)
    const cecilie = rows.find((r) => r.name === 'Cecilie');
    expect(cecilie).toMatchObject({ points: -4, tipped: 0, untipped: 2 });
  });

  it('ugyldigt tip (mangler away) tæller som ikke-tippet → −2', () => {
    const rows = computeAltStandings(
      [{ id: 'm1', result: { home: 1, away: 1 } }],
      new Map([['m1', [{ uid: 'u1', home: 1 }]]]),
      [{ uid: 'u1', name: 'Anna' }],
    );
    expect(rows[0]).toMatchObject({ name: 'Anna', points: -2, tipped: 0, untipped: 1 });
  });
});

import { describe, it, expect } from 'vitest';
import { computeMatchStats, topScorersOfDay, maxPointsForMatch } from './statsUtils';
import { POINTS } from '../../lib/scoring';

const groupMatch = { round: 'group', result: { home: 2, away: 1 } };

describe('computeMatchStats', () => {
  it('returnerer nuller uden tips', () => {
    const s = computeMatchStats(groupMatch, []);
    expect(s).toMatchObject({ total: 0, exact: 0, correctOutcome: 0, avgPoints: 0, popular: null });
    expect(s.exactUids).toEqual([]);
  });

  it('returnerer nuller hvis kampen ikke har resultat', () => {
    const s = computeMatchStats({ round: 'group', result: null }, [{ uid: 'a', home: 1, away: 0 }]);
    expect(s.total).toBe(1);
    expect(s.exact).toBe(0);
  });

  it('tæller eksakt, udfald, gennemsnit og populært tip', () => {
    const bets = [
      { uid: 'a', home: 2, away: 1 }, // eksakt (5)
      { uid: 'b', home: 3, away: 1 }, // udfald, ikke eksakt (2)  [3-1 forskel 2 != 1]
      { uid: 'c', home: 2, away: 1 }, // eksakt (5)
      { uid: 'd', home: 0, away: 2 }, // forkert (0)
    ];
    const s = computeMatchStats(groupMatch, bets);
    expect(s.total).toBe(4);
    expect(s.exact).toBe(2);
    expect(s.exactPct).toBe(50);
    expect(s.correctOutcome).toBe(3); // a,b,c gættede hjemmesejr
    expect(s.outcomePct).toBe(75);
    expect(s.exactUids).toEqual(['a', 'c']);
    // point: 5+2+5+0 = 12 / 4 = 3
    expect(s.avgPoints).toBe(3);
    // populært tip: 2-1 (2 gange)
    expect(s.popular).toEqual({ home: 2, away: 1, count: 2 });
  });

  it('håndterer knockout med advance-bonus', () => {
    const ko = { round: 'r16', result: { home: 1, away: 1, advance: 'BRA' } };
    const bets = [{ uid: 'a', home: 1, away: 1, advance: 'BRA' }]; // 5 + 2 = 7
    const s = computeMatchStats(ko, bets);
    expect(s.avgPoints).toBe(POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE);
  });
});

describe('topScorersOfDay', () => {
  const users = { a: { displayName: 'Anna' }, b: { displayName: 'Bo' }, c: { displayName: 'Cleo' } };
  it('sorterer efter point faldende og filtrerer 0', () => {
    const top = topScorersOfDay({ a: 5, b: 8, c: 0 }, users);
    expect(top.map((t) => t.name)).toEqual(['Bo', 'Anna']);
  });
  it('respekterer limit', () => {
    const top = topScorersOfDay({ a: 5, b: 8, c: 3 }, users, 2);
    expect(top).toHaveLength(2);
  });
  it('håndterer tomt input', () => {
    expect(topScorersOfDay({}, users)).toEqual([]);
    expect(topScorersOfDay(undefined, undefined)).toEqual([]);
  });
});

describe('maxPointsForMatch', () => {
  it('gruppekamp = 5', () => {
    expect(maxPointsForMatch({ round: 'group' })).toBe(POINTS.EXACT);
  });
  it('knockout = 5 + advance-bonus', () => {
    expect(maxPointsForMatch({ round: 'final' })).toBe(POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE);
  });
});

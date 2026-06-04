import { describe, it, expect } from 'vitest';
import {
  computeMatchStats, topScorersOfDay, maxPointsForMatch,
  computeSeasonOverview, computePlayerAccuracy, mostSurprising, bestPredicted,
} from './statsUtils';
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

// ─── Sæson-statistik ────────────────────────────────────────────────────────
const seasonMatches = [
  { id: 'm1', round: 'group', result: { home: 2, away: 1 } },
  { id: 'm2', round: 'group', result: { home: 0, away: 0 } },
  { id: 'm3', round: 'group', result: null }, // ikke afgjort → ignoreres
];
const seasonBets = new Map([
  ['m1', [
    { uid: 'a', home: 2, away: 1 }, // eksakt (5)
    { uid: 'b', home: 1, away: 0 }, // hjemmesejr, samme målforskel +1 (3)
    { uid: 'c', home: 0, away: 1 }, // forkert (0)
  ]],
  ['m2', [
    { uid: 'a', home: 0, away: 0 }, // eksakt (5)
    { uid: 'b', home: 1, away: 1 }, // uafgjort, samme målforskel 0 (3)
  ]],
]);
const usersById = { a: { displayName: 'Anna' }, b: { displayName: 'Bo' }, c: { displayName: 'Cleo' } };

describe('computeSeasonOverview', () => {
  it('summerer på tværs af afsluttede kampe (ignorerer uafgjorte)', () => {
    const o = computeSeasonOverview(seasonMatches, seasonBets);
    expect(o.matches).toBe(2);
    expect(o.tips).toBe(5);
    expect(o.exact).toBe(2);          // a på m1 + a på m2
    expect(o.correctOutcome).toBe(4); // a,b på m1 + a,b på m2
    expect(o.totalPoints).toBe(5 + 3 + 0 + 5 + 3); // 16
  });
  it('returnerer nuller uden kampe', () => {
    expect(computeSeasonOverview([], new Map())).toMatchObject({ matches: 0, tips: 0, totalPoints: 0 });
  });
});

describe('computePlayerAccuracy', () => {
  it('aggregerer pr. spiller og sorterer efter point', () => {
    const rows = computePlayerAccuracy(seasonMatches, seasonBets, usersById);
    expect(rows[0].name).toBe('Anna');
    expect(rows[0].points).toBe(10); // 5 + 5
    expect(rows[0].exact).toBe(2);
    expect(rows[0].tips).toBe(2);
    expect(rows[0].exactPct).toBe(100);
    const bo = rows.find((r) => r.uid === 'b');
    expect(bo.points).toBe(6); // 3 + 3
    expect(bo.correctOutcome).toBe(2);
  });
});

describe('mostSurprising / bestPredicted', () => {
  it('mest overraskende = lavest udfalds-procent (min tips)', () => {
    const s = mostSurprising(seasonMatches, seasonBets, 2);
    // m1: udfald 2/3=67%, m2: 2/2=100% → m1 mest overraskende
    expect(s.match.id).toBe('m1');
  });
  it('bedst forudsagt = højest eksakt-procent', () => {
    const b = bestPredicted(seasonMatches, seasonBets, 2);
    // m1 eksakt 1/3=33%, m2 eksakt 1/2=50% → m2
    expect(b.match.id).toBe('m2');
  });
  it('returnerer null hvis ingen kamp har nok tips', () => {
    expect(mostSurprising(seasonMatches, seasonBets, 99)).toBeNull();
    expect(bestPredicted(seasonMatches, seasonBets, 99)).toBeNull();
  });
});

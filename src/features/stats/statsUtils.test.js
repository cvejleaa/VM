import { describe, it, expect } from 'vitest';
import {
  computeMatchStats, topScorersOfDay, maxPointsForMatch,
  computeSeasonOverview, computePlayerAccuracy, mostSurprising, bestPredicted,
  computeDiscipline,
  computeGoalsByInterval, computeTournamentFacts, computeSecondHalfStats,
  computeFieryMatches, computeRefereeStats, pointsByUidForMatches,
  computeCountryStats,
  computeXgOverUnder, computeRecords, computeMvpTally,
  computeGoalkeeperRanking, computePenaltyShootouts, computeTeamStyles,
  computePlayerLeaderboards, computeTeamPlayers, computePlayerProfile,
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

describe('computeDiscipline', () => {
  const matches = [
    { homeTeam: 'BRA', awayTeam: 'ARG', details: { bookings: [
      { side: 'home', player: 'A', card: 'YELLOW' },
      { side: 'away', player: 'B', card: 'RED' },
      { side: 'home', player: 'A', card: 'YELLOW' },
    ] } },
    { homeTeam: 'BRA', awayTeam: 'FRA', details: { bookings: [
      { side: 'away', player: 'C', card: 'YELLOW_RED' },
    ] } },
    { homeTeam: 'DEN', awayTeam: 'ENG' }, // ingen details
  ];

  it('aggregerer kort pr. hold og spiller', () => {
    const { teams, players, totals } = computeDiscipline(matches);
    expect(totals).toEqual({ yellow: 2, red: 2 });
    // ARG har et rødt (vægter tungest) → øverst
    expect(teams[0]).toMatchObject({ code: 'ARG', red: 1 });
    // Spiller A har 2 gule
    const a = players.find((p) => p.name === 'A');
    expect(a).toMatchObject({ name: 'A', team: 'BRA', yellow: 2, red: 0 });
    // YELLOW_RED tæller som rødt
    const c = players.find((p) => p.name === 'C');
    expect(c).toMatchObject({ red: 1 });
  });

  it('håndterer tomt input', () => {
    expect(computeDiscipline([])).toEqual({ teams: [], players: [], totals: { yellow: 0, red: 0 }, allTeams: [] });
    expect(computeDiscipline(null).totals).toEqual({ yellow: 0, red: 0 });
  });

  it('allTeams indeholder ALLE deltagende nationer — også dem med 0 kort', () => {
    const { allTeams } = computeDiscipline(matches);
    const codes = allTeams.map((t) => t.code);
    // Kun gyldige landekoder (i TEAMS) fra kampene: BRA, ARG, FRA, ENG.
    expect(new Set(codes)).toEqual(new Set(['BRA', 'ARG', 'FRA', 'ENG']));
    // ENG spillede uden kort → 0/0, men er stadig med
    const eng = allTeams.find((t) => t.code === 'ENG');
    expect(eng).toMatchObject({ code: 'ENG', yellow: 0, red: 0 });
    // ARG (rødt kort) ligger før de kortløse nationer
    expect(codes.indexOf('ARG')).toBeLessThan(codes.indexOf('ENG'));
  });
});

// ─── Turnerings-fakta ───────────────────────────────────────────────────────

const g = (minute, side, type = 'REGULAR', injuryTime = 0) => ({ minute, side, type, injuryTime });

describe('computeGoalsByInterval', () => {
  it('fordeler mål på de rigtige intervaller', () => {
    const matches = [{ id: 'm', homeTeam: 'A', awayTeam: 'B', result: { home: 3, away: 3 }, details: { goals: [
      g(3, 'home'), g(15, 'away'), g(45, 'home', 'REGULAR', 2), g(60, 'away'),
      g(90, 'home', 'REGULAR', 4), g(105, 'away'),
    ] } }];
    const { bins, total, peak } = computeGoalsByInterval(matches);
    const by = Object.fromEntries(bins.map((b) => [b.label, b.count]));
    expect(total).toBe(6);
    expect(by['0-15']).toBe(2);   // 3' og 15'
    expect(by['45+']).toBe(1);    // 45+2
    expect(by['46-60']).toBe(1);  // 60'
    expect(by['90+']).toBe(2);    // 90+4 og 105'
    expect(peak.count).toBe(2);
  });

  it('tæller kun afgjorte kampe (live kamp uden resultat udelades)', () => {
    const matches = [
      { id: 'done', homeTeam: 'A', awayTeam: 'B', result: { home: 1, away: 0 }, details: { goals: [g(10, 'home')] } },
      { id: 'live', homeTeam: 'C', awayTeam: 'D', details: { goals: [g(20, 'home'), g(30, 'away')] } }, // intet resultat
    ];
    expect(computeGoalsByInterval(matches).total).toBe(1); // kun 'done'-kampens mål
  });

  it('håndterer tomt input', () => {
    expect(computeGoalsByInterval([])).toMatchObject({ total: 0, peak: null });
  });
});

describe('computeTournamentFacts', () => {
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 2, away: 1 },
      details: { goals: [g(10, 'home'), g(20, 'away', 'PENALTY'), g(80, 'home', 'OWN')] } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', result: { home: 1, away: 2 },
      details: { goals: [g(5, 'away')] } },
  ];
  it('tæller mål fra mål-feedet, så i alt = hjemme+ude = sum af typer', () => {
    const f = computeTournamentFacts(matches);
    expect(f.played).toBe(2);
    // 4 mål i feedet: match1 [home10, away20 (str.), home80 (selvmål)] + match2 [away5].
    expect(f.totalGoals).toBe(4);
    expect(f.goalsPerMatch).toBe(2);
    // Selvmålet (side 'home') tæller for MODSTANDEREN → ude.
    expect(f.homeGoals).toBe(1);
    expect(f.awayGoals).toBe(3);
    expect(f.typeBreakdown).toEqual({ regular: 2, penalty: 1, own: 1 });
    // Konsistens: i alt = hjemme+ude = sum af typer.
    expect(f.homeGoals + f.awayGoals).toBe(f.totalGoals);
    const t = f.typeBreakdown;
    expect(t.regular + t.penalty + t.own).toBe(f.totalGoals);
  });
  it('en afgjort kamp uden mål-feed bidrager 0 (undgår modstrid med typefordelingen)', () => {
    const only = [{ id: 'x', homeTeam: 'A', awayTeam: 'B', result: { home: 3, away: 1 } }];
    const f = computeTournamentFacts(only);
    expect(f.played).toBe(1);
    expect(f.totalGoals).toBe(0);
    expect(f.typeBreakdown).toEqual({ regular: 0, penalty: 0, own: 0 });
  });
  it('finder hyppigste resultat (rækkefølge-uafhængigt) samt tidligste/seneste mål', () => {
    const f = computeTournamentFacts(matches);
    // 2-1 og 2-1 (1-2 normaliseres) → "2-1" set 2 gange.
    expect(f.frequentResults[0]).toEqual({ score: '2-1', count: 2 });
    expect(f.earliest.minute).toBe(5);
    expect(f.latest.minute).toBe(80);
  });
});

describe('computeCountryStats', () => {
  // BRA-ARG: BRA 2 (1 straffe) - ARG 1. GER-BRA: GER 1 (selvmål af BRA-spiller) - BRA 0.
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 2, away: 1 },
      details: {
        goals: [g(10, 'home'), g(20, 'home', 'PENALTY'), g(80, 'away')],
        bookings: [{ side: 'home', card: 'YELLOW' }, { side: 'away', card: 'RED' }, { side: 'away', card: 'YELLOW_RED' }],
      } },
    // Selvmål er gemt på målscorerens side (BRA = ude her), krediteres GER (hjemme).
    { id: '2', homeTeam: 'GER', awayTeam: 'BRA', result: { home: 1, away: 0 },
      details: { goals: [g(55, 'away', 'OWN')], bookings: [] } },
  ];
  const { list, totals } = computeCountryStats(matches);
  const byCode = Object.fromEntries(list.map((r) => [r.code, r]));

  it('mål for/imod inkl. straffe og selvmål', () => {
    expect(byCode.BRA.goalsFor).toBe(2);      // 2 i kamp 1
    expect(byCode.BRA.goalsAgainst).toBe(2);  // 1 (ARG) + 1 (eget selvmål i kamp 2)
    expect(byCode.ARG.goalsFor).toBe(1);
    expect(byCode.ARG.goalsAgainst).toBe(2);
    expect(byCode.GER.goalsFor).toBe(1);      // selvmålet tæller for GER
    expect(byCode.GER.goalsAgainst).toBe(0);
  });
  it('straffemål krediteres målscoreren', () => {
    expect(byCode.BRA.penaltyFor).toBe(1);
    expect(byCode.ARG.penaltyFor).toBe(0);
  });
  it('selvmål for/imod: for = modtager, imod = den der begik det', () => {
    expect(byCode.GER.ownFor).toBe(1);     // GER fik målet
    expect(byCode.BRA.ownAgainst).toBe(1); // BRA-spiller lavede selvmålet
    expect(byCode.BRA.ownFor).toBe(0);
    expect(byCode.GER.ownAgainst).toBe(0);
  });
  it('gule/røde kort (2. gule = rødt)', () => {
    expect(byCode.BRA.yellow).toBe(1);
    expect(byCode.ARG.red).toBe(2); // ét rødt + ét andet-gult-rødt
  });
  it('total: mål for = mål imod (hvert mål tælles én gang hver vej)', () => {
    expect(totals.goalsFor).toBe(totals.goalsAgainst);
    expect(totals.goalsFor).toBe(4); // 2+1+1
  });
});

describe('computeXgOverUnder', () => {
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 2, away: 0 },
      details: { stats: { home: { xg: 1.0 }, away: { xg: 1.5 } }, goals: [g(10, 'home'), g(20, 'home')] } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', result: { home: 0, away: 0 },
      details: { goals: [] } }, // ingen stats → udelades
  ];
  it('diff = faktiske mål − xG, kun kampe med xG', () => {
    const list = computeXgOverUnder(matches);
    const bra = list.find((r) => r.code === 'BRA');
    expect(bra).toMatchObject({ goals: 2, xg: 1.0, diff: 1.0 }); // klinisk
    const arg = list.find((r) => r.code === 'ARG');
    expect(arg).toMatchObject({ goals: 0, xg: 1.5, diff: -1.5 }); // sløsede
    expect(list.find((r) => r.code === 'GER')).toBeUndefined(); // ingen stats
    expect(list[0].code).toBe('BRA'); // sorteret efter diff faldende
  });
});

describe('computeRecords', () => {
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 3, away: 2 },
      details: { goals: [g(5, 'away'), g(15, 'away'), g(60, 'home'), g(70, 'home'), g(88, 'home')] } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', result: { home: 4, away: 0 },
      details: { goals: [g(30, 'home'), g(40, 'home'), g(50, 'home'), g(90, 'home', 'REGULAR', 3)] } },
  ];
  const r = computeRecords(matches);
  it('hurtigste og seneste mål', () => {
    expect(r.fastest.minute).toBe(5);
    expect(r.latest).toMatchObject({ minute: 90, injuryTime: 3 });
  });
  it('største sejr og mål-rigeste kamp', () => {
    expect(r.biggestWin).toMatchObject({ id: '2', margin: 4 });
    expect(r.highest).toMatchObject({ id: '1', total: 5 }); // 3-2 = 5 mål
  });
  it('største comeback: BRA var bagud 0-2 og vandt 3-2', () => {
    expect(r.comeback).toMatchObject({ id: '1', deficit: 2, winner: 'BRA' });
  });
});

describe('computeMvpTally', () => {
  it('tæller top-spilleren pr. kamp med land + billede (begge power-index-formater)', () => {
    const matches = [
      { id: '1', homeTeam: 'ARG', awayTeam: 'FRA', result: { home: 1, away: 0 },
        details: { powerRanking: { outfield: [{ id: 'm10', name: 'Messi', side: 'home', picture: 'p.jpg' }, { name: 'X', side: 'away' }] } } },
      { id: '2', homeTeam: 'FRA', awayTeam: 'ARG', result: { home: 1, away: 0 },
        details: { powerRanking: [{ name: 'Messi', side: 'away' }] } }, // gammelt format
      { id: '3', homeTeam: 'NOR', awayTeam: 'GER', result: { home: 1, away: 0 },
        details: { powerRanking: { outfield: [{ name: 'Haaland', side: 'home' }] } } },
    ];
    const list = computeMvpTally(matches);
    expect(list[0]).toMatchObject({ name: 'Messi', count: 2, picture: 'p.jpg', code: 'ARG', id: 'm10' });
    expect(list.find((p) => p.name === 'Haaland')).toMatchObject({ count: 1, code: 'NOR' });
    expect(list.length).toBe(2); // returnerer ALLE (ingen limit)
  });
});

describe('computeGoalkeeperRanking', () => {
  const matches = [
    { id: '1', homeTeam: 'BEL', awayTeam: 'EGY', result: { home: 1, away: 1 },
      details: { powerRanking: { outfield: [], goalkeepers: [
        { name: 'Courtois', side: 'home', defending: 8, inPossession: 4, total: 12, picture: 'c.jpg', id: 'gk1' },
        { name: 'Shoubir', side: 'away', defending: 6, inPossession: 3, total: 9 },
      ] } } },
    { id: '2', homeTeam: 'FRA', awayTeam: 'BEL', result: { home: 0, away: 0 },
      details: { powerRanking: { outfield: [], goalkeepers: [
        { name: 'Courtois', side: 'away', defending: 6, inPossession: 5, total: 11 },
      ] } } },
    { id: '3', homeTeam: 'A', awayTeam: 'B', result: { home: 1, away: 0 },
      details: { powerRanking: [{ name: 'X' }] } }, // gammelt format → ingen keepere
  ];
  it('aggregerer keeper-scorer med land, billede og kampantal', () => {
    const list = computeGoalkeeperRanking(matches);
    const c = list.find((k) => k.name === 'Courtois');
    expect(c).toMatchObject({ matches: 2, code: 'BEL', picture: 'c.jpg', best: 8, id: 'gk1' });
    expect(c.avgDef).toBe(7); // (8+6)/2
    expect(list[0].name).toBe('Courtois'); // højest gnsn. forsvar → øverst
  });
});

describe('computePenaltyShootouts', () => {
  const matches = [
    { id: 'r16', homeTeam: 'SUI', awayTeam: 'COL', result: { home: 0, away: 0, penalties: { home: 4, away: 3 } },
      details: { events: [
        { period: 11, type: 41, side: 'away', player: 'Quintero' },
        { period: 11, type: 41, side: 'home', player: 'Xhaka' },
        { period: 11, type: 60, side: 'away', player: 'Sanchez', idPlayer: 'p99' },
        { period: 5, type: 12, side: 'home', player: 'X' }, // ikke straffekonkurrence
      ] } },
    { id: 'grp', homeTeam: 'A', awayTeam: 'B', result: { home: 1, away: 0 }, details: { events: [] } },
  ];
  const { shootouts, missers } = computePenaltyShootouts(matches);
  it('bygger spark-for-spark pr. konkurrence', () => {
    expect(shootouts).toHaveLength(1);
    expect(shootouts[0]).toMatchObject({ home: 'SUI', away: 'COL', homeScored: 1, awayScored: 1 });
    expect(shootouts[0].kicks).toHaveLength(3);
  });
  it('tæller brændte straffe pr. skytte', () => {
    expect(missers[0]).toMatchObject({ name: 'Sanchez', missed: 1, code: 'COL', id: 'p99' });
  });
});

describe('computeTeamStyles', () => {
  const raw = (over) => ({ PhaseAggregateHighPress: 0, PhaseAggregateBuildUpUnopposed: 0, PhaseAggregateBuildUpOpposed: 0, PhaseAggregateProgression: 0, PhaseAggregateFinalThird: 0, PhaseAggregateCounterattack: 0, PhaseAggregateLowBlock: 0, ...over });
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 1, away: 0 },
      details: { statsRaw: { home: raw({ PhaseAggregateHighPress: 10 }), away: raw({ PhaseAggregateLowBlock: 20 }) } } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', result: { home: 0, away: 0 }, details: {} }, // ingen statsRaw
  ];
  const { axes, teams } = computeTeamStyles(matches);
  it('6 akser, normaliseret 0-100 ift. feltet', () => {
    expect(axes).toHaveLength(6);
    const bra = teams.find((t) => t.code === 'BRA');
    const arg = teams.find((t) => t.code === 'ARG');
    // BRA har max Højt pres (akse 0) → 100; ARG har 0 på den akse.
    expect(bra.values[0]).toBe(100);
    expect(arg.values[0]).toBe(0);
    // ARG har max Lav blok (akse 5) → 100.
    expect(arg.values[5]).toBe(100);
    expect(bra.matches).toBe(1);
  });
  it('hold uden statsRaw udelades', () => {
    expect(teams.find((t) => t.code === 'GER')).toBeUndefined();
  });
});

describe('computePlayerLeaderboards', () => {
  const P = (name, side, stats) => ({ name, side, stats });
  const matches = [
    { id: '1', homeTeam: 'ARG', awayTeam: 'FRA', result: { home: 1, away: 0 },
      details: { playerStats: {
        10: P('Messi', 'home', { AttemptAtGoal: 6, AttemptAtGoalOnTarget: 3, Assists: 2, TopSpeed: 30, TotalDistance: 10000, TimePlayed: 90 }),
        20: P('Mbappe', 'away', { AttemptAtGoal: 4, AttemptAtGoalOnTarget: 4, Assists: 0, TopSpeed: 36, TotalDistance: 11000, TimePlayed: 90 }),
      } } },
    { id: '2', homeTeam: 'ARG', awayTeam: 'GER', result: { home: 2, away: 0 },
      details: { playerStats: {
        10: P('Messi', 'home', { AttemptAtGoal: 2, AttemptAtGoalOnTarget: 1, Assists: 1, TopSpeed: 31, TotalDistance: 9000, TimePlayed: 100 }),
      } } },
  ];
  const b = computePlayerLeaderboards(matches, { minShots: 4 });
  it('flest skud summeret over kampe', () => {
    expect(b.shots[0]).toMatchObject({ name: 'Messi', value: 8, code: 'ARG' }); // 6+2
  });
  it('træfsikkerhed % (kun over min. skud)', () => {
    const mbappe = b.accuracy.find((p) => p.name === 'Mbappe');
    expect(mbappe).toMatchObject({ value: 100, sub: '4/4' });
    // Messi: 4/8 = 50%
    expect(b.accuracy.find((p) => p.name === 'Messi').value).toBe(50);
  });
  it('assists, tophastighed (max) og distance (km)', () => {
    expect(b.assists[0]).toMatchObject({ name: 'Messi', value: 3 });
    expect(b.topSpeed[0]).toMatchObject({ name: 'Mbappe', value: 36 });
    expect(b.distance.find((p) => p.name === 'Messi').value).toBe(19); // 19000 m → 19 km
  });
  it('løb pr. minut = distance/spillede minutter', () => {
    // Messi: 19000 m / 190 min = 100 m/min; Mbappe: 11000 / 90 ≈ 122.
    const messi = b.workRate.find((p) => p.name === 'Messi');
    expect(messi.value).toBe(100);
    expect(b.workRate[0].name).toBe('Mbappe'); // højere m/min → øverst
  });
});

describe('computeTeamPlayers', () => {
  const P = (name, side, stats) => ({ name, side, stats });
  const matches = [
    { id: '1', homeTeam: 'ARG', awayTeam: 'FRA', result: { home: 1, away: 0 },
      details: { playerStats: {
        10: P('Messi', 'home', { Goals: 1, Assists: 1, AttemptAtGoal: 5 }),
        20: P('Mbappe', 'away', { Goals: 2, Assists: 0, AttemptAtGoal: 6 }), // andet hold
      } } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ARG', result: { home: 0, away: 2 },
      details: { playerStats: {
        10: P('Messi', 'away', { Goals: 2, Assists: 0, AttemptAtGoal: 3 }),
        30: P('Alvarez', 'away', { Goals: 1, Assists: 2, AttemptAtGoal: 2 }),
      } } },
  ];
  it('aggregerer kun holdets egne spillere, sorteret efter mål', () => {
    const list = computeTeamPlayers(matches, 'ARG');
    expect(list.map((p) => p.name)).toEqual(['Messi', 'Alvarez']);
    expect(list[0]).toMatchObject({ name: 'Messi', goals: 3, assists: 1, shots: 8, matches: 2 });
    expect(list.find((p) => p.name === 'Mbappe')).toBeUndefined(); // modstander
  });
});

describe('computePlayerProfile', () => {
  const matches = [
    { id: '1', homeTeam: 'ARG', awayTeam: 'FRA', result: { home: 1, away: 0 },
      details: { playerStats: { 10: { name: 'Messi', side: 'home', stats: { Goals: 1, Assists: 1, AttemptAtGoal: 4, AttemptAtGoalOnTarget: 2, TopSpeed: 30, TotalDistance: 10000 } } } } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ARG', result: { home: 0, away: 2 },
      details: { playerStats: { 10: { name: 'Messi', side: 'away', stats: { Goals: 2, Assists: 0, AttemptAtGoal: 6, AttemptAtGoalOnTarget: 4, TopSpeed: 32, TotalDistance: 9000 } } } } },
  ];
  it('aggregerer en spillers nøgletal + per-kamp', () => {
    const p = computePlayerProfile(matches, '10');
    expect(p).toMatchObject({ name: 'Messi', code: 'ARG', matches: 2, goals: 3, assists: 1, shots: 10, onTarget: 6 });
    expect(p.accuracy).toBe(60); // 6/10
    expect(p.topSpeed).toBe(32); // max
    expect(p.distance).toBe(19); // 19000 m → 19 km
    expect(p.perMatch).toHaveLength(2);
    expect(p.perMatch[1]).toMatchObject({ opp: 'GER', goals: 2 }); // kamp 2, ARG ude → modstander GER
  });
  it('null når spilleren ikke findes', () => {
    expect(computePlayerProfile(matches, '999')).toBeNull();
  });
});

describe('computeSecondHalfStats', () => {
  const matches = [
    // Comeback: ude førte 0-1 ved pausen, hjemme vandt 2-1.
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 2, away: 1 },
      details: { halfTime: { home: 0, away: 1 } } },
    // Uændret: hjemme førte hele vejen.
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', result: { home: 3, away: 0 },
      details: { halfTime: { home: 1, away: 0 } } },
  ];
  it('tæller ændringer efter pausen, comebacks og clean sheets', () => {
    const s = computeSecondHalfStats(matches);
    expect(s.withHalfTime).toBe(2);
    expect(s.changedAfterHalf).toBe(1);
    expect(s.comebacks).toHaveLength(1);
    expect(s.comebacks[0].team).toBe('BRA');
    // Clean sheets: GER holdt nullet (ESP scorede 0).
    expect(s.cleanSheets[0]).toEqual({ team: 'GER', count: 1 });
  });
});

describe('computeFieryMatches & computeRefereeStats', () => {
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', details: { referee: 'Dommer A', bookings: [
      { side: 'home', card: 'YELLOW' }, { side: 'away', card: 'RED' },
    ] } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', details: { referee: 'Dommer A', bookings: [
      { side: 'home', card: 'YELLOW' },
    ] } },
  ];
  it('rangerer hidsigste kampe (rødt vægter dobbelt)', () => {
    const fiery = computeFieryMatches(matches);
    expect(fiery[0].match.id).toBe('1');
    expect(fiery[0]).toMatchObject({ yellow: 1, red: 1, weight: 3 });
  });
  it('samler dommerstatistik', () => {
    const refs = computeRefereeStats(matches);
    expect(refs[0]).toMatchObject({ name: 'Dommer A', matches: 2, yellow: 2, red: 1 });
  });
});

describe('pointsByUidForMatches', () => {
  it('summerer point pr. spiller for afsluttede kampe', () => {
    const matches = [
      { id: '1', round: 'group', result: { home: 2, away: 1 } },
      { id: '2', round: 'group', result: { home: 0, away: 0 } },
      { id: '3', round: 'group', result: null }, // ikke afsluttet → ignoreres
    ];
    const bets = new Map([
      ['1', [{ uid: 'u1', home: 2, away: 1 }, { uid: 'u2', home: 1, away: 0 }]],
      ['2', [{ uid: 'u1', home: 0, away: 0 }]],
      ['3', [{ uid: 'u1', home: 3, away: 3 }]],
    ]);
    const pts = pointsByUidForMatches(matches, bets);
    // u1 rammer eksakt i kamp 1 og 2; u2 rammer udfald i kamp 1.
    expect(pts.u1).toBeGreaterThan(pts.u2);
    expect(pts.u2).toBeGreaterThan(0);
  });

  it('håndterer tomt input', () => {
    expect(pointsByUidForMatches([], new Map())).toEqual({});
  });
});

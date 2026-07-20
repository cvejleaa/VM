import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  computeChampion, computeGoldenBoot, computeFacts, computeTeamOfTournament,
} = require('./tournamentSummary');

// Hjælper: byg en power-index outfield-liste (id, navn, side, att/cre/def).
const OUT = [
  { id: 'f1', name: 'Fwd1', side: 'home', att: 90, cre: 10, def: 10, total: 90 },
  { id: 'f2', name: 'Fwd2', side: 'home', att: 88, cre: 10, def: 10, total: 88 },
  { id: 'f3', name: 'Fwd3', side: 'away', att: 86, cre: 10, def: 10, total: 86 },
  { id: 'm1', name: 'Mid1', side: 'home', att: 10, cre: 90, def: 10, total: 90 },
  { id: 'm2', name: 'Mid2', side: 'home', att: 10, cre: 88, def: 10, total: 88 },
  { id: 'm3', name: 'Mid3', side: 'away', att: 10, cre: 86, def: 10, total: 86 },
  { id: 'd1', name: 'Def1', side: 'home', att: 10, cre: 10, def: 90, total: 90 },
  { id: 'd2', name: 'Def2', side: 'home', att: 10, cre: 10, def: 88, total: 88 },
  { id: 'd3', name: 'Def3', side: 'away', att: 10, cre: 10, def: 86, total: 86 },
  { id: 'd4', name: 'Def4', side: 'away', att: 10, cre: 10, def: 84, total: 84 },
];
const GK = [{ name: 'Keeper', side: 'home', defending: 9, id: 'gk1' }];

describe('computeChampion', () => {
  it('finder finalens vinder via advance (holdkode)', () => {
    const matches = [
      { id: 'sf', round: 'sf', kickoffMs: 1, result: { home: 1, away: 0 } },
      { id: 'f', round: 'final', kickoffMs: 9, homeTeam: 'FRA', awayTeam: 'ESP', result: { home: 2, away: 1, advance: 'FRA' } },
    ];
    const c = computeChampion(matches);
    expect(c).toMatchObject({ champion: 'FRA', runnerUp: 'ESP', score: '2–1', decidedOnPenalties: false });
  });
  it('afgør på straffe når 90 min endte lige', () => {
    const matches = [{ id: 'f', round: 'final', kickoffMs: 9, homeTeam: 'ARG', awayTeam: 'BRA', result: { home: 1, away: 1, advance: 'BRA', penalties: { home: 3, away: 4 } } }];
    const c = computeChampion(matches);
    expect(c).toMatchObject({ champion: 'BRA', runnerUp: 'ARG', decidedOnPenalties: true });
    expect(c.penalties).toEqual({ for: 4, against: 3 });
  });
  it('null når ingen finale', () => {
    expect(computeChampion([{ id: 'x', round: 'sf', result: { home: 1, away: 0 } }])).toBeNull();
  });
});

describe('computeGoldenBoot', () => {
  it('summerer mål pr. spiller, tiebreak assists', () => {
    const matches = [
      { id: '1', homeTeam: 'FRA', awayTeam: 'ESP', result: { home: 2, away: 1 },
        details: { playerStats: {
          10: { name: 'Mbappe', side: 'home', stats: { Goals: 2, Assists: 0 } },
          20: { name: 'Yamal', side: 'away', stats: { Goals: 1, Assists: 3 } },
        } } },
      { id: '2', homeTeam: 'FRA', awayTeam: 'GER', result: { home: 3, away: 0 },
        details: { playerStats: {
          10: { name: 'Mbappe', side: 'home', stats: { Goals: 2, Assists: 1 } },
        } } },
    ];
    const b = computeGoldenBoot(matches);
    expect(b).toMatchObject({ name: 'Mbappe', code: 'FRA', goals: 4, assists: 1 });
  });
  it('null uden mål-data', () => {
    expect(computeGoldenBoot([{ id: '1', result: { home: 0, away: 0 }, details: {} }])).toBeNull();
  });
});

describe('computeFacts', () => {
  const matches = [
    { id: '1', homeTeam: 'ESP', awayTeam: 'IRN', result: { home: 6, away: 0 },
      details: { bookings: [{ card: 'YELLOW' }, { card: 'RED' }], goals: [
        { minute: 2, side: 'home', type: 'REGULAR', scorer: 'Yamal' },
        { minute: 40, side: 'home', type: 'PENALTY' },
        { minute: 70, side: 'home', type: 'REGULAR' },
        { minute: 75, side: 'home', type: 'REGULAR' },
        { minute: 80, side: 'home', type: 'OWN' }, // selvmål af hjemme → tæller for ude
        { minute: 85, side: 'home', type: 'REGULAR' },
      ] } },
    { id: '2', homeTeam: 'NED', awayTeam: 'ARG', result: { home: 4, away: 3 },
      details: { goals: [
        { minute: 10, side: 'away', type: 'REGULAR' },
        { minute: 20, side: 'away', type: 'REGULAR' },
        { minute: 30, side: 'home', type: 'REGULAR' },
        { minute: 50, side: 'home', type: 'REGULAR' },
        { minute: 60, side: 'home', type: 'REGULAR' },
        { minute: 90, side: 'home', type: 'REGULAR' },
        { minute: 92, side: 'away', type: 'REGULAR' },
      ] } },
  ];
  const f = computeFacts(matches);
  it('tæller mål, straffe, selvmål og kort', () => {
    expect(f.played).toBe(2);
    expect(f.totalGoals).toBe(13); // 6 + 7
    expect(f.penalties).toBe(1);
    expect(f.own).toBe(1);
    expect(f.yellow).toBe(1);
    expect(f.red).toBe(1);
  });
  it('finder rekorder', () => {
    expect(f.fastest).toMatchObject({ minute: 2, scorer: 'Yamal' });
    expect(f.biggestWin).toMatchObject({ winner: 'ESP', loser: 'IRN', margin: 6 });
    expect(f.highest).toMatchObject({ home: 'NED', away: 'ARG', total: 7 });
    // NED var bagud 0-2 og vandt 4-3 → comeback-underskud 2.
    expect(f.comeback).toMatchObject({ team: 'NED', deficit: 2 });
  });
  it('mest scorende nation (selvmål krediteres modstanderen)', () => {
    // ESP: 5 egne mål (selvmålet krediteres IRN). NED: 4. ESP topper.
    expect(f.topNation).toMatchObject({ code: 'ESP', goals: 5 });
  });
});

describe('computeTeamOfTournament', () => {
  const mk = (id) => ({ id, homeTeam: 'FRA', awayTeam: 'ESP', result: { home: 1, away: 0 },
    details: { powerRanking: { outfield: OUT, goalkeepers: GK } } });
  const matches = [mk('1'), mk('2'), mk('3')]; // 3 kampe → alle spillere kvalificerer ved min. 3

  it('bygger 4-3-3 efter rolle, min. 3 kampe', () => {
    const xi = computeTeamOfTournament(matches, { minMatches: 3, formation: '4-3-3' });
    expect(xi.forwards.map((p) => p.id)).toEqual(['f1', 'f2', 'f3']);
    expect(xi.midfielders.map((p) => p.id)).toEqual(['m1', 'm2', 'm3']);
    expect(xi.defenders.map((p) => p.id)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(xi.gk).toMatchObject({ name: 'Keeper', code: 'FRA' });
  });
  it('null når for få spillere har nok kampe', () => {
    expect(computeTeamOfTournament([mk('1')], { minMatches: 3 })).toBeNull();
  });
});

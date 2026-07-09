import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const {
  stageToRound, teamCode, resultType, mapStatus, loc, parseMinute,
  ninetyScore, mapCalendarMatch, mapMatchDetails, knockoutResult, fifaScoringResult,
  mapTeamStats, mapPowerRanking,
} = require('./fifaMap');

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(dir, '__fixtures__', 'fifa', f), 'utf8'));

const calendar = fx('calendar-sample.json').Results;
const tlRegular = fx('timeline-regular.json');   // IdMatch 400021532, ordinær 1-2
const tlPenalties = fx('timeline-penalties.json'); // IdMatch 400021535, 0-0 → straffe 4-3
const live = fx('live-match.json');              // 400021532 (BRA 43924 vs NOR 43961)
const statsTeams = fx('stats-teams.json');       // fdh-api teams.json, home 43924
const powerRank = fx('powerranking.json');       // fdh-api powerranking

describe('stageToRound', () => {
  it('mapper FIFA-stadier til vores runde-koder', () => {
    expect(stageToRound('Group Stage')).toBe('group');
    expect(stageToRound('Round of 32')).toBe('r32');
    expect(stageToRound('Round of 16')).toBe('r16');
    expect(stageToRound('Quarter-final')).toBe('qf');
    expect(stageToRound('Semi-final')).toBe('sf');
    expect(stageToRound('Play-off for third place')).toBe('bronze');
    expect(stageToRound('Final')).toBe('final');
    expect(stageToRound('')).toBeNull();
  });
  it('"quarter/semi-final" bliver IKKE til final (delstreng-fælde)', () => {
    expect(stageToRound('Quarter-final')).not.toBe('final');
    expect(stageToRound('Semi-final')).not.toBe('final');
  });
});

describe('teamCode / resultType / mapStatus / loc', () => {
  it('teamCode bruger IdCountry (store bogstaver)', () => {
    expect(teamCode({ IdCountry: 'mex', Abbreviation: 'MEX' })).toBe('MEX');
    expect(teamCode(null)).toBeNull();
  });
  it('resultType', () => {
    expect(resultType(1)).toBe('regular');
    expect(resultType(2)).toBe('penalties');
    expect(resultType(3)).toBe('extraTime');
    expect(resultType(0)).toBe('notPlayed');
  });
  it('mapStatus', () => {
    expect(mapStatus(0, true)).toBe('finished');
    expect(mapStatus(1, true)).toBe('scheduled');
    expect(mapStatus(1, false)).toBe('pendingTeams');
    expect(mapStatus(3, true)).toBe('live');
  });
  it('loc plukker en/GB', () => {
    expect(loc([{ Locale: 'fr', Description: 'x' }, { Locale: 'en-GB', Description: 'y' }])).toBe('y');
    expect(loc([])).toBeNull();
  });
});

describe('mapCalendarMatch (rigtige FIFA-kampe)', () => {
  const by = {};
  for (const m of calendar) by[m.IdMatch] = mapCalendarMatch(m);

  it('afsluttet R32 med ordinær-tids-sejr → hold, stadion+by, runde, resultat, videre', () => {
    const m = mapCalendarMatch(calendar[0]); // MEX-ECU 2-0
    expect(m).toMatchObject({
      round: 'r32', homeTeam: 'MEX', awayTeam: 'ECU',
      venue: 'Mexico City Stadium', city: 'Mexico City',
      status: 'finished', resultType: 'regular',
    });
    expect(m.result).toMatchObject({ home: 2, away: 0, advance: 'MEX' });
  });

  it('straffe-kamp → resultat inkl. penalties + videre til straffevinderen', () => {
    const m = mapCalendarMatch(calendar[2]); // AUS-EGY 1-1, straffe 2-4, Winner=Away
    expect(m.resultType).toBe('penalties');
    expect(m.result).toMatchObject({ home: 1, away: 1, penalties: { home: 2, away: 4 } });
    expect(m.result.advance).toBe(m.awayTeam); // EGY vandt på straffe
  });

  it('forlænget-tids-kamp (ResultType 3)', () => {
    const m = mapCalendarMatch(calendar[1]); // BEL-SEN 3-2 e.t.
    expect(m.resultType).toBe('extraTime');
    expect(m.result).toMatchObject({ home: 3, away: 2 });
  });

  it('kendte hold men ikke spillet → scheduled, intet resultat', () => {
    const m = mapCalendarMatch(calendar[5]); // Quarter-final FRA-MAR, status 1
    expect(m).toMatchObject({ round: 'qf', homeTeam: 'FRA', awayTeam: 'MAR', status: 'scheduled', resultType: 'notPlayed' });
    expect(m.result).toBeNull();
  });

  it('gruppekamp uden "Group" i StageName → round=group via IdGroup/GroupName', () => {
    // FIFA navngiver gruppestadiet forskelligt; gruppen er det sikre signal.
    const groupMatch = {
      IdMatch: '400020000', IdStage: '285063', IdGroup: '285064',
      StageName: [{ Locale: 'en-GB', Description: 'First stage' }],
      GroupName: [{ Locale: 'en-GB', Description: 'Group A' }],
      Date: '2026-06-11T19:00:00Z', MatchStatus: 1, ResultType: 0,
      Home: { IdCountry: 'MEX', IdTeam: '1' }, Away: { IdCountry: 'RSA', IdTeam: '2' },
      HomeTeamScore: null, AwayTeamScore: null, HomeTeamPenaltyScore: null, AwayTeamPenaltyScore: null,
      Stadium: { Name: [{ Locale: 'en-GB', Description: 'Mexico City Stadium' }], CityName: [{ Locale: 'en-GB', Description: 'Mexico City' }] },
      PlaceHolderA: null, PlaceHolderB: null, Winner: null,
    };
    const m = mapCalendarMatch(groupMatch);
    expect(m.round).toBe('group');
    expect(m.groupName).toBe('Group A');
    expect(m).toMatchObject({ homeTeam: 'MEX', awayTeam: 'RSA', status: 'scheduled' });
  });

  it('ukendte hold → pendingTeams med pladsholdere', () => {
    const finale = calendar.find((m) => loc(m.StageName) === 'Final');
    const m = mapCalendarMatch(finale);
    expect(m).toMatchObject({ round: 'final', homeTeam: null, awayTeam: null, status: 'pendingTeams' });
    expect(m.homePlaceholder).toBeTruthy();
    expect(m.venue).toBe('New York/New Jersey Stadium');
  });
});

describe('ninetyScore (ordinær tid fra tidslinjens PERIODE)', () => {
  it('regulær kamp: løbende score ved udgang af 2. halvleg (inkl. tillægstids-straffe)', () => {
    expect(ninetyScore(tlRegular)).toEqual({ home: 1, away: 2 });
  });
  it('straffe-kamp: 0-0 efter ordinær tid (forlænget tid/straffe tæller ikke)', () => {
    expect(ninetyScore(tlPenalties)).toEqual({ home: 0, away: 0 });
  });
  it('null uden tidslinje-data', () => {
    expect(ninetyScore(null)).toBeNull();
    expect(ninetyScore({ Event: [] })).toBeNull();
  });
});

describe('knockoutResult (90-min + videre, parallel til healedKnockoutResult)', () => {
  it('afgøres på straffe → 90-min-score bevares, videre = straffevinder', () => {
    const match = { homeTeam: 'SUI', awayTeam: 'COL', result: { penalties: { home: 4, away: 3 } } };
    expect(knockoutResult(match, tlPenalties)).toEqual({ home: 0, away: 0, advance: 'SUI' });
  });
  it('afgøres i ordinær tid → videre = 90-min-vinderen', () => {
    const match = { homeTeam: 'BRA', awayTeam: 'NOR', result: {} };
    expect(knockoutResult(match, tlRegular)).toEqual({ home: 1, away: 2, advance: 'NOR' });
  });
});

describe('mapTeamStats (fdh-api holdstatistik)', () => {
  const s = mapTeamStats(statsTeams, '43924'); // 43924 = hjemme
  it('mapper besiddelse (%), skud, skud på mål, afleveringer + præcision, hjørner', () => {
    expect(s.home.possession).toBe(32); // 0.3209… → 32%
    expect(s.home.shots).toBe(14);
    expect(s.home.onTarget).toBe(4);
    expect(s.home.passes).toBe(347);
    expect(s.home.passPct).toBe(86); // 298/347
    expect(s.home.corners).toBe(5);
    expect(s.home.offsides).toBe(1);
    expect(s.away.possession).toBeGreaterThan(0);
  });
  it('mapper de udvidede nøgletal (skud ved siden af/blokeret, indlæg, redninger, kort, distance, spurter)', () => {
    expect(s.home.offTarget).toBe(3); // AttemptAtGoalOffTarget
    expect(s.home.blocked).toBe(3); // AttemptAtGoalBlocked
    expect(s.home.crosses).toBe(16);
    expect(s.home.saves).toBe(3); // GoalkeeperSaves
    expect(s.home.yellowCards).toBe(1);
    expect(s.home.redCards).toBe(0);
    expect(s.home.distanceKm).toBe(113); // 113299 m → 113 km
    expect(s.home.sprints).toBe(405);
  });
  it('null når data mangler', () => {
    expect(mapTeamStats(null, '1')).toBeNull();
    expect(mapTeamStats({ 43924: [] }, '43924')).toBeNull(); // kun ét hold
  });
});

describe('mapPowerRanking (fdh-api spiller-power-index)', () => {
  const top = mapPowerRanking(powerRank, '43924', 6);
  it('top-spillere sorteret efter samlet score, med navn og side', () => {
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(6);
    expect(top.every((p) => typeof p.name === 'string' && p.name.length > 0)).toBe(true);
    expect(top.every((p) => p.side === 'home' || p.side === 'away')).toBe(true);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].total).toBeGreaterThanOrEqual(top[i].total);
  });
});

describe('fifaScoringResult (grundlag for skygge-scoring)', () => {
  it('gruppekamp → fuldtidsresultat', () => {
    const fm = { round: 'group', resultType: 'regular', result: { home: 2, away: 1 } };
    expect(fifaScoringResult(fm, null)).toEqual({ home: 2, away: 1 });
  });
  it('knockout i ordinær tid → resultatet som det er (= 90-min), uden tidslinje', () => {
    const fm = { round: 'r32', resultType: 'regular', homeTeam: 'MEX', awayTeam: 'ECU', result: { home: 2, away: 0, advance: 'MEX' } };
    expect(fifaScoringResult(fm, null)).toEqual({ home: 2, away: 0, advance: 'MEX' });
  });
  it('knockout på straffe → 90-min fra tidslinjen', () => {
    const fm = { round: 'r16', resultType: 'penalties', homeTeam: 'SUI', awayTeam: 'COL', result: { home: 0, away: 0, penalties: { home: 4, away: 3 } } };
    expect(fifaScoringResult(fm, tlPenalties)).toEqual({ home: 0, away: 0, advance: 'SUI' });
  });
  it('knockout på ET/straffe UDEN tidslinje → null (scorer aldrig på oppustet fuldtid)', () => {
    const fm = { round: 'r16', resultType: 'penalties', homeTeam: 'SUI', awayTeam: 'COL', result: { home: 0, away: 0 } };
    expect(fifaScoringResult(fm, null)).toBeNull();
  });
});

describe('parseMinute', () => {
  it('parser ordinær og tillægstid', () => {
    expect(parseMinute("79'")).toEqual({ minute: 79, injuryTime: null });
    expect(parseMinute("90'+6'")).toEqual({ minute: 90, injuryTime: 6 });
    expect(parseMinute(null)).toEqual({ minute: null, injuryTime: null });
  });
});

describe('mapMatchDetails (football-data-kompatibel form til MatchDetails-visning)', () => {
  const d = mapMatchDetails(live, tlRegular);
  it('mål med scorer-NAVN, side og type', () => {
    expect(d.goals).toHaveLength(3); // 1 hjemme + 2 ude
    expect(d.goals.every((g) => g.side === 'home' || g.side === 'away')).toBe(true);
    expect(d.goals.every((g) => typeof g.scorer === 'string' && g.scorer.length > 0)).toBe(true);
    expect(d.goals.every((g) => 'type' in g)).toBe(true);
  });
  it('kort og udskiftninger med navne', () => {
    expect(Array.isArray(d.bookings)).toBe(true);
    expect(d.bookings.every((b) => b.card === 'YELLOW' || b.card === 'RED')).toBe(true);
    expect(d.substitutions.every((s) => s.playerIn && s.playerOut)).toBe(true);
  });
  it('opstillinger: 11 i startelveren + bænk, med formation', () => {
    expect(d.lineups.home.lineup).toHaveLength(11);
    expect(d.lineups.away.lineup).toHaveLength(11);
    expect(d.lineups.home.formation).toBe('4-1-2-3');
    expect(d.lineups.home.lineup[0].name).toBeTruthy();
    expect(typeof d.lineups.home.lineup[0].shirt).toBe('number');
  });
  it('spilleminut (til live-badge), straffe og eksakt 90-min', () => {
    expect(typeof d.minute).toBe('number'); // fra MatchTime "102'"
    expect(d.penalties).toBeNull();
    expect(d.ninety).toEqual({ home: 1, away: 2 });
  });
  it('udelader straffesparkskonkurrencen (Period 11) fra mål-feed\'et', () => {
    // 0-0 efter ordinær/forl. tid, afgjort på straffe 4-3 — straffemålene (Period 11)
    // ligger i FIFA's Goals, men må IKKE vises som kampmål.
    const live2 = {
      HomeTeam: { IdTeam: '1', Players: [{ IdPlayer: 'a', ShortName: [{ Locale: 'en', Description: 'XHAKA' }] }],
        Goals: [{ Period: 11, IdPlayer: 'a', Minute: null }, { Period: 11, IdPlayer: 'a', Minute: null }] },
      AwayTeam: { IdTeam: '2', Players: [{ IdPlayer: 'b', ShortName: [{ Locale: 'en', Description: 'DIAZ' }] }],
        Goals: [{ Period: 11, IdPlayer: 'b', Minute: null }] },
      HomeTeamPenaltyScore: 4, AwayTeamPenaltyScore: 3, ResultType: 2, MatchTime: "120'",
    };
    const d2 = mapMatchDetails(live2, null);
    expect(d2.goals).toHaveLength(0); // ingen kampmål — kun straffe
    expect(d2.penalties).toEqual({ home: 4, away: 3 });
  });

  it('live hændelses-feed med FIFA-kommentar', () => {
    expect(Array.isArray(d.events)).toBe(true);
    expect(d.events.length).toBeGreaterThan(20); // rig tidslinje
    expect(d.events.every((e) => typeof e.text === 'string' && e.text.length > 0)).toBe(true);
    expect(d.events.some((e) => e.major)).toBe(true); // mindst ét stort event (mål/kort/…)
    const goal = d.events.find((e) => e.type === 0 || e.type === 41);
    expect(goal).toBeTruthy();
    expect(goal.side === 'home' || goal.side === 'away').toBe(true);
  });
});

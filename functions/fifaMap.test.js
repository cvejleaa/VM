import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const {
  stageToRound, teamCode, resultType, mapStatus, loc,
  ninetyScore, mapCalendarMatch, mapMatchDetails, knockoutResult,
} = require('./fifaMap');

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(join(dir, '__fixtures__', 'fifa', f), 'utf8'));

const calendar = fx('calendar-sample.json').Results;
const tlRegular = fx('timeline-regular.json');   // IdMatch 400021532, ordinær 1-2
const tlPenalties = fx('timeline-penalties.json'); // IdMatch 400021535, 0-0 → straffe 4-3
const live = fx('live-match.json');              // 400021532 (BRA 43924 vs NOR 43961)

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

describe('mapMatchDetails (live/football + timeline)', () => {
  const d = mapMatchDetails(live, tlRegular);
  it('mål med side, straffe, opstillinger og eksakt 90-min', () => {
    expect(d.goals).toHaveLength(3); // 1 hjemme + 2 ude
    expect(d.goals.every((g) => g.side === 'home' || g.side === 'away')).toBe(true);
    expect(d.penalties).toBeNull(); // afgjort i ordinær tid
    expect(d.lineups.home).toHaveLength(25);
    expect(d.lineups.away).toHaveLength(25);
    expect(d.ninety).toEqual({ home: 1, away: 2 });
  });
  it('opstillingsposter har navn + trøjenummer', () => {
    const p = d.lineups.home[0];
    expect(p.name).toBeTruthy();
    expect(typeof p.shirt).toBe('number');
  });
});

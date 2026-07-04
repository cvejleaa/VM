import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  teamCodeMatches, matchFixture, winnerToCode, decideUpdate, patchChangesDoc, auditKickoffs,
  healedKnockoutResult, knockoutScoreResult,
} = require('./resultsSync');

const NOW = new Date('2026-06-11T21:00:00Z');

describe('teamCodeMatches', () => {
  it('matcher på tla', () => {
    expect(teamCodeMatches('MEX', { tla: 'MEX', name: 'Mexico' })).toBe(true);
  });
  it('matcher når koden indleder navnet', () => {
    expect(teamCodeMatches('POR', { tla: 'POR', name: 'Portugal' })).toBe(true);
  });
  it('afviser forskellige hold', () => {
    expect(teamCodeMatches('MEX', { tla: 'RSA', name: 'South Africa' })).toBe(false);
  });
});

describe('matchFixture', () => {
  const fd = [
    { id: 11, utcDate: '2026-06-11T19:00:00Z', homeTeam: { tla: 'MEX', name: 'Mexico' }, awayTeam: { tla: 'RSA', name: 'South Africa' } },
    { id: 12, utcDate: '2026-06-12T19:00:00Z', homeTeam: { tla: 'CAN', name: 'Canada' }, awayTeam: { tla: 'BIH', name: 'Bosnia' } },
  ];
  it('finder kampen på samme dato + hold', () => {
    const our = { homeTeam: 'MEX', awayTeam: 'RSA', kickoff: '2026-06-11T19:00:00Z' };
    expect(matchFixture(our, fd)?.id).toBe(11);
  });
  it('matcher selv når seed-tidspunktet falder over UTC-midnat', () => {
    // Vores gæt ligger få timer forskudt på den anden side af midnat (anden UTC-dato).
    const our = { homeTeam: 'MEX', awayTeam: 'RSA', kickoff: '2026-06-12T01:00:00Z' };
    expect(matchFixture(our, fd)?.id).toBe(11);
  });
  it('returnerer null når datoen er helt forkert', () => {
    const our = { homeTeam: 'MEX', awayTeam: 'RSA', kickoff: '2026-06-20T19:00:00Z' };
    expect(matchFixture(our, fd)).toBeNull();
  });
  it('vælger den tidsmæssigt nærmeste ved flere holdpar-kandidater', () => {
    const dup = [
      { id: 21, utcDate: '2026-06-11T19:00:00Z', homeTeam: { tla: 'BRA' }, awayTeam: { tla: 'ARG' } },
      { id: 22, utcDate: '2026-06-30T19:00:00Z', homeTeam: { tla: 'BRA' }, awayTeam: { tla: 'ARG' } },
    ];
    const our = { homeTeam: 'BRA', awayTeam: 'ARG', kickoff: '2026-06-30T18:00:00Z' };
    expect(matchFixture(our, dup)?.id).toBe(22);
  });
  it('returnerer null uden hold', () => {
    expect(matchFixture({ kickoff: '2026-06-11T19:00:00Z' }, fd)).toBeNull();
  });
});

describe('winnerToCode', () => {
  const m = { homeTeam: 'BRA', awayTeam: 'ARG' };
  it('oversætter vinder til holdkode', () => {
    expect(winnerToCode('HOME_TEAM', m)).toBe('BRA');
    expect(winnerToCode('AWAY_TEAM', m)).toBe('ARG');
    expect(winnerToCode('DRAW', m)).toBeNull();
  });
});

describe('decideUpdate', () => {
  const group = { round: 'group', homeTeam: 'MEX', awayTeam: 'RSA', status: 'scheduled' };
  const ko = { round: 'r16', homeTeam: 'BRA', awayTeam: 'ARG', status: 'scheduled' };

  it('springer låste kampe over', () => {
    const res = decideUpdate({ ...group, manualLock: true }, { status: 'FINISHED', score: { fullTime: { home: 1, away: 0 } } }, NOW);
    expect(res.action).toBe('skip');
    expect(res.reason).toBe('manualLock');
  });

  it('flagger afbrudte kampe til review', () => {
    const res = decideUpdate(group, { status: 'SUSPENDED' }, NOW);
    expect(res.action).toBe('review');
    expect(res.patch.needsReview).toBe(true);
  });

  it('springer ikke-startede over', () => {
    expect(decideUpdate(group, { status: 'TIMED' }, NOW).action).toBe('skip');
  });

  it('skriver live foreløbig score', () => {
    const res = decideUpdate(group, { status: 'IN_PLAY', score: { fullTime: { home: 1, away: 0 } } }, NOW);
    expect(res.action).toBe('live');
    expect(res.patch).toMatchObject({ status: 'live', result: { home: 1, away: 0 }, resultSource: 'auto' });
  });

  it('springer over live uden score endnu', () => {
    expect(decideUpdate(group, { status: 'IN_PLAY', score: {} }, NOW).action).toBe('skip');
  });

  it('afslutter gruppekamp uden advance', () => {
    const res = decideUpdate(group, { status: 'FINISHED', score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }, NOW);
    expect(res.action).toBe('finish');
    expect(res.patch.result).toEqual({ home: 2, away: 1 });
    expect(res.patch.needsReview).toBeUndefined();
  });

  it('afslutter knockout med advance fra vinder', () => {
    const res = decideUpdate(ko, { status: 'FINISHED', score: { winner: 'AWAY_TEAM', fullTime: { home: 1, away: 1 } } }, NOW);
    expect(res.patch.result).toEqual({ home: 1, away: 1, advance: 'ARG' });
    expect(res.patch.needsReview).toBeUndefined();
  });

  it('afgør knockout på straffespark: uafgjort fuldtid + winner → advance, ingen review', () => {
    // football-data: fullTime er uafgjort (straffene tæller ikke med),
    // duration=PENALTY_SHOOTOUT, og winner peger på den der gik videre.
    const fd = { status: 'FINISHED', score: { winner: 'HOME_TEAM', duration: 'PENALTY_SHOOTOUT', fullTime: { home: 1, away: 1 } } };
    const res = decideUpdate(ko, fd, NOW);
    expect(res.action).toBe('finish');
    expect(res.patch.result).toEqual({ home: 1, away: 1, advance: 'BRA' });
    expect(res.patch.needsReview).toBeUndefined();
  });

  it('rører IKKE en knockout-kamp der allerede er afsluttet (90-min ejes af detalje-synken)', () => {
    const finishedKo = { ...ko, status: 'finished', result: { home: 1, away: 0, advance: 'BRA' } };
    // football-data melder fuldtid 2-1 (inkl. forlænget tid) — må ikke overskrive.
    const res = decideUpdate(finishedKo, { status: 'FINISHED', score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }, NOW);
    expect(res.action).toBe('skip');
  });

  it('en afsluttet GRUPPEkamp opdateres stadig (kun knockout fryses)', () => {
    const finishedGroup = { ...group, status: 'finished', result: { home: 1, away: 0 } };
    const res = decideUpdate(finishedGroup, { status: 'FINISHED', score: { fullTime: { home: 2, away: 0 } } }, NOW);
    expect(res.action).toBe('finish');
    expect(res.patch.result).toEqual({ home: 2, away: 0 });
  });

  it('beder om review når knockout-vinder er uklar', () => {
    const res = decideUpdate(ko, { status: 'FINISHED', score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } } }, NOW);
    expect(res.patch.needsReview).toBe(true);
  });

  it('flagger AWARDED-resultater til review', () => {
    const res = decideUpdate(group, { status: 'AWARDED', score: { winner: 'HOME_TEAM', fullTime: { home: 3, away: 0 } } }, NOW);
    expect(res.action).toBe('finish');
    expect(res.patch.needsReview).toBe(true);
  });
});

describe('patchChangesDoc', () => {
  it('false når intet ændrer sig', () => {
    const m = { status: 'live', result: { home: 1, away: 0 } };
    expect(patchChangesDoc(m, { status: 'live', result: { home: 1, away: 0 } })).toBe(false);
  });
  it('true når scoren ændrer sig', () => {
    const m = { status: 'live', result: { home: 1, away: 0 } };
    expect(patchChangesDoc(m, { status: 'live', result: { home: 1, away: 1 } })).toBe(true);
  });
  it('true når status skifter til finished', () => {
    const m = { status: 'live', result: { home: 1, away: 0 } };
    expect(patchChangesDoc(m, { status: 'finished', result: { home: 1, away: 0 } })).toBe(true);
  });
  it('true når advance tilføjes', () => {
    const m = { status: 'finished', result: { home: 1, away: 1 } };
    expect(patchChangesDoc(m, { status: 'finished', result: { home: 1, away: 1, advance: 'ARG' } })).toBe(true);
  });
});

describe('healedKnockoutResult', () => {
  it('retter et straffe-oppustet resultat til 90 min + tillægstid, videre fra straffe', () => {
    // NED–MAR: 1-1 efter 90 (+ tillægstid), straffe 2-3 → MAR videre.
    const m = {
      round: 'r32', homeTeam: 'NED', awayTeam: 'MAR',
      result: { home: 4, away: 4, advance: 'MAR' },
      details: {
        goals: [
          { minute: 72, side: 'home' },
          { minute: 90, injuryTime: 1, side: 'away' },
        ],
        penalties: { home: 2, away: 3 },
      },
    };
    expect(healedKnockoutResult(m)).toEqual({ home: 1, away: 1, advance: 'MAR' });
  });

  it('forlænget tid tæller ikke med (minut > 90)', () => {
    const m = {
      round: 'sf', homeTeam: 'GER', awayTeam: 'FRA',
      result: { home: 2, away: 1, advance: 'GER' },
      details: { goals: [
        { minute: 30, side: 'home' },
        { minute: 80, side: 'away' },
        { minute: 105, side: 'home' }, // forlænget tid
      ] },
    };
    // 90-min = 1-1; ingen straffe → uafgjort → bevarer eksisterende advance.
    expect(healedKnockoutResult(m)).toEqual({ home: 1, away: 1, advance: 'GER' });
  });

  it('udleder videre fra 90-min-vinder uden straffe', () => {
    const m = {
      round: 'qf', homeTeam: 'BRA', awayTeam: 'ARG',
      result: { home: 9, away: 9 },
      details: { goals: [{ minute: 10, side: 'home' }, { minute: 20, side: 'home' }, { minute: 60, side: 'away' }] },
    };
    expect(healedKnockoutResult(m)).toEqual({ home: 2, away: 1, advance: 'BRA' });
  });

  it('null for gruppekampe og uden mål-data', () => {
    expect(healedKnockoutResult({ round: 'group', result: { home: 1, away: 0 }, details: { goals: [{ minute: 5, side: 'home' }] } })).toBeNull();
    expect(healedKnockoutResult({ round: 'qf', result: { home: 1, away: 0 }, details: { goals: [] } })).toBeNull();
    expect(healedKnockoutResult({ round: 'qf', result: { home: 1, away: 0 } })).toBeNull();
    expect(healedKnockoutResult(null)).toBeNull();
  });
});

describe('knockoutScoreResult', () => {
  const withGoals = {
    round: 'r32', status: 'finished', homeTeam: 'NED', awayTeam: 'MAR',
    resultSource: 'auto', result: { home: 4, away: 4, advance: 'MAR' },
    details: { goals: [{ minute: 72, side: 'home' }, { minute: 88, side: 'away' }] },
  };

  it('gruppekamp → returnerer resultatet uændret (ingen gating)', () => {
    const m = { round: 'group', status: 'finished', result: { home: 4, away: 4 } };
    expect(knockoutScoreResult(m, false)).toEqual({ home: 4, away: 4 });
  });

  it('knockout der IKKE er afsluttet → returnerer resultatet uændret', () => {
    const m = { ...withGoals, status: 'live', details: null };
    expect(knockoutScoreResult(m, false)).toEqual(m.result);
  });

  it('afsluttet knockout med mål → scorer mod 90-min (ikke det oppustede fuldtid)', () => {
    // 4-4 gemt, men målene giver 1-1 på ordinær tid → score mod 1-1.
    expect(knockoutScoreResult(withGoals, false)).toEqual({ home: 1, away: 1, advance: 'MAR' });
  });

  it('afsluttet auto-knockout UDEN mål, ikke bekræftet → kun "videre" (score holdes tilbage)', () => {
    const m = { round: 'r32', status: 'finished', resultSource: 'auto', result: { home: 4, away: 4, advance: 'MAR' } };
    expect(knockoutScoreResult(m, false)).toEqual({ advance: 'MAR' });
  });

  it('afsluttet auto-knockout UDEN mål, men BEKRÆFTET → stoles på som det er', () => {
    const m = { round: 'r32', status: 'finished', resultSource: 'auto', result: { home: 1, away: 1, advance: 'MAR' } };
    expect(knockoutScoreResult(m, true)).toEqual({ home: 1, away: 1, advance: 'MAR' });
  });

  it('manuelt admin-resultat UDEN mål → stoles altid på (ikke auto)', () => {
    const m = { round: 'r32', status: 'finished', resultSource: 'manual', result: { home: 1, away: 1, advance: 'MAR' } };
    expect(knockoutScoreResult(m, false)).toEqual({ home: 1, away: 1, advance: 'MAR' });
  });
});

describe('auditKickoffs', () => {
  const fd = [
    { id: 101, utcDate: '2026-06-12T02:00:00Z', homeTeam: { tla: 'KOR', name: 'South Korea' }, awayTeam: { tla: 'CZE', name: 'Czechia' } },
    { id: 102, utcDate: '2026-06-11T19:00:00Z', homeTeam: { tla: 'MEX', name: 'Mexico' }, awayTeam: { tla: 'RSA', name: 'South Africa' } },
  ];

  it('finder en kamp hvor tiden afviger (matcher på hold)', () => {
    const ours = [
      { id: 'grp_A_2', homeTeam: 'KOR', awayTeam: 'CZE', kickoff: '2026-06-13T02:00:00Z' }, // 1 dag for sent
      { id: 'grp_A_1', homeTeam: 'MEX', awayTeam: 'RSA', kickoff: '2026-06-11T19:00:00Z' }, // korrekt
    ];
    const changes = auditKickoffs(ours, fd);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: 'grp_A_2', home: 'KOR', away: 'CZE',
      fromISO: '2026-06-13T02:00:00.000Z', toISO: '2026-06-12T02:00:00.000Z', fdId: '101',
    });
  });

  it('returnerer tomt når alt stemmer', () => {
    const ours = [{ id: 'grp_A_1', homeTeam: 'MEX', awayTeam: 'RSA', kickoff: '2026-06-11T19:00:00Z' }];
    expect(auditKickoffs(ours, fd)).toEqual([]);
  });

  it('ignorerer kampe uden hold (knockout-pladsholdere)', () => {
    const ours = [{ id: 'r16_1', homeTeam: null, awayTeam: null, kickoff: '2026-07-01T19:00:00Z' }];
    expect(auditKickoffs(ours, fd)).toEqual([]);
  });
});

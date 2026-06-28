import { describe, it, expect } from 'vitest';
import pkg from './fixtureImport.js';

const {
  stageToRound, learnCodes, resolveCode, buildDesiredKnockout, reconcileKnockout, differs,
  knockoutTeamUpdates,
} = pkg;

describe('knockoutTeamUpdates (ikke-destruktiv auto-synk)', () => {
  const desired = [
    { id: 'ko_9', round: 'r16', homeTeam: 'BRA', awayTeam: 'ARG', externalId: '9', status: 'scheduled', kickoffISO: '2026-07-04T19:00:00Z' },
    { id: 'ko_10', round: 'r16', homeTeam: null, awayTeam: null, externalId: '10', status: 'pendingTeams', kickoffISO: '2026-07-04T22:00:00Z' },
  ];
  it('udfylder kun kampe hvor begge hold nu er kendt og afviger', () => {
    const existing = [
      { id: 'ko_9', round: 'r16', homeTeam: null, awayTeam: null, status: 'pendingTeams' }, // skal udfyldes
      { id: 'ko_10', round: 'r16', homeTeam: null, awayTeam: null, status: 'pendingTeams' }, // desired har stadig TBD → spring over
    ];
    const u = knockoutTeamUpdates(existing, desired);
    expect(u.map((x) => x.id)).toEqual(['ko_9']);
  });
  it('rører ALDRIG manuelt låste eller spillede kampe', () => {
    const existing = [
      { id: 'ko_9', round: 'r16', homeTeam: 'BRA', awayTeam: 'GER', manualLock: true },
    ];
    expect(knockoutTeamUpdates(existing, desired)).toEqual([]);
    const played = [
      { id: 'ko_9', round: 'r16', homeTeam: 'BRA', awayTeam: 'GER', result: { home: 1, away: 0 } },
    ];
    expect(knockoutTeamUpdates(played, desired)).toEqual([]);
  });
  it('springer uændrede kampe over', () => {
    const existing = [{ id: 'ko_9', round: 'r16', homeTeam: 'BRA', awayTeam: 'ARG' }];
    expect(knockoutTeamUpdates(existing, [desired[0]])).toEqual([]);
  });
});

describe('stageToRound', () => {
  it('mapper football-data stages til vores runder', () => {
    expect(stageToRound('GROUP_STAGE')).toBe('group');
    expect(stageToRound('LAST_32')).toBe('r32');
    expect(stageToRound('LAST_16')).toBe('r16');
    expect(stageToRound('QUARTER_FINALS')).toBe('qf');
    expect(stageToRound('SEMI_FINALS')).toBe('sf');
    expect(stageToRound('THIRD_PLACE')).toBe('bronze');
    expect(stageToRound('FINAL')).toBe('final');
  });
  it('ukendt/tom stage giver null', () => {
    expect(stageToRound('PRE_SEASON')).toBe(null);
    expect(stageToRound(null)).toBe(null);
  });
});

describe('learnCodes + resolveCode', () => {
  const fdMatches = [
    { id: 1, homeTeam: { id: 100, tla: 'BRA' }, awayTeam: { id: 200, tla: 'ARG' }, utcDate: '2026-06-11T19:00:00Z' },
  ];
  const ourGroup = [{ id: 'grp_A_1', homeTeam: 'BRA', awayTeam: 'ARG', kickoff: '2026-06-11T19:00:00Z' }];
  // simpel matchFixture-stub: par på TLA
  const matchFixture = (m, fds) => fds.find(
    (fd) => fd.homeTeam.tla === m.homeTeam && fd.awayTeam.tla === m.awayTeam,
  ) || null;

  it('lærer fd-hold-id → vores kode fra gruppekampe', () => {
    const learned = learnCodes(ourGroup, fdMatches, matchFixture);
    expect(learned.get(100)).toBe('BRA');
    expect(learned.get(200)).toBe('ARG');
  });
  it('resolveCode bruger lært map, ellers TLA-fallback, ellers null', () => {
    const learned = new Map([[100, 'BRA']]);
    expect(resolveCode({ id: 100 }, learned)).toBe('BRA');
    expect(resolveCode({ id: 999, tla: 'GER' }, learned)).toBe('GER');
    expect(resolveCode({ id: null, name: 'Winner R32-1' }, learned)).toBe(null);
    expect(resolveCode(null, learned)).toBe(null);
  });
});

describe('buildDesiredKnockout', () => {
  const codeOf = (t) => (t && t.id === 100 ? 'BRA' : t && t.id === 200 ? 'ARG' : null);
  const fdMatches = [
    { id: 5, stage: 'GROUP_STAGE', homeTeam: { id: 100 }, awayTeam: { id: 200 }, utcDate: '2026-06-11T19:00:00Z' },
    { id: 9, stage: 'LAST_32', homeTeam: { id: 100 }, awayTeam: { id: 200 }, utcDate: '2026-06-28T19:00:00Z' },
    { id: 10, stage: 'LAST_16', homeTeam: { id: null, name: 'Winner 32-1' }, awayTeam: { id: null, name: 'Winner 32-2' }, utcDate: '2026-07-04T19:00:00Z' },
  ];
  it('springer gruppekampe over og bygger kun knockout', () => {
    const d = buildDesiredKnockout(fdMatches, codeOf);
    expect(d.map((x) => x.id)).toEqual(['ko_9', 'ko_10']);
  });
  it('kendte hold → scheduled; ukendte → pendingTeams med pladsholder', () => {
    const d = buildDesiredKnockout(fdMatches, codeOf);
    const r32 = d.find((x) => x.id === 'ko_9');
    expect(r32).toMatchObject({ round: 'r32', homeTeam: 'BRA', awayTeam: 'ARG', status: 'scheduled', externalId: '9' });
    const r16 = d.find((x) => x.id === 'ko_10');
    expect(r16).toMatchObject({ round: 'r16', homeTeam: null, awayTeam: null, status: 'pendingTeams', homePlaceholder: 'Winner 32-1' });
  });
});

describe('reconcileKnockout', () => {
  const desired = [
    { id: 'ko_9', round: 'r32', homeTeam: 'BRA', awayTeam: 'ARG', externalId: '9', status: 'scheduled', kickoffISO: '2026-06-28T19:00:00Z' },
    { id: 'ko_10', round: 'r16', homeTeam: null, awayTeam: null, externalId: '10', status: 'pendingTeams', kickoffISO: '2026-07-04T19:00:00Z' },
  ];
  it('opretter nye, opdaterer ændrede, sletter forældede (de forkert-genererede)', () => {
    const existing = [
      // forkert genereret bracket — skal slettes
      { id: 'ko_r32_1', round: 'r32', homeTeam: 'BRA', awayTeam: 'GER', externalId: null, status: 'scheduled', kickoff: '2026-06-28T19:00:00Z' },
      // matcher ko_9 men med forkert udehold → opdateres
      { id: 'ko_9', round: 'r32', homeTeam: 'BRA', awayTeam: 'GER', externalId: '9', status: 'scheduled', kickoff: '2026-06-28T19:00:00Z' },
    ];
    const { toCreate, toUpdate, toDelete } = reconcileKnockout(existing, desired);
    expect(toCreate.map((d) => d.id)).toEqual(['ko_10']);
    expect(toUpdate.map((d) => d.id)).toEqual(['ko_9']);
    expect(toDelete).toEqual(['ko_r32_1']);
  });
  it('uændret kamp giver ingen opdatering', () => {
    const existing = [
      { id: 'ko_9', round: 'r32', homeTeam: 'BRA', awayTeam: 'ARG', externalId: '9', status: 'scheduled', kickoff: '2026-06-28T19:00:00Z' },
    ];
    const { toUpdate, toDelete } = reconcileKnockout(existing, [desired[0]]);
    expect(toUpdate).toEqual([]);
    expect(toDelete).toEqual([]);
  });
});

describe('differs', () => {
  const d = { homeTeam: 'BRA', awayTeam: 'ARG', round: 'r32', externalId: '9', status: 'scheduled', kickoffISO: '2026-06-28T19:00:00Z' };
  it('fanger ændret hold og uændret = false', () => {
    expect(differs({ ...d, kickoff: d.kickoffISO }, d)).toBe(false);
    expect(differs({ ...d, kickoff: d.kickoffISO, awayTeam: 'GER' }, d)).toBe(true);
    expect(differs({ ...d, kickoff: '2026-06-29T19:00:00Z' }, d)).toBe(true);
  });
});

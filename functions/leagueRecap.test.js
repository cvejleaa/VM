import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { leagueTotal, buildRecapFacts, RECAP_SYSTEM, parseHM, recapWindowOpen } = require('./leagueRecap');

describe('leagueTotal', () => {
  const u = { groupPoints: 10, knockoutPoints: 4, bonusPoints: 6 };
  it('summerer alle dele når alt tæller', () => {
    expect(leagueTotal(u, { group: true, knockout: true, bonus: true })).toBe(20);
  });
  it('default (tomt scoring) tæller alt', () => {
    expect(leagueTotal(u, {})).toBe(20);
  });
  it('respekterer fravalg', () => {
    expect(leagueTotal(u, { group: true, knockout: false, bonus: false })).toBe(10);
  });
  it('fordobler slutspil ved doubleKnockout', () => {
    expect(leagueTotal(u, { group: false, knockout: true, bonus: false, doubleKnockout: true })).toBe(8);
  });
});

describe('buildRecapFacts', () => {
  const members = [
    { id: 'a', displayName: 'Anders', groupPoints: 20, knockoutPoints: 0, bonusPoints: 0 },
    { id: 'b', displayName: 'Bente', groupPoints: 12, knockoutPoints: 0, bonusPoints: 0 },
    { id: 'c', displayName: 'Carl', groupPoints: 8, knockoutPoints: 0, bonusPoints: 0 },
  ];
  const now = new Date('2026-06-13T05:00:00Z');

  it('sorterer stilling, finder dagens point og standout', () => {
    const f = buildRecapFacts({
      league: { name: 'Vennerne', scoring: { group: true } },
      members,
      dayPointsByUid: { a: 2, b: 7, c: 0 },
      matches: [{ home: 'BRA', away: 'ARG', score: '2-1' }],
      upcoming: [{ home: 'DEN', away: 'GER', time: '20:00' }],
      now,
    });
    expect(f.leagueName).toBe('Vennerne');
    expect(f.standings[0]).toMatchObject({ rank: 1, name: 'Anders', points: 20 });
    expect(f.dayPoints).toEqual([{ name: 'Bente', points: 7 }, { name: 'Anders', points: 2 }]);
    expect(f.standout).toEqual({ name: 'Bente', points: 7 });
    expect(f.matches).toHaveLength(1);
    expect(f.upcoming[0].home).toBe('DEN');
    expect(f.memberCount).toBe(3);
  });

  it('stille dag: ingen kampe → tom matches/dayPoints og standout null', () => {
    const f = buildRecapFacts({ league: { name: 'X' }, members, dayPointsByUid: {}, matches: [], upcoming: [], now });
    expect(f.matches).toEqual([]);
    expect(f.dayPoints).toEqual([]);
    expect(f.standout).toBeNull();
  });

  it('system-prompten instruerer om dansk prosa og kun-fakta', () => {
    expect(RECAP_SYSTEM).toMatch(/dansk/i);
    expect(RECAP_SYSTEM).toMatch(/ALDRIG/);
  });
});

describe('parseHM', () => {
  it('parser gyldige tidspunkter til minutter', () => {
    expect(parseHM('00:00')).toBe(0);
    expect(parseHM('08:15')).toBe(495);
    expect(parseHM('23:59')).toBe(1439);
    expect(parseHM(' 9:05 ')).toBe(545);
  });
  it('returnerer null for ugyldigt', () => {
    expect(parseHM('24:00')).toBeNull();
    expect(parseHM('08:60')).toBeNull();
    expect(parseHM('otte')).toBeNull();
    expect(parseHM('')).toBeNull();
    expect(parseHM(null)).toBeNull();
  });
});

describe('recapWindowOpen', () => {
  it('er åbent fra target og en time frem', () => {
    expect(recapWindowOpen('08:15', '08:15', 60)).toBe(true);
    expect(recapWindowOpen('08:40', '08:15', 60)).toBe(true);
    expect(recapWindowOpen('09:14', '08:15', 60)).toBe(true);
  });
  it('er lukket før target og efter vinduet', () => {
    expect(recapWindowOpen('08:10', '08:15', 60)).toBe(false);
    expect(recapWindowOpen('09:15', '08:15', 60)).toBe(false);
    expect(recapWindowOpen('07:00', '08:15', 60)).toBe(false);
  });
  it('respekterer et kortere vindue', () => {
    expect(recapWindowOpen('08:20', '08:15', 5)).toBe(false);
    expect(recapWindowOpen('08:19', '08:15', 5)).toBe(true);
  });
  it('er lukket ved ugyldige tider', () => {
    expect(recapWindowOpen('xx:yy', '08:15', 60)).toBe(false);
    expect(recapWindowOpen('08:15', 'nope', 60)).toBe(false);
  });
});

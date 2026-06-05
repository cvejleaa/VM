import { describe, it, expect } from 'vitest';
import { leagueScore, formatLabel, FORMAT_OPTIONS } from './leagueFormat';
import { LEAGUE_FORMAT } from '../../lib/constants';

const user = { totalPoints: 100, groupPoints: 60, knockoutPoints: 30, bonusPoints: 10 };

describe('leagueScore', () => {
  it('FULL bruger totalPoints', () => {
    expect(leagueScore(user, LEAGUE_FORMAT.FULL)).toBe(100);
  });
  it('BONUS_ONLY bruger bonusPoints', () => {
    expect(leagueScore(user, LEAGUE_FORMAT.BONUS_ONLY)).toBe(10);
  });
  it('KNOCKOUT_ONLY bruger knockoutPoints', () => {
    expect(leagueScore(user, LEAGUE_FORMAT.KNOCKOUT_ONLY)).toBe(30);
  });
  it('GROUP_ONLY bruger groupPoints', () => {
    expect(leagueScore(user, LEAGUE_FORMAT.GROUP_ONLY)).toBe(60);
  });
  it('DOUBLE_KNOCKOUT vægter slutspil dobbelt', () => {
    // group(60) + bonus(10) + 2*knockout(30) = 130
    expect(leagueScore(user, LEAGUE_FORMAT.DOUBLE_KNOCKOUT)).toBe(130);
  });
  it('ukendt format falder tilbage til total', () => {
    expect(leagueScore(user, 'noget-andet')).toBe(100);
  });
  it('håndterer manglende felter som 0', () => {
    expect(leagueScore({}, LEAGUE_FORMAT.BONUS_ONLY)).toBe(0);
    expect(leagueScore(undefined, LEAGUE_FORMAT.FULL)).toBe(0);
  });
});

describe('formatLabel / FORMAT_OPTIONS', () => {
  it('har 5 formater', () => {
    expect(FORMAT_OPTIONS).toHaveLength(5);
  });
  it('giver en label for hvert format', () => {
    for (const o of FORMAT_OPTIONS) {
      expect(formatLabel(o.value)).toBe(o.label);
    }
  });
  it('falder tilbage til Fuld-label ved ukendt', () => {
    expect(formatLabel('xxx')).toBe(formatLabel(LEAGUE_FORMAT.FULL));
  });
});

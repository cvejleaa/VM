import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { leagueStandings, renderThankYouEmail } = require('./thankYouEmail');

describe('leagueStandings', () => {
  const membersById = {
    u1: { displayName: 'Mette', groupPoints: 100, knockoutPoints: 40, bonusPoints: 8 },
    u2: { displayName: 'Jonas', groupPoints: 90, knockoutPoints: 45, bonusPoints: 6 },
    u3: { displayName: 'Anders', groupPoints: 95, knockoutPoints: 30, bonusPoints: 12 },
  };
  it('sorterer efter ligaens scoring (alt tæller)', () => {
    const league = { name: 'Kontoret', memberUids: ['u1', 'u2', 'u3'], scoring: { group: true, knockout: true, bonus: true } };
    const std = leagueStandings(league, membersById);
    // Mette 148, Jonas 141, Anders 137
    expect(std.rows.map((r) => [r.name, r.points, r.rank])).toEqual([
      ['Mette', 148, 1], ['Jonas', 141, 2], ['Anders', 137, 3],
    ]);
    expect(std.memberCount).toBe(3);
  });
  it('respekterer scoring-valg (kun grundspil, dobbelt slutspil fra)', () => {
    const league = { name: 'X', memberUids: ['u1', 'u2'], scoring: { group: true, knockout: false, bonus: false } };
    const std = leagueStandings(league, membersById);
    expect(std.rows.map((r) => r.points)).toEqual([100, 90]); // kun groupPoints
  });
  it('springer ukendte medlemmer over', () => {
    const league = { name: 'X', memberUids: ['u1', 'ghost'], scoring: { group: true, knockout: true, bonus: true } };
    const std = leagueStandings(league, membersById);
    expect(std.rows).toHaveLength(1);
    expect(std.rows[0].name).toBe('Mette');
  });
});

describe('renderThankYouEmail', () => {
  const data = {
    displayName: 'Anders',
    youUid: 'u3',
    champion: { champion: 'FRA', runnerUp: 'ESP', score: '2–1', decidedOnPenalties: false, penalties: null },
    boot: { name: 'Mbappe', code: 'FRA', goals: 8, assists: 3 },
    facts: { played: 104, totalGoals: 271, goalsPerMatch: 2.6, penalties: 18, own: 9, yellow: 231, red: 12,
      topNation: { code: 'FRA', goals: 15 }, fastest: { minute: 2, scorer: 'Musiala', code: 'GER' },
      biggestWin: { winner: 'ESP', loser: 'IRN', score: '6–0', margin: 6 },
      highest: { home: 'NED', away: 'ARG', score: '4–3', total: 7 },
      comeback: { team: 'POR', deficit: 2, score: '3–2' } },
    team: { formation: '4-3-3', gk: { name: 'Donnarumma', code: 'ITA' },
      defenders: [{ name: 'Hakimi', code: 'MAR' }], midfielders: [{ name: 'Pedri', code: 'ESP' }], forwards: [{ name: 'Mbappe', code: 'FRA' }] },
    leagues: [{ name: 'Kontoret', memberCount: 2, rows: [
      { uid: 'u1', name: 'Mette', points: 148, rank: 1 },
      { uid: 'u3', name: 'Anders', points: 137, rank: 2 },
    ] }],
  };
  const html = renderThankYouEmail(data);
  it('indeholder verdensmester, Golden Boot, holdet og ligaen', () => {
    expect(html).toContain('Verdensmester 2026');
    expect(html).toContain('Frankrig'); // teamName(FRA)
    expect(html).toContain('Golden Boot');
    expect(html).toContain('Mbappe');
    expect(html).toContain('Turneringens hold');
    expect(html).toContain('Kontoret');
    expect(html).toContain('Anders');
  });
  it('fremhæver vinderen (🥇) og modtageren (· dig)', () => {
    expect(html).toContain('🥇');
    expect(html).toContain('· dig');
  });
  it('er en komplet HTML-mail', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});

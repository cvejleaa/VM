import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { leagueStandings, renderThankYouEmail, normalizeScoring } = require('./thankYouEmail');

describe('normalizeScoring', () => {
  it('udfylder manglende nøgler fra standard', () => {
    expect(normalizeScoring({ scoring: { group: false } })).toEqual({
      group: false, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: false,
    });
  });
  it('oversætter gammelt format-felt', () => {
    expect(normalizeScoring({ format: 'bonusOnly' })).toMatchObject({ group: false, knockout: false, bonus: true, leagueBonus: true });
    expect(normalizeScoring({ format: 'doubleKnockout' })).toMatchObject({ knockout: true, doubleKnockout: true });
  });
  it('uden scoring/format → alt tæller', () => {
    expect(normalizeScoring({})).toEqual({ group: true, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: false });
  });
});

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
  it('giver delt placering ved lige point (begge får den bedste)', () => {
    const members = {
      a: { displayName: 'Nada', groupPoints: 312, knockoutPoints: 0, bonusPoints: 0 },
      b: { displayName: 'Bibamus', groupPoints: 309, knockoutPoints: 0, bonusPoints: 0 },
      c: { displayName: 'Valentina', groupPoints: 309, knockoutPoints: 0, bonusPoints: 0 },
      d: { displayName: 'Sidste', groupPoints: 300, knockoutPoints: 0, bonusPoints: 0 },
    };
    const league = { name: 'ITFL', memberUids: ['a', 'b', 'c', 'd'], scoring: { group: true, knockout: false, bonus: false } };
    const std = leagueStandings(league, members);
    // 312 → 1, 309+309 → begge 2, 300 → 4 (standard konkurrence-rangering)
    expect(std.rows.map((r) => [r.name, r.rank])).toEqual([
      ['Nada', 1], ['Bibamus', 2], ['Valentina', 2], ['Sidste', 4],
    ]);
  });
  it('springer ukendte medlemmer over', () => {
    const league = { name: 'X', memberUids: ['u1', 'ghost'], scoring: { group: true, knockout: true, bonus: true } };
    const std = leagueStandings(league, membersById);
    expect(std.rows).toHaveLength(1);
    expect(std.rows[0].name).toBe('Mette');
  });
  it('lægger liga-bonus til når ligaen bruger den', () => {
    const league = { name: 'K', memberUids: ['u1', 'u2', 'u3'], scoring: { group: true, knockout: true, bonus: true, leagueBonus: true } };
    // u3 (137) får +15 liga-bonus → 152, overhaler Mette (148) og Jonas (141).
    const std = leagueStandings(league, membersById, { u3: 15, u2: 2 });
    expect(std.rows.map((r) => [r.name, r.points])).toEqual([
      ['Anders', 152], ['Mette', 148], ['Jonas', 143],
    ]);
  });
  it('bruger gammelt format-felt (doubleKnockout fordobler slutspil)', () => {
    // format doubleKnockout → group + knockout×2 + bonus. u2: 90 + 45×2 + 6 = 186.
    const league = { name: 'Legacy', memberUids: ['u1', 'u2'], format: 'doubleKnockout' };
    const std = leagueStandings(league, membersById);
    expect(std.rows.find((r) => r.name === 'Jonas').points).toBe(186);
    expect(std.rows.find((r) => r.name === 'Mette').points).toBe(188); // 100 + 40×2 + 8
  });
  it('ignorerer liga-bonus når scoring.leagueBonus er slået fra', () => {
    const league = { name: 'K', memberUids: ['u1', 'u3'], scoring: { group: true, knockout: true, bonus: true, leagueBonus: false } };
    const std = leagueStandings(league, membersById, { u3: 99 });
    expect(std.rows.find((r) => r.name === 'Anders').points).toBe(137); // uændret
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
    leagues: [{ name: 'Kontoret', memberCount: 3, rows: [
      { uid: 'u1', name: 'Mette', points: 148, rank: 1 },
      { uid: 'u2', name: 'Jonas', points: 141, rank: 2 },
      { uid: 'u3', name: 'Anders', points: 137, rank: 3 },
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
  it('markerer top 3 med medaljer og modtageren (· dig)', () => {
    expect(html).toContain('🥇');
    expect(html).toContain('🥈');
    expect(html).toContain('🥉');
    expect(html).toContain('· dig');
  });
  it('slutbemærkningen er "Vi ses måske til næste slutrunde!"', () => {
    expect(html).toContain('Vi ses måske til næste slutrunde!');
  });
  it('viser forlænget spilletid i finale-linjen', () => {
    const etHtml = renderThankYouEmail({ ...data, champion: { champion: 'ESP', runnerUp: 'ARG', score: '1–0', champScore: 1, otherScore: 0, extraTime: true, decidedOnPenalties: false, penalties: null } });
    expect(etHtml).toContain('efter forlænget spilletid');
    expect(etHtml).toContain('1–0');
  });
  it('er en komplet HTML-mail', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});

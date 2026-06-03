/**
 * Tests for rene hjælpefunktioner i standingsUtils.js.
 */
import { describe, it, expect } from 'vitest';
import {
  getTodayInCPH,
  filterByMembers,
  sortByPoints,
  computeDailyPoints,
} from './standingsUtils';

// ── getTodayInCPH ────────────────────────────────────────────────────────────
describe('getTodayInCPH', () => {
  it('returnerer en streng i YYYY-MM-DD format', () => {
    const result = getTodayInCPH();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepterer en eksplicit now-dato', () => {
    const date = new Date('2026-06-15T12:00:00Z');
    const result = getTodayInCPH(date);
    // Europa/Kkøbenhavn er UTC+2 om sommeren → stadig 2026-06-15
    expect(result).toBe('2026-06-15');
  });
});

// ── filterByMembers ──────────────────────────────────────────────────────────
describe('filterByMembers', () => {
  const users = [
    { uid: 'a' }, { uid: 'b' }, { uid: 'c' },
  ];

  it('returnerer alle brugere når memberUids er null', () => {
    expect(filterByMembers(users, null)).toHaveLength(3);
  });

  it('returnerer alle brugere når memberUids er tom liste', () => {
    expect(filterByMembers(users, [])).toHaveLength(3);
  });

  it('filtrerer til kun de angivne uid-er', () => {
    const result = filterByMembers(users, ['a', 'c']);
    expect(result).toHaveLength(2);
    expect(result.map((u) => u.uid)).toEqual(expect.arrayContaining(['a', 'c']));
  });

  it('returnerer tom liste hvis ingen matcher', () => {
    expect(filterByMembers(users, ['z'])).toHaveLength(0);
  });
});

// ── sortByPoints ─────────────────────────────────────────────────────────────
describe('sortByPoints', () => {
  it('sorterer faldende efter totalPoints', () => {
    const users = [
      { uid: 'a', totalPoints: 10 },
      { uid: 'b', totalPoints: 30 },
      { uid: 'c', totalPoints: 20 },
    ];
    const sorted = sortByPoints(users);
    expect(sorted[0].uid).toBe('b');
    expect(sorted[1].uid).toBe('c');
    expect(sorted[2].uid).toBe('a');
  });

  it('behandler manglende totalPoints som 0', () => {
    const users = [{ uid: 'a', totalPoints: 5 }, { uid: 'b' }];
    const sorted = sortByPoints(users);
    expect(sorted[0].uid).toBe('a');
  });

  it('muterer ikke input-arrayet', () => {
    const users = [{ uid: 'a', totalPoints: 5 }, { uid: 'b', totalPoints: 10 }];
    const copy = [...users];
    sortByPoints(users);
    expect(users).toEqual(copy);
  });
});

// ── computeDailyPoints ───────────────────────────────────────────────────────
describe('computeDailyPoints', () => {
  const todayStr = '2026-06-15';

  // Hjælpefunktion til at lave Timestamp-lignende objekt
  const ts = (dateStr) => ({
    toDate: () => new Date(`${dateStr}T12:00:00Z`),
  });

  const matches = [
    {
      id: 'match-1',
      status: 'finished',
      kickoff: ts('2026-06-15'),
      round: 'group',
      result: { home: 2, away: 1 },
    },
    {
      id: 'match-2',
      status: 'finished',
      kickoff: ts('2026-06-14'), // i går → ikke talt med
      round: 'group',
      result: { home: 0, away: 0 },
    },
    {
      id: 'match-3',
      status: 'scheduled', // ikke finished
      kickoff: ts('2026-06-15'),
      round: 'group',
      result: null,
    },
  ];

  const bets = [
    // Korrekt score for match-1 → 5 point (EXACT)
    { uid: 'player-1', matchId: 'match-1', home: 2, away: 1 },
    // Korrekt udfald, forkert score → 2 point (OUTCOME)
    { uid: 'player-2', matchId: 'match-1', home: 3, away: 1 },
    // Bet på gårsdagens kamp (tæller ikke)
    { uid: 'player-1', matchId: 'match-2', home: 0, away: 0 },
    // Bet på ikke-finished kamp (tæller ikke)
    { uid: 'player-1', matchId: 'match-3', home: 1, away: 0 },
  ];

  it('returnerer korrekte point for dagens kampe', () => {
    const result = computeDailyPoints(matches, bets, todayStr);
    expect(result['player-1']).toBe(5); // EXACT på match-1
    expect(result['player-2']).toBe(2); // OUTCOME på match-1
  });

  it('medtager ikke bets fra andre datoer', () => {
    const result = computeDailyPoints(matches, bets, todayStr);
    // player-1's bet på match-2 bør ikke tælle
    expect(result['player-1']).toBe(5); // kun match-1
  });

  it('returnerer tomt objekt hvis ingen matches matcher datoen', () => {
    const result = computeDailyPoints(matches, bets, '2099-01-01');
    expect(result).toEqual({});
  });

  it('returnerer tomt objekt ved tomme input', () => {
    expect(computeDailyPoints([], [], todayStr)).toEqual({});
    expect(computeDailyPoints(matches, [], todayStr)).toEqual({});
  });

  it('summerer point fra flere kampe samme dag', () => {
    const multiMatches = [
      ...matches,
      {
        id: 'match-4',
        status: 'finished',
        kickoff: ts('2026-06-15'),
        round: 'group',
        result: { home: 1, away: 1 },
      },
    ];
    const multiBets = [
      ...bets,
      // player-1 tipper korrekt udfald (uafgjort) → 5 point (EXACT)
      { uid: 'player-1', matchId: 'match-4', home: 1, away: 1 },
    ];
    const result = computeDailyPoints(multiMatches, multiBets, todayStr);
    expect(result['player-1']).toBe(10); // 5 + 5
  });
});

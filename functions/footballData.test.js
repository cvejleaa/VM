import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  mapStatus, extractScore, parseRateLimit, createClient,
  mapScorers, summarizeScorers, summarizeMatchDetail, summarizeStandings,
} = require('./footballData');

function makeRes(status, body, headerEntries = []) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(headerEntries),
    json: async () => body,
  };
}

describe('mapStatus', () => {
  it('kortlægger live/finished/scheduled', () => {
    expect(mapStatus('IN_PLAY')).toBe('live');
    expect(mapStatus('PAUSED')).toBe('live');
    expect(mapStatus('FINISHED')).toBe('finished');
    expect(mapStatus('AWARDED')).toBe('finished');
    expect(mapStatus('TIMED')).toBe('scheduled');
    expect(mapStatus('SCHEDULED')).toBe('scheduled');
    expect(mapStatus('SUSPENDED')).toBe('scheduled');
  });
});

describe('extractScore', () => {
  it('udtrækker fuldtidsscore + vinder', () => {
    expect(extractScore({ score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }))
      .toEqual({ home: 2, away: 1, winner: 'HOME_TEAM' });
  });
  it('returnerer null uden score', () => {
    expect(extractScore({ score: { fullTime: { home: null, away: null } } })).toBeNull();
    expect(extractScore({})).toBeNull();
  });
});

describe('parseRateLimit', () => {
  it('læser headere fra et Map-lignende objekt', () => {
    const h = new Map([['X-Requests-Available-Minute', '12'], ['X-RequestCounter-Reset', '34']]);
    expect(parseRateLimit(h)).toEqual({ available: 12, resetSeconds: 34 });
  });
  it('læser headere fra et almindeligt objekt', () => {
    expect(parseRateLimit({ 'X-Requests-Available-Minute': '5' }))
      .toEqual({ available: 5, resetSeconds: null });
  });
});

describe('createClient', () => {
  it('henter data og throttler ikke når der er rigeligt tilbage', async () => {
    const sleepImpl = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn(async () => makeRes(200, { matches: [] }, [
      ['X-Requests-Available-Minute', '50'], ['X-RequestCounter-Reset', '30'],
    ]));
    const client = createClient({ token: 't', fetchImpl, sleepImpl });
    const data = await client.getMatchesInRange('2026-06-11', '2026-06-11');
    expect(data).toEqual({ matches: [] });
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Sender auth-header
    expect(fetchImpl.mock.calls[0][1].headers['X-Auth-Token']).toBe('t');
  });

  it('venter når kvoten er ved at være brugt', async () => {
    const sleepImpl = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn(async () => makeRes(200, { ok: true }, [
      ['X-Requests-Available-Minute', '1'], ['X-RequestCounter-Reset', '5'],
    ]));
    const client = createClient({ token: 't', fetchImpl, sleepImpl, minRemaining: 3 });
    await client.getSeasonMatches(2026);
    expect(sleepImpl).toHaveBeenCalledWith(6000); // (5 + 1) * 1000
  });

  it('respekterer 429 og prøver igen efter reset', async () => {
    const sleepImpl = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(makeRes(429, {}, [['X-RequestCounter-Reset', '2']]))
      .mockResolvedValueOnce(makeRes(200, { matches: [1] }, [
        ['X-Requests-Available-Minute', '50'], ['X-RequestCounter-Reset', '30'],
      ]));
    const client = createClient({ token: 't', fetchImpl, sleepImpl });
    const data = await client.getMatchesInRange('a', 'b');
    expect(data).toEqual({ matches: [1] });
    expect(sleepImpl).toHaveBeenCalledWith(3000); // (2 + 1) * 1000
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('kaster ved vedvarende fejlstatus', async () => {
    const fetchImpl = vi.fn(async () => makeRes(403, {}));
    const client = createClient({ token: 't', fetchImpl, sleepImpl: vi.fn(() => Promise.resolve()) });
    await expect(client.getSeasonMatches(2026)).rejects.toThrow(/403/);
  });
});

describe('mapScorers', () => {
  const data = {
    scorers: [
      { player: { id: 1, name: 'Haaland', nationality: 'Norway' }, team: { id: 9, name: 'Norway' }, goals: 6, assists: 2, penalties: 1 },
      { player: { id: 2, name: 'Mbappé' }, team: { id: 4, name: 'France' }, goals: 5 },
    ],
  };

  it('normaliserer med rank og talfelter', () => {
    const list = mapScorers(data);
    expect(list[0]).toMatchObject({ rank: 1, playerName: 'Haaland', teamName: 'Norway', goals: 6, assists: 2, penalties: 1 });
    expect(list[1]).toMatchObject({ rank: 2, playerName: 'Mbappé', goals: 5, assists: null, penalties: null });
  });

  it('håndterer tomt/manglende svar', () => {
    expect(mapScorers(null)).toEqual([]);
    expect(mapScorers({})).toEqual([]);
  });

  it('summarizeScorers rapporterer felt-tilgængelighed', () => {
    const s = summarizeScorers(data);
    expect(s).toMatchObject({ count: 2, hasAssists: true, hasPenalties: true, hasNationality: true });
    expect(s.sample).toEqual({ playerName: 'Haaland', goals: 6 });
  });

  it('summarizeScorers: assists/penalties falske når de mangler', () => {
    const s = summarizeScorers({ scorers: [{ player: { name: 'X' }, team: { name: 'Y' }, goals: 1 }] });
    expect(s).toMatchObject({ count: 1, hasAssists: false, hasPenalties: false, hasNationality: false });
  });
});

describe('summarizeMatchDetail', () => {
  it('rapporterer detaljefelter (udpakker { match }, inkl. opstillinger)', () => {
    const m = { match: {
      goals: [{ minute: 23, scorer: { name: 'A' } }],
      bookings: [], referees: [{ name: 'Dommer' }],
      homeTeam: { lineup: [{ name: 'Keeper' }] },
      score: { halfTime: { home: 1, away: 0 }, penalties: { home: 4, away: 3 } },
      attendance: 50000, venue: 'Stadion',
    } };
    expect(summarizeMatchDetail(m)).toMatchObject({
      hasGoals: true, hasLineups: true, hasBookings: false, hasReferees: true,
      hasHalfTime: true, hasPenaltiesScore: true, attendance: 50000, venue: 'Stadion',
    });
  });

  it('håndterer fladt match-objekt og manglende felter', () => {
    expect(summarizeMatchDetail({ score: {} })).toMatchObject({
      hasGoals: false, hasLineups: false, hasHalfTime: false, hasPenaltiesScore: false,
    });
  });
});

describe('summarizeStandings', () => {
  it('rapporterer form og målforskel', () => {
    const data = { standings: [{ table: [{ form: 'WWD', goalDifference: 4 }] }] };
    expect(summarizeStandings(data)).toEqual({ tableCount: 1, hasForm: true, hasGoalDiff: true });
  });
  it('håndterer tomt', () => {
    expect(summarizeStandings({})).toEqual({ tableCount: 0, hasForm: false, hasGoalDiff: false });
  });
});

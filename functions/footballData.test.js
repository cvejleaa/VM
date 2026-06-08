import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  mapStatus, extractScore, parseRateLimit, createClient,
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

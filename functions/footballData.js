// ---------------------------------------------------------------------------
// footballData.js — tynd klient til football-data.org (v4) + rene hjælpere.
//
// VIGTIGT (på opfordring fra football-data.org): klienten læser rate-limit-
// headerne (X-Requests-Available-Minute / X-RequestCounter-Reset) og throttler
// selv, så vi ikke rammer grænsen. Ét kald pr. synk-tick holder os langt under
// 30 kald/min.
// ---------------------------------------------------------------------------
'use strict';

// FIFA-VM hos football-data.org bruger konkurrencekoden "WC".
const COMPETITION_CODE = process.env.FD_COMPETITION || 'WC';
const BASE = 'https://api.football-data.org/v4';

// Statusser hvor vi IKKE skriver resultatet blindt, men beder admin kigge.
const REVIEW_STATUSES = new Set(['SUSPENDED', 'POSTPONED', 'CANCELLED', 'AWARDED']);

/** Kortlæg football-data.org-status → vores match-status. */
function mapStatus(fdStatus) {
  switch (fdStatus) {
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    case 'FINISHED':
    case 'AWARDED':
      return 'finished';
    default: // SCHEDULED, TIMED, POSTPONED, SUSPENDED, CANCELLED
      return 'scheduled';
  }
}

/** Udtræk fuldtidsscore. Returnerer { home, away, winner } eller null. */
function extractScore(fdMatch) {
  const ft = fdMatch && fdMatch.score && fdMatch.score.fullTime;
  if (!ft || ft.home == null || ft.away == null) return null;
  return {
    home: Number(ft.home),
    away: Number(ft.away),
    winner: (fdMatch.score && fdMatch.score.winner) || null, // HOME_TEAM | AWAY_TEAM | DRAW | null
  };
}

/** Læs rate-limit-headere fra et Response.headers (eller almindeligt objekt). */
function parseRateLimit(headers) {
  const get = (k) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(k);
    return headers[k] != null ? headers[k] : headers[k.toLowerCase()];
  };
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  return {
    available: toNum(get('X-Requests-Available-Minute')),
    resetSeconds: toNum(get('X-RequestCounter-Reset')),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Opret en klient. fetch/sleep injiceres for testbarhed.
 * @param {{token:string, fetchImpl?:Function, sleepImpl?:Function, minRemaining?:number}} opts
 */
function createClient({ token, fetchImpl, sleepImpl = sleep, minRemaining = 3 } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) throw new Error('Ingen fetch tilgængelig (kræver Node 18+ eller injiceret fetch).');

  async function request(path) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await doFetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': token } });
      const rl = parseRateLimit(res.headers);

      if (res.status === 429) {
        // Ramt grænsen — vent til counteren nulstilles, og prøv igen.
        const wait = (rl.resetSeconds != null ? rl.resetSeconds : 60) + 1;
        await sleepImpl(wait * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`football-data ${res.status}`);

      const data = await res.json();

      // Defensiv throttling: er vi tæt på grænsen, så vent til reset før næste kald.
      if (rl.available != null && rl.available <= minRemaining && rl.resetSeconds != null) {
        await sleepImpl((rl.resetSeconds + 1) * 1000);
      }
      return data;
    }
    throw new Error('football-data: gav op efter gentagne 429-svar.');
  }

  return {
    competitionCode: COMPETITION_CODE,
    getMatchesInRange: (dateFrom, dateTo, code = COMPETITION_CODE) =>
      request(`/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    getSeasonMatches: (season, code = COMPETITION_CODE) =>
      request(`/competitions/${code}/matches?season=${season}`),
  };
}

module.exports = {
  COMPETITION_CODE, BASE, REVIEW_STATUSES,
  mapStatus, extractScore, parseRateLimit, createClient,
};

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

/** Udtræk fuldtidsscore. Returnerer { home, away, winner } eller null.
 *  Bemærk: football-data v4's `fullTime` er resultatet efter ordinær/forlænget
 *  tid og INDEHOLDER IKKE straffesparkene. Ved straffesparkskonkurrence er
 *  `fullTime` typisk uafgjort, mens `score.winner` peger på den der gik videre —
 *  derfor bruges `winner` til knockout-"advance" (se decideUpdate). */
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
  const doFetch = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);
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
    getScorers: (limit = 20, code = COMPETITION_CODE) =>
      request(`/competitions/${code}/scorers?limit=${limit}`),
    getStandings: (code = COMPETITION_CODE) =>
      request(`/competitions/${code}/standings`),
    getCompetition: (code = COMPETITION_CODE) =>
      request(`/competitions/${code}`),
    getMatch: (id) => request(`/matches/${id}`),
  };
}

/**
 * Normalisér football-data /scorers-svaret til en kompakt liste til leaderboard.
 * Robust over for manglende felter (assists/penalties findes ikke på alle tiers).
 * @param {object} data  – rå respons fra getScorers()
 * @returns {Array<object>}
 */
function mapScorers(data) {
  const arr = (data && Array.isArray(data.scorers)) ? data.scorers : [];
  return arr.map((s, i) => ({
    rank: i + 1,
    playerId: s.player?.id ?? null,
    playerName: s.player?.name ?? '(ukendt)',
    nationality: s.player?.nationality ?? null,
    teamId: s.team?.id ?? null,
    teamName: s.team?.name ?? null,
    goals: Number(s.goals ?? 0),
    assists: s.assists != null ? Number(s.assists) : null,
    penalties: s.penalties != null ? Number(s.penalties) : null,
  }));
}

/** Findes mindst ét element i listen med et udfyldt (ikke-null) felt? */
function anyHas(list, key) {
  return Array.isArray(list) && list.some((x) => x && x[key] != null);
}

/** Kompakt felt-rapport for /scorers (til tier-verificering). */
function summarizeScorers(data) {
  const list = mapScorers(data);
  return {
    count: list.length,
    hasAssists: anyHas(list, 'assists'),
    hasPenalties: anyHas(list, 'penalties'),
    hasNationality: anyHas(list, 'nationality'),
    sample: list[0] ? { playerName: list[0].playerName, goals: list[0].goals } : null,
  };
}

/** Kompakt felt-rapport for et /matches/{id}-svar (til tier-verificering). */
function summarizeMatchDetail(m) {
  const match = (m && m.match) ? m.match : m; // v4 pakker nogle gange i { match: {...} }
  const score = (match && match.score) || {};
  return {
    hasGoals: Array.isArray(match?.goals) && match.goals.length > 0,
    hasBookings: Array.isArray(match?.bookings) && match.bookings.length > 0,
    hasSubstitutions: Array.isArray(match?.substitutions) && match.substitutions.length > 0,
    hasReferees: Array.isArray(match?.referees) && match.referees.length > 0,
    hasHalfTime: score.halfTime?.home != null,
    hasExtraTime: score.extraTime?.home != null,
    hasPenaltiesScore: score.penalties?.home != null,
    hasHead2Head: !!match?.head2head,
    attendance: match?.attendance ?? null,
    venue: match?.venue ?? null,
  };
}

/** Kompakt felt-rapport for /standings (til tier-verificering). */
function summarizeStandings(data) {
  const tables = Array.isArray(data?.standings) ? data.standings : [];
  const firstRow = tables[0]?.table?.[0] || null;
  return {
    tableCount: tables.length,
    hasForm: firstRow ? firstRow.form != null : false,
    hasGoalDiff: firstRow ? firstRow.goalDifference != null : false,
  };
}

module.exports = {
  COMPETITION_CODE, BASE, REVIEW_STATUSES,
  mapStatus, extractScore, parseRateLimit, createClient,
  mapScorers, summarizeScorers, summarizeMatchDetail, summarizeStandings,
};

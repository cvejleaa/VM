// ---------------------------------------------------------------------------
// fifaData.js — tynd HTTP-klient til FIFA's offentlige data-API. INGEN nøgle
// kræves (samme kilde som fifa.com bruger). Ren mapping ligger i fifaMap.js.
//
// Endpoints (v3):
//   GET /calendar/matches?language=en&count=N&idSeason={S}   kampprogram+resultat
//   GET /live/football/{matchId}?language=en                 kampdetaljer
//   GET /timelines/{matchId}?language=en                     hændelses-tidslinje
//   GET /calendar/{comp}/{season}/{stage}/standing?...       gruppestilling
//
// IDs for VM 2026: idCompetition=17, idSeason=285023 (kan overstyres via env).
// ---------------------------------------------------------------------------
'use strict';

const BASE = 'https://api.fifa.com/api/v3';
const ID_COMPETITION = process.env.FIFA_COMPETITION || '17';
const ID_SEASON = process.env.FIFA_SEASON || '285023';

// FIFA's edge afviser nogle gange kald uden en browser-agtig User-Agent.
const UA = 'Mozilla/5.0 (compatible; VM2026Tip/1.0; +https://vm.vejleaa.dk)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Opret en FIFA-klient. fetch/sleep injiceres for testbarhed.
 * @param {{fetchImpl?:Function, sleepImpl?:Function, competition?:string, season?:string}} opts
 */
function createFifaClient({ fetchImpl, sleepImpl = sleep, competition = ID_COMPETITION, season = ID_SEASON } = {}) {
  const doFetch = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);
  if (!doFetch) throw new Error('Ingen fetch tilgængelig (kræver Node 18+ eller injiceret fetch).');

  async function request(path) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await doFetch(`${BASE}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      });
      if (res.status === 429 || res.status === 503) {
        await sleepImpl((attempt + 1) * 2000); // simpel backoff
        continue;
      }
      if (!res.ok) throw new Error(`FIFA ${res.status} for ${path}`);
      return res.json();
    }
    throw new Error(`FIFA: gav op efter gentagne fejl for ${path}`);
  }

  return {
    competition,
    season,
    // Alle kampe i sæsonen. count sat højt nok til at få hele VM (104 kampe) i ét kald.
    getSeasonMatches: ({ count = 500, from = null, to = null } = {}) => {
      let q = `?language=en&count=${count}&idSeason=${season}&idCompetition=${competition}`;
      if (from) q += `&from=${from}`;
      if (to) q += `&to=${to}`;
      return request(`/calendar/matches${q}`);
    },
    // Fuld kampdetalje (opstilling, mål, kort, udskiftninger).
    getMatch: (matchId) => request(`/live/football/${matchId}?language=en`),
    // Hændelses-tidslinje (mål m. periode → eksakt 90-min).
    getTimeline: (matchId) => request(`/timelines/${matchId}?language=en`),
    // Gruppestilling for et stage.
    getStandings: (stageId) => request(`/calendar/${competition}/${season}/${stageId}/standing?language=en&count=200`),
  };
}

module.exports = { createFifaClient, BASE, ID_COMPETITION, ID_SEASON };

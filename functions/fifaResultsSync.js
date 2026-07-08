// ---------------------------------------------------------------------------
// fifaResultsSync.js — ren beslutningslogik for auto-resultater fra FIFA.
// Parallel til resultsSync.js (football-data), men bygger på FIFA's felter.
// INGEN netværk/Firebase — testbar isoleret. Producerer SAMME patch-form som
// resultsSync.decideUpdate, så den kan overtage synken uændret for resten af appen.
//
// FIFA-fordele udnyttet her:
//  • Eksakt 90-min for knockout (fifaScoringResult via tidslinjens Period) → vi
//    kan sætte det endelige ordinære resultat OG markere det bekræftet med det
//    samme (koSyncVersion), uden en separat heal-runde som ved football-data.
//  • ResultType siger eksplicit ordinær/forlænget tid/straffe.
// ---------------------------------------------------------------------------
'use strict';

const { fifaScoringResult } = require('./fifaMap');

/**
 * Beslut hvad der skal skrives for én kamp ud fra FIFA-data.
 * @param {object}  ourMatch   vores kamp-doc ({round, status, result, manualLock})
 * @param {object}  fm         mappet FIFA-kamp (fifaMap.mapCalendarMatch)
 * @param {object}  [timeline] /timelines/{id} (kræves for knockout på ET/straffe)
 * @param {{now?:Date, koSyncVersion?:number}} [opts]
 * @returns {{action:'skip'|'review'|'live'|'finish', patch?:object, reason?:string}}
 */
function decideFifaUpdate(ourMatch, fm, timeline, { now = null, koSyncVersion = null } = {}) {
  if (!ourMatch || !fm) return { action: 'skip', reason: 'missing' };
  if (ourMatch.manualLock) return { action: 'skip', reason: 'manualLock' };

  const status = fm.status; // 'finished' | 'scheduled' | 'pendingTeams' | 'live'
  if (status === 'scheduled' || status === 'pendingTeams') {
    return { action: 'skip', reason: 'not-started' };
  }

  const isKnockout = ourMatch.round && ourMatch.round !== 'group';
  const orient = (res) => {
    // Vend FIFA-resultatet til VORES hjemme/ude-orientering hvis byttet om.
    if (!res) return res;
    if (ourMatch.homeTeam && fm.awayTeam && ourMatch.homeTeam === fm.awayTeam && ourMatch.homeTeam !== fm.homeTeam) {
      return { home: res.away, away: res.home, ...(res.advance ? { advance: res.advance } : {}) };
    }
    return res;
  };

  if (status === 'live') {
    if (fm.homeScore == null || fm.awayScore == null) return { action: 'skip', reason: 'no-live-score' };
    const s = orient({ home: fm.homeScore, away: fm.awayScore });
    return { action: 'live', patch: { result: { home: s.home, away: s.away }, status: 'live', resultSource: 'auto', autoUpdatedAt: now } };
  }

  // status === 'finished'
  // Knockout allerede afsluttet hos os → rør ikke (vi ejer 90-min-resultatet).
  if (isKnockout && ourMatch.status === 'finished') {
    return { action: 'skip', reason: 'knockout-finished' };
  }

  let scoring = fifaScoringResult(fm, timeline);
  if (!scoring) {
    // Knockout på ET/straffe uden tidslinje → vi kan ikke udlede 90-min endnu.
    return { action: 'review', patch: { needsReview: true, providerStatus: `resultType=${fm.resultType}`, autoUpdatedAt: now } };
  }
  scoring = orient(scoring);

  const result = { home: scoring.home, away: scoring.away };
  let needsReview = false;
  if (isKnockout) {
    if (scoring.advance) result.advance = scoring.advance;
    else needsReview = true; // uafgjort/uklar vinder → admin afgør "videre"
  }
  const patch = { result, status: 'finished', resultSource: 'auto', autoUpdatedAt: now };
  // FIFA giver eksakt 90-min → marker knockout-resultatet som bekræftet med det samme.
  if (isKnockout && koSyncVersion != null) patch.koSyncVersion = koSyncVersion;
  if (needsReview) patch.needsReview = true;
  return { action: 'finish', patch };
}

module.exports = { decideFifaUpdate };

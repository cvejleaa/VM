// ---------------------------------------------------------------------------
// resultsSync.js — ren beslutnings- og mapningslogik for auto-resultater.
// Ingen Firebase/HTTP — nem at teste isoleret.
// ---------------------------------------------------------------------------
'use strict';

const { mapStatus, extractScore, REVIEW_STATUSES } = require('./footballData');

/** Normalisér navn/kode til sammenligning (accenter væk, kun a-z0-9). */
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Passer et football-data-hold til vores 3-bogstavskode? */
function teamCodeMatches(ourCode, fdTeam) {
  const c = norm(ourCode);
  if (!c || !fdTeam) return false;
  if (norm(fdTeam.tla) === c) return true;
  const name = norm(fdTeam.name);
  const short = norm(fdTeam.shortName);
  return (!!name && name.startsWith(c)) || (!!short && short.startsWith(c));
}

/** UTC-dato (YYYY-MM-DD) for et tidspunkt (ms/ISO/Date). */
function utcDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** kickoff (Timestamp/Date/ms/ISO) → ms. */
function kickoffMs(kickoff) {
  if (!kickoff) return NaN;
  if (typeof kickoff.toDate === 'function') return kickoff.toDate().getTime();
  const d = new Date(kickoff);
  return d.getTime();
}

/**
 * Find football-data-kampen der svarer til en af vores kampe (samme UTC-dato +
 * begge hold matcher). Returnerer fd-kampen eller null.
 */
function matchFixture(ourMatch, fdMatches) {
  if (!ourMatch || !ourMatch.homeTeam || !ourMatch.awayTeam) return null;
  const ourDay = utcDate(kickoffMs(ourMatch.kickoff));
  if (!ourDay) return null;
  for (const fd of fdMatches || []) {
    if (utcDate(fd.utcDate) !== ourDay) continue;
    const direct = teamCodeMatches(ourMatch.homeTeam, fd.homeTeam) && teamCodeMatches(ourMatch.awayTeam, fd.awayTeam);
    if (direct) return fd;
  }
  return null;
}

/** football-data-vinder ('HOME_TEAM'/'AWAY_TEAM') → vores holdkode. */
function winnerToCode(winner, ourMatch) {
  if (winner === 'HOME_TEAM') return ourMatch.homeTeam || null;
  if (winner === 'AWAY_TEAM') return ourMatch.awayTeam || null;
  return null;
}

/**
 * Beslut hvad der skal skrives for én kamp ud fra football-data-svaret.
 * @returns {{action:'skip'|'review'|'live'|'finish', patch?:object, reason?:string}}
 */
function decideUpdate(ourMatch, fdMatch, now = new Date()) {
  if (!ourMatch || !fdMatch) return { action: 'skip', reason: 'missing' };
  if (ourMatch.manualLock) return { action: 'skip', reason: 'manualLock' };

  const fdStatus = fdMatch.status;

  // Afbrudt/udsat/aflyst → skriv ikke score, bed admin kigge.
  if (REVIEW_STATUSES.has(fdStatus) && fdStatus !== 'AWARDED') {
    return { action: 'review', patch: { needsReview: true, providerStatus: fdStatus, autoUpdatedAt: now } };
  }

  const ourStatus = mapStatus(fdStatus);
  if (ourStatus === 'scheduled') return { action: 'skip', reason: 'not-started' };

  const score = extractScore(fdMatch);
  if (!score) return { action: 'skip', reason: 'no-score' };

  const isKnockout = ourMatch.round && ourMatch.round !== 'group';

  if (ourStatus === 'finished') {
    const result = { home: score.home, away: score.away };
    let needsReview = fdStatus === 'AWARDED'; // tildelt resultat → bekræft manuelt
    if (isKnockout) {
      const advance = winnerToCode(score.winner, ourMatch);
      if (advance) result.advance = advance;
      else needsReview = true; // uafgjort/uklar vinder i knockout → admin afgør "videre"
    }
    const patch = { result, status: 'finished', resultSource: 'auto', autoUpdatedAt: now };
    if (needsReview) patch.needsReview = true;
    return { action: 'finish', patch };
  }

  // live — foreløbig score (ingen "advance" endnu)
  const patch = { result: { home: score.home, away: score.away }, status: 'live', resultSource: 'auto', autoUpdatedAt: now };
  return { action: 'live', patch };
}

/** Ændrer patch'en reelt dokumentet? (undgå unødige skrivninger/genberegninger). */
function patchChangesDoc(match, patch) {
  if (!patch) return false;
  if (patch.status && patch.status !== (match && match.status)) return true;
  if (patch.result) {
    const r = (match && match.result) || {};
    if (Number(r.home) !== Number(patch.result.home)) return true;
    if (Number(r.away) !== Number(patch.result.away)) return true;
    if ((r.advance || null) !== (patch.result.advance || null)) return true;
  }
  if (patch.needsReview && !(match && match.needsReview)) return true;
  return false;
}

module.exports = {
  norm, teamCodeMatches, utcDate, kickoffMs,
  matchFixture, winnerToCode, decideUpdate, patchChangesDoc,
};
